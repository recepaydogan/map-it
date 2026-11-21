/** Apply ID-verified Classic item names to exact guide HTML text nodes. */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root, "data/guide-localization/reviewed-classic-item-names.json"), "utf8"));
const sourceDirectory = join(root, "public/data/guides");
const localeDirectory = join(sourceDirectory, "locales");
const locales = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const sourceFiles = (await readdir(sourceDirectory)).filter((name) => name.endsWith(".json"));
const sourceHtml = await Promise.all(sourceFiles.map(async (name) =>
  JSON.parse(await readFile(join(sourceDirectory, name), "utf8")).html ?? ""));
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const entries = Object.entries(catalog.items);

for (const [id, item] of entries) {
  if (!Number.isInteger(Number(id)) || !item.en || !sourceHtml.some((html) => html.includes(`>${item.en}<`))) {
    throw new Error(`Item ${id} has no exact English guide text node`);
  }
}

let total = 0;
for (const locale of locales) {
  let count = 0;
  const files = (await readdir(join(localeDirectory, locale))).filter((name) => name.endsWith(".json"));
  for (const file of files) {
    const path = join(localeDirectory, locale, file);
    const raw = await readFile(path, "utf8");
    const guide = JSON.parse(raw);
    if (typeof guide.html !== "string") continue;
    for (const [, item] of entries) {
      const localized = item.translations[locale] ?? (locale === "es-MX" ? item.translations.es : undefined);
      if (!localized || localized === item.en) continue;
      const source = `>${item.en}<`;
      const hits = guide.html.split(source).length - 1;
      if (!hits) continue;
      guide.html = guide.html.replaceAll(source, `>${escapeHtml(localized)}<`);
      count += hits;
    }
    const output = JSON.stringify(guide) + (raw.endsWith("\n") ? "\n" : "");
    if (process.argv.includes("--check")) {
      if (output !== raw) throw new Error(`${locale}/${file} has untranslated reviewed item names`);
    } else if (output !== raw) {
      await writeFile(path, output);
    }
  }
  total += count;
  console.log(`${locale}: ${count} item name text nodes localized`);
}
console.log(`Total: ${total}`);
