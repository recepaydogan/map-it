import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const localCatalog = JSON.parse(await readFile(join(root, "public/data/reference/dungeons/client-instances.json"), "utf8"));
const matches = {
  "mapgenie-instance-948715": 109, // Temple of Atal'Hakkar / Sunken Temple
  "mapgenie-instance-948718": 309,
  "mapgenie-instance-949557": 389,
  "mapgenie-instance-949847": 2998,
  "mapgenie-instance-949849": 2959,
  "mapgenie-instance-949869": 36,
  "mapgenie-instance-949872": 33,
  "mapgenie-instance-949875": 34,
  "mapgenie-instance-949878": 48,
  "mapgenie-instance-949883": 90,
  "mapgenie-instance-949889": 47,
  "mapgenie-instance-949903": 129,
  "mapgenie-instance-949909": 209,
  "mapgenie-instance-949916": 230,
  "mapgenie-instance-949919": 229,
  "mapgenie-instance-949922": 329,
  "mapgenie-instance-949923": 429,
};

const entries = {};
const [mechanicsResponse, dungeonsResponse] = await Promise.all([
  fetch("https://foreverdb.net/data/bosses.json"),
  fetch("https://foreverdb.net/data/dungeons.json"),
]);
if (!mechanicsResponse.ok || !dungeonsResponse.ok) throw new Error("Dungeon data unavailable.");
const mechanicRecords = (await mechanicsResponse.json()).bosses;
const dungeonRecords = new Map((await dungeonsResponse.json()).map((dungeon) => [dungeon.id, dungeon]));
let abilityCount = 0;
for (const [localId, foreverDbId] of Object.entries(matches)) {
  if (!localCatalog.entries[localId]) throw new Error(`Unknown local dungeon: ${localId}`);
  const dungeon = dungeonRecords.get(foreverDbId);
  const bosses = [...new Set((dungeon?.bosses ?? []).filter(Boolean))];
  if (!bosses.length) continue;
  const mechanics = {};
  for (const name of bosses) {
    const record = mechanicRecords[`${foreverDbId}|${name}`];
    if (!record?.abilities?.length) continue;
    mechanics[name] = {
      npcIds: record.npc ?? [],
      level: record.lv,
      abilities: record.abilities.filter((ability) => ability.spell && ability.n).map((ability) => ({
        spellId: ability.spell,
        name: ability.n,
        target: ability.target,
        intervalSeconds: ability.every,
      })),
    };
    abilityCount += mechanics[name].abilities.length;
  }
  entries[localId] = { sourceDungeonId: foreverDbId, bosses, mechanics };
}

const destination = join(root, "public/data/dungeons/foreverdb-bosses.json");
await mkdir(join(root, "public/data/dungeons"), { recursive: true });
await writeFile(destination, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`);
console.log(`Imported boss rosters for ${Object.keys(entries).length} local dungeons and ${abilityCount} Classic ability records.`);
