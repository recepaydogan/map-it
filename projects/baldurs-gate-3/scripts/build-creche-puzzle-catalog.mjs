import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const statueSourcePath = path.join(projectRoot, "map-sources", "extracted", "story-goals", "GustavDev", "Act1b_CRE_StatuePuzzle.txt");
const weaponsSourcePath = path.join(projectRoot, "map-sources", "extracted", "story-goals", "GustavDev", "Act1b_CRE_WeaponsPuzzle.txt");
const outputPath = path.join(projectRoot, "map-sources", "catalog", "creche-puzzles.json");
const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const splitArguments = (statement) => {
  const body = statement.slice(statement.indexOf("(") + 1, statement.lastIndexOf(")"));
  const output = [];
  let current = "";
  let depth = 0;
  let quoted = false;
  for (const character of body) {
    if (character === '"') quoted = !quoted;
    if (!quoted && character === "(") depth += 1;
    if (!quoted && character === ")") depth -= 1;
    if (!quoted && depth === 0 && character === ",") {
      output.push(current.trim());
      current = "";
    } else current += character;
  }
  output.push(current.trim());
  return output;
};
const endpoint = (argument) => ({
  objectId: argument.match(guidPattern)?.[0]?.toLocaleLowerCase("en-US"),
  token: argument.replace(/^\([A-Z]+\)/, "").trim(),
});
const sourceEvidence = (sourcePath, lines, index) => ({
  sourcePath: path.relative(projectRoot, sourcePath).split(path.sep).join("/"),
  sourceLine: index + 1,
  statement: lines[index].trim(),
});
const abbotIndex = (token) => Number(token.match(/Abbot(\d)/i)?.[1]);
const singularWeaponType = (value) => ({
  Maces: "Mace",
  Longswords: "Longsword",
  Warhammers: "Warhammer",
  Battleaxes: "Battleaxe",
})[value] ?? value;

const statueLines = fs.readFileSync(statueSourcePath, "utf8").split(/\r?\n/);
const statues = [];
const statueBases = new Map();
const rustRemovalSurfaces = [];
let statueBook = null;
let statueDoor = null;
let rotationStepDegrees = null;
let athleticsDc = null;
let damageThreshold = null;

for (let index = 0; index < statueLines.length; index += 1) {
  const statement = statueLines[index].trim();
  if (statement.startsWith("DB_CRE_LathanderStatues(") && statement.match(guidPattern)) {
    const arguments_ = splitArguments(statement);
    const statue = endpoint(arguments_[0] ?? "");
    const minRotationY = Number(arguments_[1]);
    const maxRotationY = Number(arguments_[2]);
    if (Number.isFinite(minRotationY) && Number.isFinite(maxRotationY)) {
      statues.push({
        statue,
        role: /Sunrise/i.test(statue.token) ? "sunrise" : "sunset",
        minRotationY,
        maxRotationY,
        evidence: sourceEvidence(statueSourcePath, statueLines, index),
      });
    }
  }
  if (statement.startsWith("DB_CRE_LathanderStatueBases(") && statement.match(guidPattern)) {
    const arguments_ = splitArguments(statement);
    const statue = endpoint(arguments_[0] ?? "");
    const base = endpoint(arguments_[1] ?? "");
    if (statue.objectId && base.objectId) statueBases.set(statue.objectId, base);
  }
  if (statement.startsWith("DB_CRE_SurfacesThatEndRust(")) {
    const value = splitArguments(statement)[0];
    if (value?.startsWith('"')) rustRemovalSurfaces.push(value.replace(/^"|"$/g, ""));
  }
  if (!statueBook && statement.startsWith("UseStarted(_Player, CRE_StatuePuzzle_Book_")) {
    statueBook = endpoint(splitArguments(statement)[1] ?? "");
  }
  if (!rotationStepDegrees && statement.startsWith("ItemRotateY(_Statue,")) {
    rotationStepDegrees = Number(splitArguments(statement)[1]);
  }
  if (!athleticsDc && statement.startsWith("PROC_KnowledgeCheck(_Player, \"CRE_StatuePuzzle_StuckStatue_AthleticsCheck\"")) {
    athleticsDc = Number(statement.match(/DC_Legacy_(\d+)_/)?.[1]);
  }
  const damageMatch = statement.match(/^_DamageAmount>=(\d+)$/);
  if (damageMatch) damageThreshold = Number(damageMatch[1]);
  if (!statueDoor && statement.startsWith("ItemMoveTo(S_CRE_StatuePuzzle_HiddenDoor_")) {
    statueDoor = endpoint(splitArguments(statement)[0] ?? "");
  }
}
for (const statue of statues) statue.base = statueBases.get(statue.statue.objectId);

const weaponsLines = fs.readFileSync(weaponsSourcePath, "utf8").split(/\r?\n/);
const pedestalRequirements = new Map();
const ceremonialWeapons = new Map();
const plaques = new Map();
let rewardContainer = null;
let rewardDoor = null;
let incorrectWeaponDamage = null;
let incorrectWeaponDamageType = null;
let knockdownDuration = null;

for (let index = 0; index < weaponsLines.length; index += 1) {
  const statement = weaponsLines[index].trim();
  if (statement.startsWith("DB_CRE_WeaponPuzzle_ContainersAndWeapons(") && statement.match(guidPattern)) {
    const arguments_ = splitArguments(statement);
    const trigger = endpoint(arguments_[0] ?? "");
    const index_ = abbotIndex(trigger.token);
    pedestalRequirements.set(index_, {
      index: index_,
      trigger,
      weaponType: singularWeaponType(arguments_[1]?.replace(/^"|"$/g, "")),
      completionFlag: endpoint(arguments_[2] ?? ""),
      evidence: sourceEvidence(weaponsSourcePath, weaponsLines, index),
    });
  }
  if (statement.startsWith("DB_CRE_WeaponPuzzle_CeremonialWeapons(") && statement.match(guidPattern)) {
    const weapon = endpoint(splitArguments(statement)[0] ?? "");
    ceremonialWeapons.set(abbotIndex(weapon.token), weapon);
  }
  if (statement.startsWith("DB_ItemDialog_NarratorAD(S_CRE_Abbot") && statement.match(guidPattern)) {
    const plaque = endpoint(splitArguments(statement)[0] ?? "");
    plaques.set(abbotIndex(plaque.token), plaque);
  }
  if (!rewardContainer && statement.startsWith("PROC_SetOnStage(S_CRE_WeaponsPuzzle_Bag_")) {
    rewardContainer = endpoint(splitArguments(statement)[0] ?? "");
  }
  if (!rewardDoor && statement.startsWith("ItemMoveTo(S_CRE_WeaponsPuzzle_HiddenDoor_")) {
    rewardDoor = endpoint(splitArguments(statement)[0] ?? "");
  }
  if (!incorrectWeaponDamage && statement.startsWith("ApplyDamage(_Player,")) {
    const arguments_ = splitArguments(statement);
    incorrectWeaponDamage = Number(arguments_[1]);
    incorrectWeaponDamageType = arguments_[2]?.replace(/^"|"$/g, "");
  }
  if (!knockdownDuration && statement.startsWith("ApplyStatus(_Player, \"KNOCKED_DOWN\"")) {
    knockdownDuration = Number(splitArguments(statement)[2]);
  }
}

const pedestals = [...pedestalRequirements.values()].sort((left, right) => left.index - right.index).map((pedestal) => ({
  ...pedestal,
  plaque: plaques.get(pedestal.index),
  ceremonialWeapon: ceremonialWeapons.get(pedestal.index),
  preSolved: pedestal.index === 2,
}));
if (statues.length !== 2 || statues.some(({ statue, base, minRotationY, maxRotationY }) => !statue.objectId || !base?.objectId || !Number.isFinite(minRotationY) || !Number.isFinite(maxRotationY))
  || rustRemovalSurfaces.length !== 3 || !statueBook?.objectId || !statueDoor?.objectId || rotationStepDegrees !== 90 || athleticsDc !== 25 || damageThreshold !== 10
  || pedestals.length !== 4 || pedestals.some(({ trigger, plaque, ceremonialWeapon }) => !trigger.objectId || !plaque?.objectId || !ceremonialWeapon?.objectId)
  || !rewardContainer?.objectId || !rewardDoor?.objectId || incorrectWeaponDamage !== 5 || incorrectWeaponDamageType !== "Piercing" || knockdownDuration !== 2) {
  throw new Error(`Incomplete Creche puzzle extraction: ${JSON.stringify({
    statues: statues.length,
    statueBases: statueBases.size,
    rustRemovalSurfaces,
    statueBook,
    statueDoor,
    rotationStepDegrees,
    athleticsDc,
    damageThreshold,
    pedestals: pedestals.length,
    plaques: plaques.size,
    ceremonialWeapons: ceremonialWeapons.size,
    rewardContainer,
    rewardDoor,
    incorrectWeaponDamage,
    incorrectWeaponDamageType,
    knockdownDuration,
  })}`);
}

const catalog = {
  schemaVersion: 1,
  sourceBuild: "24532579",
  stats: {
    puzzles: 2,
    statues: statues.length,
    weaponPedestals: pedestals.length,
    ceremonialWeapons: ceremonialWeapons.size,
    exactRewardContainers: 1,
  },
  statuePuzzle: {
    id: "creche-lathander-statues",
    title: "Lathander Statue Puzzle",
    statues,
    clueBook: statueBook,
    rotationStepDegrees,
    stuckSunsetSolutions: {
      surfaces: rustRemovalSurfaces,
      minimumDamage: damageThreshold,
      athleticsDc,
    },
    resultDoor: statueDoor,
  },
  weaponsPuzzle: {
    id: "creche-ceremonial-weapons",
    title: "Dawnmaster's Ceremonial Weapons",
    pedestals,
    acceptsGenericWeapons: true,
    incorrectWeaponPenalty: {
      damage: incorrectWeaponDamage,
      damageType: incorrectWeaponDamageType,
      knockdownDuration,
    },
    reward: {
      container: rewardContainer,
      hiddenDoor: rewardDoor,
    },
  },
};
fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Creche puzzles: ${catalog.stats.statues} statue rotations and ${catalog.stats.weaponPedestals} exact weapon pedestals cataloged.`);
