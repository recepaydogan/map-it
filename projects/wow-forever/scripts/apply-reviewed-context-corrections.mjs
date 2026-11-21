/** Add context-checked spell corrections after rejecting the source tooltip variant. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { numbers } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await read("data/spell-tooltip-localization/reviewed-context-corrections.json");
if (catalog.version !== 1 || !Array.isArray(catalog.corrections)) {
  throw new Error("Invalid context corrections catalog");
}
const paths = {
  d: ["reviewed-overrides.json", "rejected-wowhead-candidates.json"],
  old: ["reviewed-classic-overrides.json", "rejected-wowhead-classic-candidates.json"],
};
const data = {};
for (const [field, [reviewedName, rejectedName]] of Object.entries(paths)) {
  const directory = "data/spell-tooltip-localization/";
  data[field] = { reviewedName: join(root, directory, reviewedName),
    reviewed: await read(directory + reviewedName),
    rejected: await read(directory + rejectedName) };
}
const seen = new Set();
let added = 0;
let existing = 0;
for (const correction of catalog.corrections) {
  const { field, id, locale, source, translation, basis } = correction;
  const key = `${field}:${id}:${locale}`;
  if (seen.has(key) || !data[field] || !Number.isSafeInteger(id) || id < 1 ||
    !/^(?:deDE|esES|esMX|frFR|koKR|ptBR|zhCN|zhTW)$/.test(locale) ||
    typeof source !== "string" || !source || typeof translation !== "string" ||
    !translation || translation === source || typeof basis !== "string" ||
    !basis || numbers(translation) !== numbers(source)) {
    throw new Error(`${key}: invalid correction`);
  }
  seen.add(key);
  const { reviewed, rejected } = data[field];
  const spell = reviewed.spells[id];
  if (!spell || spell.source !== source ||
    !rejected.entries[`${id}:${locale}`]) {
    throw new Error(`${key}: missing reviewed source or rejected tooltip variant`);
  }
  if (spell.locales[locale] && spell.locales[locale] !== translation) {
    throw new Error(`${key}: conflicts with a reviewed translation`);
  }
  if (spell.locales[locale]) existing++;
  else {
    spell.locales[locale] = translation;
    spell.correctionBasis ??= {};
    spell.correctionBasis[locale] = basis;
    added++;
  }
}
if (process.argv.includes("--apply")) {
  for (const { reviewedName, reviewed } of Object.values(data)) {
    await writeFile(reviewedName, `${JSON.stringify(reviewed, null, 2)}\n`);
  }
}
console.log(`${added} context corrections to add; ${existing} already present.`);
