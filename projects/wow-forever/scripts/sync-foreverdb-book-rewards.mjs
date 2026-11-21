import { readFile, writeFile } from "node:fs/promises";

const catalogPath = "public/data/items/catalog.json";
const rewardIds = ["277203", "277204", "281634", "281635"];
const qualities = ["Poor", "Common", "Uncommon", "Rare", "Epic", "Legendary", "Artifact", "Heirloom"];

const [catalog, remoteItems, statNames] = await Promise.all([
  readFile(catalogPath, "utf8").then(JSON.parse),
  fetch("https://foreverdb.net/data/items.json").then((response) => {
    if (!response.ok) throw new Error(`ForeverDB items: HTTP ${response.status}`);
    return response.json();
  }),
  fetch("https://foreverdb.net/data/stats.json").then((response) => {
    if (!response.ok) throw new Error(`ForeverDB stats: HTTP ${response.status}`);
    return response.json();
  }),
]);

if (catalog.version !== 2 || !Array.isArray(catalog.items) || !Array.isArray(remoteItems)) {
  throw new Error("Invalid item catalog");
}

const localById = new Map(catalog.items.map((item) => [item.id, item]));
const remoteById = new Map(remoteItems.map((item) => [String(item.id), item]));
for (const id of rewardIds) {
  const local = localById.get(id);
  const remote = remoteById.get(id);
  if (!local || !remote || local.name !== remote.n || !qualities[remote.q] || !Array.isArray(remote.st)) {
    throw new Error(`Book reward ${id} cannot be safely synchronized`);
  }
  const stats = remote.st.map(([statId, value], index) => {
    const label = statNames[statId];
    if (!label || !Number.isFinite(value)) throw new Error(`Unknown stat on book reward ${id}`);
    return { key: `site-stat-${index}`, label, value: value > 0 ? `+${value}` : String(value) };
  });
  local.grade = qualities[remote.q];
  local.itemLevel = remote.il;
  local.sections = [
    { key: "base", stats },
    ...local.sections.filter((section) => section.key !== "base"),
  ];
  if (!remote.cls) delete local.allowedClasses;
  local.source = "foreverdb.net";
}

await writeFile(catalogPath, `${JSON.stringify(catalog)}\n`);
console.log(`Synchronized ${rewardIds.length} book rewards from ForeverDB.`);
