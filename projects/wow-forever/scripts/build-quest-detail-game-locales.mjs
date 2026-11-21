/** Pack Classic quest prose only when the current quest ID, title and English field match. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isRejectedNumericProse } from "./lib/rejected-numeric-prose.mjs";
import { correctReviewedQuestObjectiveCounts } from "./lib/reviewed-quest-objective-counts.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const classicRoot = process.argv[2] && resolve(process.argv[2]);
if (!classicRoot) throw new Error("Pass the pinned pfQuest checkout");
const revision = execFileSync("git", ["rev-parse", "HEAD"],
  { cwd: classicRoot, encoding: "utf8" }).trim();
if (revision !== "104f35678ca39ab1fb78b655f815cc7016f5e0c8") {
  throw new Error("Classic quest text revision changed");
}
const output = join(root, "public/data/locales/wow-forever");
const catalogRaw = await readFile(join(root, "public/data/quests/quest-details.json"), "utf8");
const catalog = JSON.parse(catalogRaw);
const normalize = (value) => value?.replace(/\$[Bb](?:\$[Bb])?/g, " ")
  .replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
const render = (value) => value.replace(/\$[Bb](?:\$[Bb])?/g, "\n\n")
  .replace(/\n{3,}/g, "\n\n").trim();
const parse = (content) => {
  const quests = new Map();
  let id;
  for (const line of content.split(/\r?\n/)) {
    const header = /^  \[(\d+)\] = \{$/.exec(line);
    if (header) { id = header[1]; quests.set(id, {}); continue; }
    const row = /^    \["([DOT])"\] = ("(?:\\.|[^"\\])*"),?$/.exec(line);
    if (row && id) try { quests.get(id)[row[1]] = JSON.parse(row[2].replace(/\\'/g, "'")); }
      catch { /* Exclude unsupported Lua escapes. */ }
    if (/^  \},?$/.test(line)) id = undefined;
  }
  return quests;
};
const englishRaw = await readFile(join(classicRoot, "db/enUS/quests.lua"), "utf8");
const english = parse(englishRaw);
const keys = [];
const values = [];
const fields = { description: "D", objective: "O" };
const reviewedTitleVariants = new Map([[
  "1425", { catalog: "Deliver the First Shipment", classic: "Deliver the Shipment" },
]]);
for (const [id, quest] of Object.entries(catalog.quests)) {
  const original = english.get(id);
  const variant = reviewedTitleVariants.get(id);
  const titleMatches = normalize(quest.title) === normalize(original?.T) ||
    (variant && quest.title === variant.catalog && original?.T === variant.classic);
  if (!original || !titleMatches) continue;
  for (const [field, short] of Object.entries(fields)) {
    if (!quest[field]?.trim() || normalize(quest[field]) !== normalize(original[short])) continue;
    keys.push(`${id}:${field}`);
    values.push(quest[field]);
  }
}
const source = { version: 1, keys, values, provenance: {
  catalogSha256: createHash("sha256").update(catalogRaw).digest("hex"),
  classicRepository: "https://github.com/shagu/pfQuest", classicRevision: revision,
  englishSha256: createHash("sha256").update(englishRaw).digest("hex"),
} };
const check = process.argv.includes("--check");
const write = async (name, value) => {
  const path = join(output, name);
  const serialized = JSON.stringify(value);
  if (check) {
    if (await readFile(path, "utf8") !== serialized) throw new Error(`${name} is stale`);
  } else await writeFile(path, serialized);
};
await write("quest-text-source.json", source);
const locales = { deDE: "deDE", esES: "esES", esMX: "esES", frFR: "frFR",
  koKR: "koKR", ptBR: "ptBR", zhCN: "zhCN", zhTW: "zhTW" };
for (const [locale, classicLocale] of Object.entries(locales)) {
  const localizedRaw = await readFile(join(classicRoot, `db/${classicLocale}/quests.lua`), "utf8");
  const localized = parse(localizedRaw);
  const translated = keys.map((key, index) => {
    const [id, field] = key.split(":");
    const value = localized.get(id)?.[fields[field]];
    if (!value || normalize(value) === normalize(values[index])) return null;
    const rendered = render(value);
    if (isRejectedNumericProse(id, locale, field, values[index], rendered)) return null;
    // Player, class, race and gender tokens need their own contextual rendering.
    if (/\$[A-Za-z]/.test(rendered) || /<NYI>/i.test(rendered)) return null;
    return field === "objective" ?
      correctReviewedQuestObjectiveCounts(id, locale, values[index], rendered) : rendered;
  });
  await write(`quest-text-${locale}.json`, { version: 1, values: translated,
    ...(locale === "esMX" ? { fallbackLocale: "esES" } : {}),
    sourceSha256: createHash("sha256").update(localizedRaw).digest("hex") });
  console.log(`${locale}: ${translated.filter(Boolean).length} verified quest prose fields`);
}
console.log(`${keys.length} current quest fields match the pinned English Classic text`);
await import("./apply-wowhead-map-quest-locales.mjs");
