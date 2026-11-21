import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const names = ["warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid"];
const root = path.resolve("public/data/classes/guides");
const spellRoot = path.resolve("public/data/spells/writeups");

async function download(relativePath) {
  const response = await fetch(`https://foreverdb.net/data/${relativePath}`);
  if (!response.ok) throw new Error(`${relativePath}: HTTP ${response.status}`);
  return response.json();
}

const [guides, stats, datamine, changes, ...other] = await Promise.all([
  download("guides.json"),
  download("stats.json"),
  download("datamine.json"),
  download("changes.json"),
  ...names.flatMap((name) => [
    download(`writeups/${name}.json`),
    download(`playguides/${name}.json`),
    download(`builds/${name}.json`),
    download(`gearing/${name}.json`),
  ]),
]);
// ForeverDB's level-60 overview copy still contains pre-October 1 talent advice.
// Keep the current play/build payloads, but reconcile the known contradictions
// against Blizzard's October 1 beta notes before publishing the overview.
if (datamine.version === "1.60.1.70205") {
  const replace = (value, previous, current) => {
    if (!value.includes(previous)) throw new Error(`Class guide wording changed: ${previous}`);
    return value.replace(previous, current);
  };
  const warrior = guides.classes.Warrior.specs.find((spec) => spec.tree === "Fury");
  const mage = guides.classes.Mage.specs.find((spec) => spec.tree === "Fire");
  const druid = guides.classes.Druid.specs.find((spec) => spec.tree === "Feral Combat");
  if (!warrior || !mage || !druid) throw new Error("Missing class overview to reconcile.");
  warrior.summary = replace(warrior.summary,
    "while Bloodthirst and Whirlwind do the heavy lifting, and Raging Blows makes Whirlwind strike with your off-hand too",
    "while Bloodthirst and Whirlwind do the heavy lifting. Whirlwind strikes with both weapons without a talent, while Raging Blows reduces the cost of Cleave and Whirlwind");
  warrior.forever = replace(warrior.forever,
    "New Fury talents include Raging Blows (Whirlwind also strikes with your off-hand), Boundless Rage (up to 30 more maximum rage) and Precision (up to 3% hit), and Iron Will moved into Fury, where it shortens stuns and fears by up to 15%.",
    "Fury now includes Lingering Rage, Furious Precision, and Gore Drinker. Raging Blows reduces the cost of Cleave and Whirlwind, and Iron Will is in the Protection tree.");
  warrior.keyTalents = warrior.keyTalents.map((name) => name === "Precision" ? "Furious Precision" : name);
  warrior.tips = warrior.tips.map((tip) => tip.includes("Dual Wield Specialization adds 10% off-hand hit")
    ? "Furious Precision improves off-hand hit chance; compare it with the current talent tree before planning a dual-wield build." : tip);
  mage.cooldowns = mage.cooldowns.map((step) => step.spell === "Combustion"
    ? { ...step, note: replace(step.note, "4 fire crits", "3 charges") } : step);
  const renameMageTalent = (value) => value.replaceAll("Hot Streak", "Heating Up");
  guides.classes.Mage.overview = renameMageTalent(guides.classes.Mage.overview);
  for (const spec of guides.classes.Mage.specs) {
    spec.summary = renameMageTalent(spec.summary);
    spec.forever = spec.forever && renameMageTalent(spec.forever);
    spec.keyTalents = spec.keyTalents?.map(renameMageTalent);
    spec.tips = spec.tips?.map(renameMageTalent);
  }
  druid.forever = replace(druid.forever,
    "and King of the Jungle (Tiger's Fury grants up to 60 Energy)",
    "as well as Shifting Power (converts Mana into Energy) and Improved Shifting Power (shortens its cooldown)");
}
if (Object.keys(guides.classes ?? {}).length !== names.length) throw new Error("Expected all nine class guides.");
delete guides.disclaimer;
if (Object.keys(changes ?? {}).length !== names.length) throw new Error("Expected all nine class comparisons.");
for (const comparison of Object.values(changes)) {
  for (const key of ["abilitiesRemoved", "abilitiesInClientNotTaught", "abilitiesNowTalent", "abilitiesNotTrained", "abilitiesChanged", "abilitiesMerged", "talentsRemoved", "talentsBaseline", "talentsReplaced", "talentsHidden", "talentsMoved", "talentRanksChanged", "tooltipChanges", "coefficientChanges", "proficiency"]) {
    if (!Array.isArray(comparison[key])) throw new Error(`Incomplete class comparison: ${key}`);
  }
}
await mkdir(root, { recursive: true });
await mkdir(spellRoot, { recursive: true });
await writeFile(path.join(root, "class-guides.json"), JSON.stringify(guides));
await writeFile(path.join(root, "stats.json"), JSON.stringify(stats));
await writeFile(path.join(root, "game-build.json"), JSON.stringify({ version: datamine.version, cap: datamine.cap, nextCap: datamine.nextCap }));
await writeFile(path.join(root, "changes.json"), JSON.stringify(changes));
let abilityCount = 0;
let talentCount = 0;
for (const [index, name] of names.entries()) {
  const [writeups, playguides, builds, gearing] = other.slice(index * 4, index * 4 + 4);
  if (writeups.class?.toLowerCase() !== name || !writeups.abilities || !writeups.talents
    || Object.keys(playguides.specs ?? {}).length !== 3 || Object.keys(builds.specs ?? {}).length !== 3
    || Object.keys(gearing ?? {}).length !== 3) {
    throw new Error(`Incomplete guide data for ${name}.`);
  }
  for (const spec of Object.values(gearing)) for (const mode of ["pve", "pvp"]) for (const level of ["20", "30"]) {
    const slots = spec[mode]?.[level];
    if (!slots || Object.keys(slots).length !== 15 || Object.values(slots).some((choices) => !Array.isArray(choices))) {
      throw new Error(`Incomplete gear list for ${name}: ${mode} level ${level}`);
    }
  }
  abilityCount += Object.keys(writeups.abilities).length;
  talentCount += Object.keys(writeups.talents).length;
  await Promise.all([
    writeFile(path.join(spellRoot, `${name}.json`), JSON.stringify(writeups)),
    writeFile(path.join(root, `${name}-play.json`), JSON.stringify(playguides)),
    writeFile(path.join(root, `${name}-builds.json`), JSON.stringify(builds)),
    writeFile(path.join(root, `${name}-gearing.json`), JSON.stringify(gearing)),
  ]);
}
await writeFile(path.join(root, "manifest.json"), `${JSON.stringify({
  version: 1,
  importedAt: new Date().toISOString(),
  classCount: names.length,
  abilityWriteups: abilityCount,
  talentWriteups: talentCount,
  classComparisons: Object.keys(changes).length,
  classGearing: names.length,
  ...(datamine.version === "1.60.1.70205" ? {
    overviewCorrections: "Blizzard WoW Forever Beta Development Notes, October 1, 2026",
    overviewCorrectionSource: "https://us.forums.blizzard.com/en/wow/t/2360696",
  } : {}),
}, null, 2)}\n`);
console.log(`Imported ${names.length} class guides, Classic comparisons and gear catalogs, ${abilityCount} ability write-ups, ${talentCount} talent write-ups, plus PvE/PvP and build guides.`);
