/** Reuse localized guide titles for visible links left with English labels. */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const anchor = /<a\b[^>]*data-guide-link="guide:([^"]+)"[^>]*>([^<]*)<\/a>/g;
const referenceAnchor = /<a\b[^>]*data-guide-link="((?:race|class):[^"]*)"[^>]*>([^<]*)<\/a>/g;
const referenceLabels = await read("data/guide-localization/navigation-reference-labels.json");
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const check = process.argv.includes("--check");

function referenceLabel(link, sourceLabel, labels, locale) {
  const label = sourceLabel.replaceAll("&amp;", "&");
  if (link === "race:") {
    if (label === "Races, classes and reworked racials") return labels.raceOverviewReworked;
    if (label.toLowerCase() === "races, classes and racials") return labels.raceOverview;
  }
  if (link === "race:skyborne" && label.toLowerCase() === "meet the skyborne") {
    return labels.skyborne;
  }
  if (link.startsWith("class:")) {
    const classId = link.split(":")[1];
    const className = locale.map.characters.classNames[classId];
    if (label === "talent calculator") return locale.classes.calculator.title;
    if (label === "Specs, builds & PvP tab") return labels.specsTab;
    if (label === `${classId[0].toUpperCase()}${classId.slice(1)} Specs, builds & PvP tab`) {
      return labels.classSpecs.replace("{{class}}", className);
    }
    if (label === "Mage PvE page") return labels.magePve;
    if (label === "Priest dungeon guide") return labels.priestDungeon;
    if (label.toLowerCase() === classId && className) return className;
  }
  return null;
}

for (const language of languages) {
  const summaries = (await read(`public/data/guides/locales/${language}/index.json`)).summaries;
  const locale = await read(`src/i18n/locales/${language}.json`);
  const labels = referenceLabels[language];
  if (!labels) throw new Error(`${language}: missing guide reference labels`);
  let changed = 0;
  for (const file of await readdir(join(root, `public/data/guides/locales/${language}`))) {
    if (!file.endsWith(".json") || file === "index.json") continue;
    const original = await read(`public/data/guides/${file}`);
    const path = join(root, `public/data/guides/locales/${language}/${file}`);
    const raw = await readFile(path, "utf8");
    const localized = JSON.parse(raw);
    if (original.id !== localized.id || typeof original.html !== "string" ||
      typeof localized.html !== "string") throw new Error(`${language}/${file}: guide mismatch`);
    const sourceLinks = [...original.html.matchAll(anchor)];
    localized.html = localized.html.replace(anchor, (match, id, label) => {
      const source = sourceLinks.find((link) => link[1] === id && link[2] === label);
      if (!source) return match;
      const title = summaries[id]?.title;
      if (!title) throw new Error(`${language}/${file}: missing guide title ${id}`);
      if (title === label) return match;
      changed += 1;
      return match.replace(/>[^<]*<\/a>$/, `>${escapeHtml(title)}</a>`);
    });
    const sourceReferences = [...original.html.matchAll(referenceAnchor)];
    localized.html = localized.html.replace(referenceAnchor, (match, link, label) => {
      // Localized prose can repeat a link or move it within a sentence.
      // Reuse copy only when both its target and English label match.
      const source = sourceReferences.find((entry) => entry[1] === link && entry[2] === label);
      if (!source) return match;
      const translated = referenceLabel(link, source[2], labels, locale);
      if (!translated) return match;
      if (translated === label) return match;
      changed += 1;
      return match.replace(/>[^<]*<\/a>$/, `>${escapeHtml(translated)}</a>`);
    });
    const output = JSON.stringify(localized) + (raw.endsWith("\n") ? "\n" : "");
    if (check && output !== raw) throw new Error(`${language}/${file}: guide navigation labels are stale`);
    if (!check && output !== raw) await writeFile(path, output);
  }
  console.log(`${language}: ${changed} guide navigation labels localized`);
}
