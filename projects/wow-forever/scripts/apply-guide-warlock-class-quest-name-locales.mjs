/** Use the ID-matched Durotar Warlock quest title in prose and quest tables. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const partial = await read("data/quest-title-localization/polestar-forever-partial-titles.json");
const reviewed = await read("data/guide-localization/reviewed-warlock-class-quest-titles.json");
const english = await read("public/data/guides/leveling-warlock.json");
const title = partial.titles[reviewed.en];
if (partial.source.englishIds.revision !== reviewed.source.revision ||
  !title?.questIds.includes(reviewed.questId) ||
  !english.html.includes(`Durotar imp quest, ${reviewed.en}, where Ruzan`) ||
  !english.html.includes(`The Stolen Tome, Beginnings, ${reviewed.en}, Piercing the Veil`)) {
  throw new Error("Durotar Warlock quest evidence changed");
}

const check = process.argv.includes("--check");
for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
  const translation = language === "pt-BR" ? reviewed[language] : title[language];
  if (!translation || translation === reviewed.en) throw new Error(`${language}: missing quest title`);
  const sectionPath = `data/guide-localization/${language}/leveling-warlock/class-quests-up-to-30.html`;
  const guidePath = `public/data/guides/locales/${language}/leveling-warlock.json`;
  const section = await readFile(join(root, sectionPath), "utf8");
  const nextSection = section.replaceAll(reviewed.en, translation);
  const rawGuide = await readFile(join(root, guidePath), "utf8");
  const guide = JSON.parse(rawGuide);
  const nextHtml = guide.html.replaceAll(reviewed.en, translation);
  if (!nextSection.includes(translation) || !nextHtml.includes(translation)) {
    throw new Error(`${language}: Durotar Warlock quest title missing from guide`);
  }
  if (check) {
    if (nextSection !== section || nextHtml !== guide.html) {
      throw new Error(`${language}: Warlock quest name is stale`);
    }
  } else {
    if (nextSection !== section) await writeFile(join(root, sectionPath), nextSection);
    if (nextHtml !== guide.html) {
      guide.html = nextHtml;
      await writeFile(join(root, guidePath), JSON.stringify(guide) + (rawGuide.endsWith("\n") ? "\n" : ""));
    }
  }
  console.log(`${language}: ${translation}`);
}
