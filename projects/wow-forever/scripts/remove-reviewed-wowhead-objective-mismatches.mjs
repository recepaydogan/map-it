/** Remove only captured objectives reviewed as another quest variant. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { rejectedSemanticProse } from "./lib/rejected-semantic-prose.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = "public/data/locales/wow-forever";
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = (await read("public/data/quests/quest-details.json")).quests;
const codes = { deDE: "de", esES: "es", esMX: "mx", frFR: "fr", koKR: "ko",
  ptBR: "pt", zhCN: "cn", zhTW: "tw" };
const write = async (path, content) => {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await writeFile(path, content);
      return;
    } catch (error) {
      if (!["UNKNOWN", "EBUSY", "EPERM", "EACCES"].includes(error.code) || attempt === 7) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
};

for (const [locale, code] of Object.entries(codes)) {
  const filename = `${directory}/quest-objective-wowhead-${locale}.json`;
  const pack = await read(filename);
  if (pack.version !== 1 || !pack.quests) throw new Error(`Invalid ${locale} objective pack`);
  let removed = 0;
  for (const rule of rejectedSemanticProse.filter((entry) =>
    entry.locale === locale && entry.field === "objective")) {
    if (catalog[rule.id]?.objective !== rule.english) {
      throw new Error(`Changed quest source: ${locale}/${rule.id}`);
    }
    const entry = pack.quests[rule.id];
    if (!entry) continue;
    if (entry.english?.objective !== rule.english ||
      entry.locales?.[locale]?.objective !== rule.localized ||
      entry.sourceUrl !== `https://www.wowhead.com/forever/quest=${rule.id}` ||
      entry.localeUrls?.[locale] !==
        `https://www.wowhead.com/forever/${code}/quest=${rule.id}` ||
      Object.keys(entry.english).length !== 1 ||
      Object.keys(entry.locales[locale]).length !== 1) {
      throw new Error(`Changed reviewed objective: ${locale}/${rule.id}`);
    }
    delete pack.quests[rule.id];
    removed++;
  }
  if (removed && process.argv.includes("--check")) {
    throw new Error(`${locale}: ${removed} reviewed mismatches remain`);
  }
  if (removed) await write(join(root, filename), JSON.stringify(pack));
  console.log(`${locale}: ${removed} reviewed objective mismatches removed`);
}
