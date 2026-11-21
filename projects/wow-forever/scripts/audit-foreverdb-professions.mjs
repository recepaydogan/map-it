import { readFile, writeFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile("public/data/professions/catalog.json", "utf8"));
const pages = {
  alchemy: "alchemy", blacksmithing: "blacksmithing", enchanting: "enchanting",
  engineering: "engineering", leatherworking: "leatherworking", tailoring: "tailoring",
  herbalism: "herbalism", mining: "mining", skinning: "skinning", cooking: "cooking",
  firstaid: "first-aid", fishing: "fishing",
};
const results = {};
for (const profession of catalog.professions) {
  const slug = pages[profession.id];
  if (!slug) continue;
  const sourceUrl = `https://foreverdb.net/profession/${slug}`;
  const response = await fetch(sourceUrl, { headers: { "User-Agent": "WowForeverMapContentResearch/1.0" } });
  if (!response.ok) throw new Error(`${sourceUrl}: HTTP ${response.status}`);
  const html = await response.text();
  const recipeHtml = html.split(/<h2>\s*Recipes\s*<\/h2>/i)[1] ?? "";
  const linkedIds = [...new Set([...recipeHtml.matchAll(/href="\/item\/(\d+)"/g)].map((match) => match[1]))];
  const localIds = new Set(profession.recipes.map((recipe) => recipe.itemId).filter(Boolean));
  results[profession.id] = {
    sourceUrl,
    foreverDbLinkedCount: linkedIds.length,
    localLinkedCount: localIds.size,
    missingLocalItemIds: linkedIds.filter((id) => !localIds.has(id)),
  };
}
await writeFile("public/data/professions/foreverdb-review.json", `${JSON.stringify({ version: 1, results }, null, 2)}\n`);
for (const [id, result] of Object.entries(results)) {
  console.log(`${id}: ForeverDB ${result.foreverDbLinkedCount}, local ${result.localLinkedCount}, missing ${result.missingLocalItemIds.length}`);
}
