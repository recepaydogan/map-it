/** Apply facts resolved by the current client and detailed source records. */
import { readFile, writeFile } from "node:fs/promises";
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const write = async (path, value, pretty = false) => writeFile(path, `${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`);
const evidenceRoot = "data/site-research/wowhead-verified-update-2026-10-21";
const audit = await read(`${evidenceRoot}/client-followup.json`);
if (audit.source.build !== 70450) throw new Error("Review a different client build before applying");
const wrath = audit.mage.find((node) => node.id === 113627);
if (wrath?.entries[0].row[2].data !== 1 || wrath.entries[0].definition[4].data !== 1326079) throw new Error("Arcane Wrath client identity mismatch");
const calculatorPath = "public/data/classes/talent-calculator.json", calculator = await read(calculatorPath);
const metadataPath = "public/data/spells/foreverdb/classes.json", classes = await read(metadataPath);
const spell = (await read(`public/data/spells/foreverdb/${1326079 % 64}.json`))[1326079];
const arcane = calculator.classes.find((cls) => cls.n === "Mage").trees.find((tree) => tree.n === "Arcane");
const row = (wrath.row[3].data - 2130) / 600, col = (wrath.row[2].data - 1020) / 600;
if (row !== 3 || col !== 3 || !arcane.talents.some((talent) => talent.id === 105806)) throw new Error("Arcane Wrath slot or prerequisite mismatch");
if (!arcane.talents.some((talent) => talent.id === wrath.id)) {
  if (arcane.talents.some((talent) => talent.row === row && talent.col === col)) throw new Error("Arcane Wrath slot is occupied");
  arcane.talents.push({ id: wrath.id, row, col, n: spell.n, ic: spell.ic, ranks: [1], d: [spell.d],
    pre: [[105806, 0]], passive: false });
  arcane.talents.sort((a, b) => a.row - b.row || a.col - b.col);
}
const arcaneMetadata = classes.find((cls) => cls.n === "Mage").trees.find((tree) => tree.n === "Arcane");
if (!arcaneMetadata.talents.some((talent) => talent.id === wrath.id)) {
  arcaneMetadata.talents.push({ id: wrath.id, e: 141289, df: 145958, sp: spell.id, row, col, n: spell.n, ic: spell.ic,
    lv: spell.lv, max: 1, ranks: [spell.id], d: [spell.d], pre: [[105806, 1]], gate: [15, 1], new: true });
  arcaneMetadata.talents.sort((a, b) => a.row - b.row || a.col - b.col);
}
// All 54 previously published Mage nodes still occur in the client. In
// particular, Piercing Ice and five-rank Elemental Precision are retained.
const frost = calculator.classes.find((cls) => cls.n === "Mage").trees.find((tree) => tree.n === "Frost");
if (frost.talents.find((talent) => talent.id === 105778)?.ranks.length !== 5
  || !frost.talents.some((talent) => talent.id === 105773)) throw new Error("Verified Frost structure changed");
await write(calculatorPath, calculator);
await write(metadataPath, classes);

const detailsPath = "public/data/quests/quest-details.json", details = await read(detailsPath);
Object.assign(details.quests["79361"], { level: 43, experience: 3600, money: "60s" });
// Different quest IDs remain separate even when their titles are identical.
for (const id of [93689, 92521]) if (!audit.quests.some((quest) => quest.id === id && quest.row)) throw new Error(`Quest ${id} is not confirmed in this client`);
details.quests["93689"] ??= { id: "93689", title: "Friend of the Kirin Tor", level: 33, minimumLevel: 24,
  experience: 270, objective: "Speak with Archmage Celindra in the City of Dalaran.",
  description: "This is excellent news! With Dalaran returned to peace, I can see no reason the Kirin Tor would not welcome you with open arms! Please, report to the council with great haste. I'm sure they will be looking forward to meeting the city's savior.",
  evidence: "client-datamined", detailEvidence: "community-reported" };
details.quests["92521"] ??= { id: "92521", title: "The Demon Tower",
  objective: "Spy on Hnaz's imp at the tower with the captive satyr.",
  description: "You know I'm a warlock, right? Now reduced to squalor and meat-cutting, but once a mighty magician! My imp keeps wandering off and while I could just call him back, I'm kinda curious about what he's doing. He's been sneaking off to talk to a bound satyr at a tower to the southeast of here. If you wouldn't mind, I'd like to know what they're talking about. I'm sure it's nothing to worry about, but you can never tell with demons, right?",
  evidence: "client-datamined", detailEvidence: "community-reported" };
await write(detailsPath, details, true);
for (const name of ["quest-givers", "new-quest-givers", "quests"]) {
  const path = `public/maps/world-atlas/locations-forever-all-${name}.json`, data = await read(path);
  for (const point of data.locations) {
    for (const offer of point.questOffers ?? []) if (offer.id === "79361") offer.level = 43;
    if (point.questId === "79361") point.questLevel = 43;
  }
  await write(path, data);
}

const spellRoot = "public/data/spells/foreverdb", index = await read(`${spellRoot}/index.json`);
// These DB rows document the known tooltip, not player learnability or the
// unresolved raw numeric effect. The normal catalog also includes NPC spells.
for (const entry of [
  { id: 1326891, n: "Frigid Power", r: "", ic: 132097, sc: "Frost", ct: 0, du: 60000, lv: 40, cl: 8, new: true,
    d: "Increases the damage done by your Frost spells by 3%.", a: "Increases the damage done by your Frost spells by 3%." },
  { id: 1326608, n: "Wind Bridge", r: "", ic: 1029585, sc: "Physical", ct: 0, rg: [0, 50000], lv: 1,
    ef: [{ e: 5, v: 1 }], new: true },
]) {
  const tooltip = await read(`${evidenceRoot}/spell-${entry.id}.json`);
  if (tooltip.name !== entry.n) throw new Error(`Spell identity mismatch: ${entry.id}`);
  const path = `${spellRoot}/${entry.id % 64}.json`, shard = await read(path);
  if (!shard[entry.id]) shard[entry.id] = entry;
  if (!index.some((row) => row[0] === entry.id)) index.push([entry.id, entry.n, "", entry.ic, entry.cl ?? 0, 1, 0]);
  await write(path, shard);
}
index.sort((a, b) => a[0] - b[0]);
await write(`${spellRoot}/index.json`, index);
const manifest = await read(`${spellRoot}/manifest.json`); manifest.count = index.length;
await write(`${spellRoot}/manifest.json`, manifest);
console.log(JSON.stringify({ mageTalents: 55, arcaneWrath: { row, col, prerequisite: 105806 },
  prateQuestLevel: 43, questsAdded: [93689, 92521], spellRecordsAdded: [1326891, 1326608],
  unresolvedField: "Frigid Power raw effect amount; tooltip is 3%, effect table displays 4%." }, null, 2));
