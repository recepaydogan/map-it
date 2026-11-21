/** Render both Blizzard gender branches when the app cannot know the player's gender. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pfQuestRoot = process.argv[2] && resolve(process.argv[2]);
if (!pfQuestRoot) throw new Error("Pass the pinned pfQuest checkout");
const pinnedRevision = "104f35678ca39ab1fb78b655f815cc7016f5e0c8";
if (execFileSync("git", ["rev-parse", "HEAD"],
  { cwd: pfQuestRoot, encoding: "utf8" }).trim() !== pinnedRevision) {
  throw new Error("pfQuest revision differs from the quest locale source");
}
const directory = "public/data/locales/wow-forever";
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const source = await read(`${directory}/quest-text-source.json`);
const locales = { deDE: "deDE", esES: "esES", esMX: "esES", frFR: "frFR",
  koKR: "koKR", ptBR: "ptBR", zhCN: "zhCN" };
const parse = (content) => {
  const result = new Map();
  let id;
  for (const line of content.split(/\r?\n/)) {
    const header = /^  \[(\d+)\] = \{$/.exec(line);
    if (header) { id = header[1]; result.set(id, {}); continue; }
    const row = /^    \["([DOT])"\] = ("(?:\\.|[^"\\])*"),?$/.exec(line);
    if (row && id) try { result.get(id)[row[1]] = JSON.parse(row[2].replace(/\\'/g, "'")); }
      catch { /* Unsupported Lua escapes are excluded. */ }
    if (/^  \},?$/.test(line)) id = undefined;
  }
  return result;
};
const genderToken = /\$[gG]([^:;]+)[:;]([^;]+);/g;
const unterminatedGenderToken = /\$[gG]([^:;.!?]+):([^;.!?]+)(?=[.!?])/g;
const render = (value) => value.replace(/\$[Bb](?:\$[Bb])?/g, "\n\n")
  .replace(genderToken, (_, masculine, feminine) => `${masculine}/${feminine}`)
  .replace(unterminatedGenderToken, (_, masculine, feminine) => `${masculine}/${feminine}`)
  .replace(/\n{3,}/g, "\n\n").trim();
const normalize = (value) => value?.replace(/\$[Bb](?:\$[Bb])?/g, " ")
  .replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
const records = {};
for (const [locale, classicLocale] of Object.entries(locales)) {
  const pack = await read(`${directory}/quest-text-${locale}.json`);
  if (pack.version !== 1 || pack.values.length !== source.keys.length) {
    throw new Error(`${locale}: invalid quest text pack`);
  }
  const raw = await readFile(join(pfQuestRoot, `db/${classicLocale}/quests.lua`), "utf8");
  if (createHash("sha256").update(raw).digest("hex") !== pack.sourceSha256) {
    throw new Error(`${locale}: localized quest source changed`);
  }
  const quests = parse(raw);
  const translations = {};
  for (let index = 0; index < source.keys.length; index += 1) {
    if (pack.values[index]) continue;
    const key = source.keys[index];
    const [id, field] = key.split(":");
    const value = quests.get(id)?.[field === "description" ? "D" : "O"];
    if (!value || !/\$[gG]/.test(value) || normalize(value) === normalize(source.values[index])) continue;
    const translated = render(value);
    if (/\$[A-Za-z]/.test(translated) || /<NYI>/i.test(translated) ||
      translated === source.values[index]) continue;
    translations[key] = translated;
  }
  records[locale] = translations;
  console.log(`${locale}: ${Object.keys(translations).length} gender-aware quest prose fields`);
}
const path = join(root, "data/quest-text-localization/gender-variants.json");
const output = `${JSON.stringify({ version: 1, sourceRevision: pinnedRevision,
  locales: records }, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (await readFile(path, "utf8") !== output) throw new Error("Quest gender variants are stale");
} else await writeFile(path, output);
