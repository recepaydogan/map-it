/** Import exact, ID-checked quest objectives from a reviewed page audit. */
import { readFile, writeFile } from "node:fs/promises";

const auditPath = process.argv[2];
if (!auditPath) throw new Error("Pass the reviewed quest-page audit JSON path.");

const audit = JSON.parse(await readFile(auditPath, "utf8"));
const giverData = JSON.parse(await readFile("public/maps/world-atlas/locations-forever-new-quest-givers.json", "utf8"));
const offers = new Map(giverData.locations.flatMap((giver) => giver.questOffers.map((offer) => [offer.id, offer])));
const catalogPath = "public/data/quests/quest-details.json";
let source = await readFile(catalogPath, "utf8");
const catalog = JSON.parse(source);
const titleMatches = (title, offerName) => title === offerName
  || offerName.startsWith(`${title} (`) && offerName.endsWith(")");
const selected = audit.rows.filter((row) => {
  const offer = offers.get(row.id);
  return offer && !row.hasObjectiveItem && titleMatches(row.title, offer.name)
    && Math.abs(row.level - offer.level) <= 2
    && (row.valid || !row.objective && row.objectiveItems?.length && row.unmatchedItems === 0);
});
let updated = 0;
let added = 0;
let itemLists = 0;
const newEntries = [];

const itemLines = (items) => items.length ? [
  "      \"objectiveItems\": [",
  ...items.map((item, index) => `        ${JSON.stringify(item)}${index < items.length - 1 ? "," : ""}`),
  "      ],",
].join("\n") + "\n" : "";

for (const row of selected) {
  const offer = offers.get(row.id);
  if (!titleMatches(row.title, offer.name) || Math.abs(row.level - offer.level) > 2) {
    throw new Error(`Quest ${row.id} changed after audit`);
  }
  const items = row.unmatchedItems === 0 ? row.objectiveItems : [];
  const objective = row.objective.replace(/\s+/g, " ").trim();
  if (!objective && !items.length) continue;
  const current = catalog.quests[row.id];
  if (!current) {
    const lines = [
      `    ${JSON.stringify(row.id)}: {`,
      `      "id": ${JSON.stringify(row.id)},`,
      `      "title": ${JSON.stringify(offer.name)},`,
      `      "level": ${offer.level},`,
      objective ? `      "objective": ${JSON.stringify(objective)},` : "",
      itemLines(items).trimEnd(),
      '      "evidence": "community-reported",',
      '      "detailEvidence": "community-reported"',
      "    }",
    ].filter(Boolean);
    newEntries.push(lines.join("\n"));
    added++;
    if (items.length) itemLists++;
    continue;
  }
  if (![row.title, offer.name].includes(current.title) || current.level !== offer.level) {
    throw new Error(`Catalog quest ${row.id} conflicts with page`);
  }
  const header = `    ${JSON.stringify(row.id)}: {`;
  const start = source.indexOf(header);
  if (start < 0) throw new Error(`Cannot locate catalog quest ${row.id}`);
  const endMatch = /^    }(?=,?\r?\n)/m.exec(source.slice(start + header.length));
  if (!endMatch) throw new Error(`Cannot locate end of catalog quest ${row.id}`);
  const end = start + header.length + endMatch.index + endMatch[0].length;
  let block = source.slice(start, end);
  if (objective && current.objective !== objective) {
    if (current.objective) {
      block = block.replace(/^      "objective": "(?:\\.|[^"\\])*",\r?\n/m,
        `      "objective": ${JSON.stringify(objective)},\n`);
    } else {
      block = block.replace(/^(      "level": \d+,\r?\n)/m,
        `$1      "objective": ${JSON.stringify(objective)},\n`);
    }
    updated++;
  }
  if (items.length && !current.objectiveItems?.length) {
    const anchor = objective ? /^(      "objective": "(?:\\.|[^"\\])*",\r?\n)/m
      : /^(      "level": \d+,\r?\n)/m;
    block = block.replace(anchor, `$1${itemLines(items)}`);
    itemLists++;
  }
  source = source.slice(0, start) + block + source.slice(end);
}

if (newEntries.length) {
  const boundary = '\n  },\n  "markerQuestIds": {';
  if (!source.includes(boundary)) throw new Error("Cannot locate end of quest catalog");
  source = source.replace(boundary, `,\n${newEntries.join(",\n")}${boundary}`);
}
const next = JSON.parse(source);
if (Object.keys(next.quests).length !== Object.keys(catalog.quests).length + added) {
  throw new Error("Quest catalog count changed unexpectedly");
}
for (const row of selected) {
  const nextQuest = next.quests[row.id];
  if (!nextQuest || row.objective && nextQuest.objective !== row.objective.replace(/\s+/g, " ").trim()
    || row.objectiveItems?.length && row.unmatchedItems === 0 && !nextQuest.objectiveItems?.length) {
    throw new Error(`Quest ${row.id} objective was not imported`);
  }
}
if (process.argv.includes("--check")) {
  if (source !== await readFile(catalogPath, "utf8")) throw new Error("Quest objectives are out of date");
} else {
  await writeFile(catalogPath, source);
}
console.log(`Quest objectives: ${added} added, ${updated} updated, ${itemLists} item lists.`);
