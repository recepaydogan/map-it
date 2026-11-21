/** Match pinned Forever esMX names by entity ID, excluding ambiguous or malformed rows. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceFile = process.argv[2] && resolve(process.argv[2]);
if (!sourceFile) throw new Error("Pass the pinned Polestar esMX Names.lua path");
const expectedHash = "0145d6d197558bc1f93c449bb0ea0b716a795978d80eef961ff8952e18ee5891";
const content = await readFile(sourceFile, "utf8");
const hash = createHash("sha256").update(content).digest("hex");
if (hash !== expectedHash) throw new Error("Forever esMX names file differs from the reviewed revision");
const names = { quest: new Map(), npc: new Map() };
let kind;
for (const line of content.split(/\r?\n/)) {
  const chunk = /^R\("(quest|npc)", \d+, \d+, \[\[$/.exec(line);
  if (chunk) { kind = chunk[1]; continue; }
  if (line === "]])") { kind = undefined; continue; }
  const row = kind && /^(\d+)\t(.*)$/.exec(line);
  if (!row) continue;
  try { names[kind].set(Number(row[1]), decodeURIComponent(row[2])); }
  catch { /* Unreadable names are excluded. */ }
}
const verification = {
  repository: "https://github.com/fitzforge/polestar",
  revision: "1f5a2cfd221ce18f3333311562281e57f060070a",
  file: "addon/Polestar_esMX/Names.lua",
  sha256: hash,
  rule: "Use one unambiguous Forever esMX game name for every matching Classic entity ID",
  notices: ["third-party/polestar-esmx-license-data.txt",
    "third-party/polestar-license-exception.md"],
};
for (const [file, group, kindName, idKey] of [
  ["data/quest-title-localization/pfquest-classic-titles.json", "titles", "quest", "questIds"],
  ["data/npc-name-localization/pfquest-classic-names.json", "names", "npc", "npcIds"],
]) {
  const path = join(root, file);
  const catalog = JSON.parse(await readFile(path, "utf8"));
  let matched = 0;
  let regional = 0;
  for (const [english, record] of Object.entries(catalog[group])) {
    delete record["es-MX"];
    const values = new Set(record[idKey].map((id) => names[kindName].get(id)).filter(Boolean));
    if (values.size !== 1) continue;
    const value = [...values][0];
    if (!value || value === english || (value.match(/"/g) ?? []).length % 2 !== 0) continue;
    record["es-MX"] = value;
    matched += 1;
    if (value !== record.es) regional += 1;
  }
  catalog.esMXVerification = verification;
  const output = JSON.stringify(catalog, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (output !== await readFile(path, "utf8")) throw new Error(`${file}: esMX verification is stale`);
  } else await writeFile(path, output);
  console.log(`${group}: ${matched} esMX names by ID, ${regional} distinct regional forms`);
}
