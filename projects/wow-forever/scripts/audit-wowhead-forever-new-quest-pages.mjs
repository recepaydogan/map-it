/** Review fetched Forever quest pages against the world-map quest identities. */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const sourceDir = process.argv[2];
if (!sourceDir) throw new Error("Pass the directory containing fetched quest HTML pages.");

const giverData = JSON.parse(await readFile("public/maps/world-atlas/locations-forever-new-quest-givers.json", "utf8"));
const questDetails = JSON.parse(await readFile("public/data/quests/quest-details.json", "utf8"));
const itemCatalog = JSON.parse(await readFile("public/data/items/catalog.json", "utf8"));
const offers = new Map(giverData.locations.flatMap((giver) => giver.questOffers.map((offer) => [offer.id, offer])));
const items = new Map(itemCatalog.items.map((item) => [item.id, item]));
const decodeHtml = (value) => value.replace(/&(#x[\da-f]+|#\d+|amp|apos|quot|lt|gt|nbsp);/gi, (_, entity) => {
  const named = { amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: " " };
  if (entity[0] === "#") return String.fromCodePoint(entity[1]?.toLowerCase() === "x"
    ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10));
  return named[entity.toLowerCase()] ?? `&${entity};`;
});

const rows = [];
for (const file of await readdir(sourceDir)) {
  if (!/^\d+\.html$/.test(file)) continue;
  const id = file.slice(0, -5);
  const offer = offers.get(id);
  if (!offer) continue;
  const html = await readFile(path.join(sourceDir, file), "utf8");
  const title = decodeHtml(html.match(/<title>([^<]+) - Quest - Forever<\/title>/)?.[1] ?? "");
  const description = decodeHtml(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "");
  const levelMatch = description.match(/^(.*?) A level (\d+)(?: [^.]+)? Quest\./s);
  const objective = levelMatch?.[1]?.trim().split(/\n\s*\n/)[0] ?? "";
  const level = levelMatch ? Number(levelMatch[2]) : null;
  const valid = title === offer.name && level === offer.level && objective.length >= 12 && objective.length <= 500;
  const objectiveItems = [];
  let unmatchedItems = 0;
  for (const match of html.matchAll(/<tr data-icon-list-quantity="(\d+)"[^>]*>[\s\S]*?<a href="\/forever\/item=(\d+)\/[^\"]+"[^>]*>([^<]+)<\/a>[\s\S]*?<\/tr>/g)) {
    const [, count, itemId, encodedName] = match;
    const name = decodeHtml(encodedName);
    const normalizedName = name.toLowerCase();
    const normalizedObjective = objective.toLowerCase();
    if (!normalizedObjective.includes(normalizedName)
      && !normalizedObjective.includes(`${normalizedName}s`)) continue;
    const item = items.get(itemId);
    if (!item || item.name !== name) { unmatchedItems++; continue; }
    objectiveItems.push({ id: itemId, name, quantity: Number(count), icon: item.icon });
  }
  rows.push({ id, title, level, objective, valid, objectiveItems, unmatchedItems,
    existingObjective: questDetails.quests[id]?.objective ?? "",
    hasObjectiveItem: Boolean(questDetails.quests[id]?.objectiveItem) });
}

console.log(JSON.stringify({ total: rows.length, valid: rows.filter((row) => row.valid).length, rows }, null, 2));
