/** Audit cached Forever quest pages by exact quest ID, title, and level. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const cacheDir = process.argv[2];
if (!cacheDir) throw new Error("Pass a cache directory for downloaded quest pages.");
await mkdir(cacheDir, { recursive: true });
const catalog = JSON.parse(await readFile("public/data/quests/world-map-new-quests.json", "utf8"));
const details = JSON.parse(await readFile("public/data/quests/quest-details.json", "utf8"));
const itemCatalog = JSON.parse(await readFile("public/data/items/catalog.json", "utf8"));
const items = new Map(itemCatalog.items.map((item) => [item.id, item]));
const missing = catalog.quests.filter((quest) => !details.quests[quest.id]?.objective);
const decode = (text) => text.replace(/<[^>]*>/g, " ").replace(/&(#x[\da-f]+|#\d+|amp|apos|quot|lt|gt|nbsp);/gi,
  (_, entity) => entity[0] === "#" ? String.fromCodePoint(entity[1]?.toLowerCase() === "x"
    ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10))
    : ({ amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: " " }[entity.toLowerCase()] ?? `&${entity};`))
  .replace(/\s+/g, " ").trim();
const rows = [];
let cursor = 0;
const worker = async () => {
  while (cursor < missing.length) {
    const quest = missing[cursor++];
    const file = path.join(cacheDir, `${quest.id}.html`);
    let html;
    try { html = await readFile(file, "utf8"); } catch {
      const response = await fetch(`https://foreverchanges.pro/quest/${quest.id}`);
      if (!response.ok) {
        rows.push({ id: quest.id, title: "", level: null, objective: "", valid: false, status: response.status });
        continue;
      }
      html = await response.text();
      await writeFile(file, html);
    }
    const title = decode(html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? "");
    const level = Number(html.match(/<dt>Level<\/dt><dd>(\d+)/)?.[1] ?? NaN);
    const canonicalId = html.match(/<link rel="canonical" href="https:\/\/foreverchanges\.pro\/quest\/(\d+)"/)?.[1];
    const section = html.match(/<h2>Quest Objectives<\/h2>([\s\S]*?)<\/article>/)?.[1] ?? "";
    const objective = decode(section.match(/^<p>([\s\S]*?)<\/p>/)?.[1] ?? "");
    const objectiveItems = [];
    let unmatchedItems = 0;
    for (const itemRow of section.matchAll(/<li class="qp-need-item">([\s\S]*?)<\/li>/g)) {
      const itemId = itemRow[1].match(/href="\/item\/(\d+)"/)?.[1];
      const name = decode(itemRow[1].match(/<span class="qp-item-name[^"]*">([\s\S]*?)<\/span>/)?.[1] ?? "");
      const quantity = Number(itemRow[1].match(/<b>(\d+)<\/b>/)?.[1] ?? 1);
      const item = items.get(itemId);
      if (!item || item.name !== name || !Number.isInteger(quantity) || quantity <= 0) {
        unmatchedItems++;
        continue;
      }
      objectiveItems.push({ id: itemId, name, quantity, icon: item.icon });
    }
    rows.push({ id: quest.id, title, level, objective,
      valid: canonicalId === quest.id && (title === quest.title
        || quest.title.startsWith(`${title} (`) && quest.title.endsWith(")"))
        && Math.abs(level - quest.level) <= 2
        && objective.length >= 12 && objective.length <= 500,
      objectiveItems, unmatchedItems, hasObjectiveItem: Boolean(details.quests[quest.id]?.objectiveItem),
      expectedTitle: quest.title, expectedLevel: quest.level });
  }
};
await Promise.all(Array.from({ length: 4 }, worker));
rows.sort((a, b) => Number(a.id) - Number(b.id));
console.log(JSON.stringify({ total: rows.length, valid: rows.filter((row) => row.valid).length,
  noSentence: rows.filter((row) => !row.objective).length,
  mismatchedIdentity: rows.filter((row) => row.title && (row.title !== row.expectedTitle || row.level !== row.expectedLevel)).length,
  rows }, null, 2));
