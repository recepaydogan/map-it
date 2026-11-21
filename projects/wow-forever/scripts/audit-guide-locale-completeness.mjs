/** Inventory guide locale coverage and unchanged English text blocks. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const englishIndex = await read("public/data/guides/index.json");
const guideIds = englishIndex.guides.map((guide) => guide.id);
const classIds = ["druid", "hunter", "mage", "paladin", "priest", "rogue", "shaman", "warlock", "warrior"];
const blocks = (html) => {
  const result = [];
  for (const match of html.matchAll(/<(p|li|td|th|h[2-4])\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const plain = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (plain.length >= 25) result.push(plain);
  }
  return result;
};

for (const language of languages) {
  const index = await read(`public/data/guides/locales/${language}/index.json`);
  let missing = 0;
  let unchangedHeadings = 0;
  const unchangedBlocks = [];
  for (const id of guideIds) {
    const source = await read(`public/data/guides/${id}.json`);
    const target = await read(`public/data/guides/locales/${language}/${id}.json`);
    const summary = index.summaries?.[id];
    if (!target.title?.trim() || !target.intro?.trim() || !target.html?.trim() ||
      !summary?.title?.trim() || !summary?.intro?.trim() ||
      target.headings?.length !== source.headings.length) missing += 1;
    for (const [position, heading] of source.headings.entries()) {
      const localized = target.headings?.[position];
      if (localized?.id !== heading.id || !localized.title?.trim()) missing += 1;
      else if (localized.title === heading.title) unchangedHeadings += 1;
    }
    const originals = new Set(blocks(source.html));
    for (const text of blocks(target.html)) if (originals.has(text)) {
      unchangedBlocks.push(`${id}: ${text}`);
    }
  }
  let classMissing = 0;
  let classUnchanged = 0;
  for (const id of classIds) {
    const pack = await read(`public/data/classes/guides/locales/${language}/${id}.json`);
    if (pack.classId !== id || !pack.edits?.length) classMissing += 1;
    for (const edit of pack.edits ?? []) {
      if (!edit.text?.trim()) classMissing += 1;
      else if (edit.text === edit.source) classUnchanged += 1;
    }
  }
  console.log(`${language}: guide structure missing ${missing}; unchanged headings ${unchangedHeadings}; unchanged HTML blocks ${unchangedBlocks.length}; class pack missing ${classMissing}; unchanged class edits ${classUnchanged}`);
  if (process.argv.includes("--samples") || process.argv.includes("--samples-all")) {
    const sampleLimit = process.argv.includes("--samples-all") ? unchangedBlocks.length : 8;
    for (const value of unchangedBlocks.slice(0, sampleLimit)) console.log(`  ${value.slice(0, 160)}`);
  }
  if (process.argv.includes("--fail") && (missing || classMissing)) process.exitCode = 1;
}
