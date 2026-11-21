/** Build exact-match quest prose fallbacks and labeled Chinese locale conversions. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = "public/data/locales/wow-forever";
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const source = await read(`${directory}/quest-text-source.json`);
const genderVariants = await read("data/quest-text-localization/gender-variants.json");
const reviewedProse = await read("data/quest-text-localization/reviewed-prose.json");
const derivedTraditional = await read("data/quest-text-localization/zh-tw-derived.json");
const derivedSimplified = await read("data/quest-text-localization/zh-cn-derived.json");
if (source.version !== 1 || source.keys.length !== source.values.length ||
  new Set(source.keys).size !== source.keys.length) throw new Error("Invalid quest text source");
if (genderVariants.version !== 1 ||
  genderVariants.sourceRevision !== source.provenance.classicRevision) {
  throw new Error("Quest gender variants use a different source revision");
}
if (reviewedProse.version !== 1 || !reviewedProse.entries ||
  typeof reviewedProse.entries !== "object") {
  throw new Error("Invalid reviewed quest prose catalog");
}
const sourceIndex = new Map(source.keys.map((key, index) => [key, index]));
const sha256 = async (path) => createHash("sha256")
  .update(await readFile(join(root, path))).digest("hex");
if (derivedTraditional.version !== 1 ||
  derivedTraditional.sourceSha256 !== await sha256(`${directory}/quest-text-source.json`) ||
  derivedTraditional.zhCnSha256 !== await sha256(`${directory}/quest-text-zhCN.json`) ||
  derivedTraditional.zhTwSha256 !== await sha256(`${directory}/quest-text-zhTW.json`)) {
  throw new Error("Derived zhTW quest prose uses different source packs");
}
if (derivedSimplified.version !== 1 ||
  derivedSimplified.sourceSha256 !== await sha256(`${directory}/quest-text-source.json`) ||
  derivedSimplified.zhCnSha256 !== await sha256(`${directory}/quest-text-zhCN.json`) ||
  derivedSimplified.zhTwSha256 !== await sha256(`${directory}/quest-text-zhTW.json`) ||
  derivedSimplified.reviewedProseSha256 !== await sha256("data/quest-text-localization/reviewed-prose.json")) {
  throw new Error("Derived zhCN quest prose uses different source packs");
}
const nameSourceFiles = ["source.json", "zhCN.json", "zhTW.json",
  "map-entity-source.json", "map-entity-zhCN.json", "map-entity-zhTW.json"];
for (const [locale, derived] of [["zhTW", derivedTraditional], ["zhCN", derivedSimplified]]) {
  if (Object.keys(derived.nameSourceSha256 ?? {}).length !== nameSourceFiles.length) {
    throw new Error(`Derived ${locale} quest prose lacks game name source hashes`);
  }
  for (const name of nameSourceFiles) {
    if (derived.nameSourceSha256[name] !== await sha256(`${directory}/${name}`)) {
      throw new Error(`Derived ${locale} quest prose uses different ${name}`);
    }
  }
}
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const records = {};
const derivedKeys = [];
const simplifiedDerivedKeys = [];
for (const locale of locales) {
  const pack = await read(`${directory}/quest-text-${locale}.json`);
  if (pack.version !== 1 || pack.values.length !== source.keys.length) {
    throw new Error(`${locale}: invalid quest text pack`);
  }
  const translatedByEnglish = new Map();
  for (let index = 0; index < source.keys.length; index += 1) {
    const translated = pack.values[index];
    if (!translated) continue;
    const field = source.keys[index].split(":")[1];
    const text = `${field}\0${source.values[index]}`;
    const values = translatedByEnglish.get(text) ?? new Set();
    values.add(translated);
    translatedByEnglish.set(text, values);
  }
  const fallbacks = {};
  let convertedCount = 0;
  for (let index = 0; index < source.keys.length; index += 1) {
    if (pack.values[index]) continue;
    const field = source.keys[index].split(":")[1];
    const values = translatedByEnglish.get(`${field}\0${source.values[index]}`);
    if (values?.size === 1) fallbacks[source.keys[index]] = [...values][0];
  }
  const numberTemplates = new Map();
  for (let index = 0; index < source.keys.length; index += 1) {
    const english = source.values[index];
    const translated = pack.values[index];
    const englishNumbers = english.match(/\d+/g);
    const translatedNumbers = translated?.match(/\d+/g);
    if (englishNumbers?.length !== 1 || translatedNumbers?.length !== 1 ||
      englishNumbers[0] !== translatedNumbers[0]) continue;
    const field = source.keys[index].split(":")[1];
    const signature = `${field}\0${english.replace(/\d+/, "#")}`;
    const values = numberTemplates.get(signature) ?? new Set();
    values.add(translated.replace(/\d+/, "#"));
    numberTemplates.set(signature, values);
  }
  for (let index = 0; index < source.keys.length; index += 1) {
    const key = source.keys[index];
    if (pack.values[index] || fallbacks[key]) continue;
    const english = source.values[index];
    const numbers = english.match(/\d+/g);
    if (numbers?.length !== 1) continue;
    const field = key.split(":")[1];
    const values = numberTemplates.get(`${field}\0${english.replace(/\d+/, "#")}`);
    if (values?.size !== 1) continue;
    const translated = [...values][0].replace("#", numbers[0]);
    if (translated !== english && !/\$[A-Za-z]/.test(translated)) fallbacks[key] = translated;
  }
  for (const [key, translated] of Object.entries(genderVariants.locales[locale] ?? {})) {
    const index = sourceIndex.get(key);
    if (index === undefined || pack.values[index] ||
      !translated || translated === source.values[index] || /\$[A-Za-z]/.test(translated)) {
      throw new Error(`${locale}/${key}: invalid gender variant`);
    }
    fallbacks[key] = translated;
  }
  for (const [key, entry] of Object.entries(reviewedProse.entries)) {
    const index = sourceIndex.get(key);
    if (index === undefined || entry.en !== source.values[index]) {
      throw new Error(`${key}: reviewed quest prose source changed`);
    }
    const translated = entry.locales?.[locale];
    if (!translated) continue;
    if (pack.values[index] || fallbacks[key] || translated === entry.en ||
      /\$[A-Za-z]/.test(translated) ||
      (translated.match(/\n/g) ?? []).length !== (entry.en.match(/\n/g) ?? []).length) {
      throw new Error(`${locale}/${key}: invalid reviewed quest prose`);
    }
    fallbacks[key] = translated;
  }
  const reviewedBySource = new Map();
  for (const [key, entry] of Object.entries(reviewedProse.entries)) {
    const translated = entry.locales?.[locale];
    if (!translated) continue;
    const field = key.split(":")[1];
    const signature = `${field}\0${entry.en}`;
    const values = reviewedBySource.get(signature) ?? new Set();
    values.add(translated);
    reviewedBySource.set(signature, values);
  }
  for (let index = 0; index < source.keys.length; index += 1) {
    const key = source.keys[index];
    if (pack.values[index] || fallbacks[key]) continue;
    const field = key.split(":")[1];
    const values = reviewedBySource.get(`${field}\0${source.values[index]}`);
    if (values?.size === 1) fallbacks[key] = [...values][0];
  }
  if (locale === "zhCN") {
    const traditional = await read(`${directory}/quest-text-zhTW.json`);
    for (const [key, translated] of Object.entries(derivedSimplified.entries)) {
      const index = sourceIndex.get(key);
      const hasTraditionalSource = index !== undefined &&
        (traditional.values[index] || reviewedProse.entries[key]?.locales?.zhTW ||
          Object.entries(derivedSimplified.entries).some(([otherKey, otherTranslated]) => {
            const otherIndex = sourceIndex.get(otherKey);
            return otherKey !== key && otherTranslated === translated &&
              otherIndex !== undefined &&
              key.split(":")[1] === otherKey.split(":")[1] &&
              source.values[index] === source.values[otherIndex] &&
              (traditional.values[otherIndex] || reviewedProse.entries[otherKey]?.locales?.zhTW);
          }));
      if (index === undefined || pack.values[index] ||
        !hasTraditionalSource ||
        !translated || translated === source.values[index] ||
        !/[\u4e00-\u9fff]/u.test(translated) || /\$[A-Za-z]/.test(translated)) {
        throw new Error(`zhCN/${key}: invalid converted quest prose`);
      }
      if (!fallbacks[key]) {
        fallbacks[key] = translated;
        convertedCount += 1;
        simplifiedDerivedKeys.push(key);
      }
    }
  }
  if (locale === "zhTW") {
    const simplified = await read(`${directory}/quest-text-zhCN.json`);
    for (const [key, translated] of Object.entries(derivedTraditional.entries)) {
      const index = sourceIndex.get(key);
      if (index === undefined || pack.values[index] || !simplified.values[index] ||
        !translated || translated === source.values[index] ||
        !/[\u4e00-\u9fff]/u.test(translated) || /\$[A-Za-z]/.test(translated)) {
        throw new Error(`zhTW/${key}: invalid converted quest prose`);
      }
      if (!fallbacks[key]) {
        fallbacks[key] = translated;
        convertedCount += 1;
        derivedKeys.push(key);
      }
    }
  }
  records[locale] = fallbacks;
  console.log(`${locale}: ${Object.keys(fallbacks).length} quest prose fallbacks` +
    (convertedCount ? ` (${convertedCount} converted from ${locale === "zhCN" ? "zhTW" : "zhCN"})` : ""));
}
const path = join(root, directory, "quest-text-app-fallbacks.json");
const output = `${JSON.stringify({
  version: 1, locales: records, derivedFromZhCN: { zhTW: derivedKeys },
  derivedFromZhTW: { zhCN: simplifiedDerivedKeys },
}, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (await readFile(path, "utf8") !== output) throw new Error("Quest text fallbacks are stale");
} else await writeFile(path, output);
