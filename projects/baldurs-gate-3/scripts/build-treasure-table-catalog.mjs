import fs from "node:fs";
import path from "node:path";

const [sourceArgument, outputArgument] = process.argv.slice(2);
if (!sourceArgument || !outputArgument) {
  throw new Error("Usage: node build-treasure-table-catalog.mjs <source-directory> <output-json>");
}
const sourceRoot = path.resolve(sourceArgument);
const outputPath = path.resolve(outputArgument);
const modulePriority = (filePath) => {
  const normalized = filePath.split(path.sep).join("/");
  if (normalized.includes("/Shared/")) return 0;
  if (normalized.includes("/SharedDev/")) return 1;
  if (normalized.includes("/Gustav/")) return 2;
  if (normalized.includes("/GustavDev/")) return 3;
  if (normalized.includes("/Honour/")) return 4;
  return 5;
};
const files = fs.readdirSync(sourceRoot, { recursive: true })
  .map(String)
  .filter((filePath) => filePath.endsWith("TreasureTable.txt"))
  .map((filePath) => path.join(sourceRoot, filePath))
  .sort((left, right) => modulePriority(left) - modulePriority(right)
    || left.localeCompare(right, "en"));
const tables = new Map();

const parseDropCounts = (value) => value.split(";")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    if (/^-\d+$/.test(entry)) return { count: Math.abs(Number(entry)), weight: 1 };
    const [count, weight] = entry.split(",").map(Number);
    return { count, weight };
  })
  .filter(({ count, weight }) => Number.isFinite(count) && Number.isFinite(weight) && weight > 0);

for (const filePath of files) {
  let current;
  let currentSubtable;
  const finishCurrent = () => {
    if (!current) return;
    const inherited = current.canMerge ? tables.get(current.id) : undefined;
    tables.set(current.id, inherited ? {
      ...current,
      categories: [...inherited.categories, ...current.categories],
      subtables: [...inherited.subtables, ...current.subtables],
      provenance: `${inherited.provenance}; ${current.provenance}`,
    } : current);
  };
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const tableMatch = line.match(/^new treasuretable "([^"]+)"/);
    if (tableMatch) {
      finishCurrent();
      current = {
        id: tableMatch[1],
        categories: [],
        subtables: [],
        canMerge: false,
        provenance: path.relative(sourceRoot, filePath).split(path.sep).join("/"),
      };
      currentSubtable = null;
      continue;
    }
    if (current && /^CanMerge\s+1\b/.test(line)) {
      current.canMerge = true;
      continue;
    }
    const subtableMatch = line.match(/^new subtable "([^"]+)"/);
    if (current && subtableMatch) {
      currentSubtable = { dropCounts: parseDropCounts(subtableMatch[1]), categories: [] };
      current.subtables.push(currentSubtable);
      continue;
    }
    const categoryMatch = line.match(/^object category "([^"]+)",([^,]+)/);
    if (current && currentSubtable && categoryMatch) {
      const category = { id: categoryMatch[1], frequency: Number(categoryMatch[2]) };
      if (!Number.isFinite(category.frequency) || category.frequency <= 0) continue;
      current.categories.push(category.id);
      currentSubtable.categories.push(category);
    }
  }
  finishCurrent();
}

const humanize = (value) => value
  .replace(/^I_(?:MAG|WPN|ARM|OBJ|CONS|FOOD|ALCH|UNI)_/i, "")
  .replace(/^(?:FOOD|DRINK)_/i, "")
  .replace(/^T_/, "")
  .replace(/^(?:WLD|SCL|MOO|WYR|BGO|LOW|CTY|CRE|UND|HAG)_/, "")
  .replaceAll("_", " ")
  .replace(/([a-z])([A-Z])/g, "$1 $2")
  .replace(/\s+/g, " ")
  .trim();

const profiles = {};

const leaf = (id) => ({
  id,
  kind: id.startsWith("I_") ? "item" : "category",
  title: humanize(id),
});

const possibleLootCache = new Map();
const possibleLoot = (tableId, ancestors = new Set()) => {
  if (possibleLootCache.has(tableId)) return possibleLootCache.get(tableId);
  if (ancestors.has(tableId)) return [];
  const table = tables.get(tableId);
  if (!table) return [];
  const nextAncestors = new Set(ancestors).add(tableId);
  const noDropByLeaf = new Map();

  for (const subtable of table.subtables) {
    const totalFrequency = subtable.categories.reduce((sum, category) => sum + category.frequency, 0);
    const totalDropCountWeight = subtable.dropCounts.reduce((sum, dropCount) => sum + dropCount.weight, 0);
    if (totalFrequency <= 0 || totalDropCountWeight <= 0) continue;

    const perDrawByLeaf = new Map();
    for (const category of subtable.categories) {
      const nestedId = category.id.replace(/^T_/, "");
      const outcomes = category.id.startsWith("T_") && tables.has(nestedId)
        ? possibleLoot(nestedId, nextAncestors)
        : [{ ...leaf(category.id), initialChance: 100 }];
      for (const outcome of outcomes) {
        const current = perDrawByLeaf.get(outcome.id) ?? { ...outcome, probability: 0 };
        current.probability += (category.frequency / totalFrequency) * (outcome.initialChance / 100);
        perDrawByLeaf.set(outcome.id, current);
      }
    }

    for (const outcome of perDrawByLeaf.values()) {
      const subtableNoDrop = subtable.dropCounts.reduce((sum, dropCount) => (
        sum + (dropCount.weight / totalDropCountWeight) * ((1 - outcome.probability) ** dropCount.count)
      ), 0);
      const current = noDropByLeaf.get(outcome.id) ?? { ...outcome, probability: 1 };
      current.probability *= subtableNoDrop;
      noDropByLeaf.set(outcome.id, current);
    }
  }

  const outcomes = [...noDropByLeaf.values()]
    .map(({ probability, ...outcome }) => ({
      ...outcome,
      initialChance: Math.round((1 - probability) * 10_000) / 100,
    }))
    .filter(({ initialChance }) => initialChance > 0)
    .sort((left, right) => right.initialChance - left.initialChance || left.title.localeCompare(right.title, "en"));
  possibleLootCache.set(tableId, outcomes);
  return outcomes;
};

for (const table of tables.values()) {
  const stockCategories = new Set();
  const namedStock = new Set();
  const namedStockIds = new Set();
  const visited = new Set();
  const collect = (tableId, depth = 0) => {
    if (depth > 4 || visited.has(tableId)) return;
    visited.add(tableId);
    for (const category of tables.get(tableId)?.categories ?? []) {
      if (category.startsWith("I_")) {
        namedStock.add(humanize(category));
        namedStockIds.add(category);
      }
      else {
        const nestedId = category.replace(/^T_/, "");
        if (tables.has(nestedId)) collect(nestedId, depth + 1);
        else if (!/^(?:T_)?Gold_/i.test(category)) stockCategories.add(humanize(category));
      }
    }
  };
  collect(table.id);
  profiles[table.id] = {
    stockCategories: [...stockCategories].sort((a, b) => a.localeCompare(b, "en")),
    namedStock: [...namedStock].sort((a, b) => a.localeCompare(b, "en")),
    namedStockIds: [...namedStockIds].sort((a, b) => a.localeCompare(b, "en")),
    possibleLoot: possibleLoot(table.id),
    provenance: table.provenance,
  };
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 2, tables: profiles }, null, 2)}\n`);
console.log(`Treasure table catalog: ${Object.keys(profiles).length} stock profiles from ${files.length} files.`);
