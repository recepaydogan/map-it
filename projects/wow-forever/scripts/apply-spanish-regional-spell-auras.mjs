/** Reuse reviewed esES game-client auras only where esMX sources fall back to English. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const nativeDir = "data/spell-tooltip-localization/native-70790";
const [review, wowhead, english, spanish, mexican, donorPack, targetPack] =
  await Promise.all([
    read("data/spell-tooltip-localization/reviewed-spanish-regional-auras.json"),
    read("data/spell-tooltip-localization/wowhead-direct-review.json"),
    read(`${nativeDir}/enUS.json`), read(`${nativeDir}/esES.json`),
    read(`${nativeDir}/esMX.json`),
    read("public/data/locales/wow-forever/spell-tooltip-esES.json"),
    read("public/data/locales/wow-forever/spell-tooltip-esMX.json"),
  ]);
if (review.version !== 1 || !Array.isArray(review.fields) ||
  english.build !== 70790 || spanish.build !== 70790 || mexican.build !== 70790 ||
  donorPack.launchUpdateBuild !== 70790 || targetPack.launchUpdateBuild !== 70790 ||
  donorPack.locale !== "esES" || targetPack.locale !== "esMX") {
  throw new Error("Regional spell aura sources changed");
}
const seen = new Set();
let added = 0;
for (const record of review.fields) {
  const { id, field, english: source, esES: localized } = record;
  const key = `${id}:${field}`;
  const detail = (await read(`public/data/spells/foreverdb/${id % 64}.json`))[id];
  if (!Number.isSafeInteger(id) || field !== "a" || seen.has(key) ||
    typeof source !== "string" || typeof localized !== "string" ||
    !localized.trim() || localized === source || /\$[A-Za-z0-9{]/.test(localized) ||
    english.spells[id]?.fields?.[2] !== source ||
    detail?.a !== source ||
    spanish.spells[id]?.fields?.[2] !== localized ||
    mexican.spells[id]?.fields?.[2] !== source ||
    donorPack.entries[id]?.a !== localized ||
    !wowhead.missing.some((row) => row.id === id && row.field === field &&
      row.locale === "esMX" && row.source === source &&
      row.reason === "wowhead-english-fallback") ||
    wowhead.translations.some((row) => row.id === id && row.field === field &&
      row.locale === "esMX")) {
    throw new Error(`Unverified regional spell aura ${key}`);
  }
  seen.add(key);
  const numbers = (value) => [...value.matchAll(/\d+(?:[.,]\d+)?/g)]
    .map((match) => match[0]).sort().join(",");
  if (numbers(source) !== numbers(localized)) {
    throw new Error(`Changed spell aura numbers ${key}`);
  }
  const existing = targetPack.entries[id]?.a;
  if (existing && existing !== localized) continue;
  if (!existing) {
    if (process.argv.includes("--check")) throw new Error(`Missing regional spell aura ${key}`);
    (targetPack.entries[id] ??= {}).a = localized;
    added++;
  }
}
if (added) {
  const path = join(root, "public/data/locales/wow-forever/spell-tooltip-esMX.json");
  await writeFile(path, JSON.stringify(targetPack));
}
console.log(`${review.fields.length} regional Spanish spell auras verified; ${added} added`);
