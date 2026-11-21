import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(projectRoot, "map-sources", "extracted", "story-goals", "GustavDev", "Act2_SHA_Crypt.txt");
const outputPath = path.join(projectRoot, "map-sources", "catalog", "shar-entrance-puzzle.json");
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
const evidenceAt = (lines, index) => ({
  sourcePath: path.relative(projectRoot, sourcePath).split(path.sep).join("/"),
  sourceLine: index + 1,
  statement: lines[index].trim(),
});

const lines = fs.readFileSync(sourcePath, "utf8").split(/\r?\n/);
const braziers = [];
const detectors = [];
const rings = [];
const fireTrapPoints = [];
let centralSwitch = null;
let churchDoor = null;
let westDoor = null;
let floodTimer = null;

for (let index = 0; index < lines.length; index += 1) {
  const statement = lines[index].trim();
  if (statement.startsWith("DB_SHA_EntrancePuzzle_Braziers(\"") && statement.match(guidPattern)) {
    const arguments_ = splitArguments(statement);
    braziers.push({
      corner: arguments_[0]?.replace(/^"|"$/g, ""),
      brazier: endpoint(arguments_[1] ?? ""),
      upPosition: endpoint(arguments_[2] ?? ""),
      downPosition: endpoint(arguments_[3] ?? ""),
      evidence: evidenceAt(lines, index),
    });
  }
  if (statement.startsWith("DB_SHA_EntrancePuzzle_LightDetectors(\"") && statement.match(guidPattern)) {
    const arguments_ = splitArguments(statement);
    detectors.push({
      ring: arguments_[0]?.replace(/^"|"$/g, ""),
      detector: endpoint(arguments_[1] ?? ""),
      evidence: evidenceAt(lines, index),
    });
  }
  if (statement.startsWith("DB_SHA_Crypt_Rings((TRIGGER)S_SHA_")) rings.push(endpoint(splitArguments(statement)[0] ?? ""));
  if (statement.startsWith("DB_SHA_Crypt_FireTrapPoint(") && statement.match(guidPattern)) fireTrapPoints.push(endpoint(splitArguments(statement)[0] ?? ""));
  if (!centralSwitch && statement.startsWith("UseFinished(_, S_SHA_Crypt_TrapDefuser_")) centralSwitch = endpoint(splitArguments(statement)[1] ?? "");
  if (!churchDoor && statement.startsWith("ApplyStatus(S_SHA_Crypt_DoorToChurch_")) churchDoor = endpoint(splitArguments(statement)[0] ?? "");
  if (!westDoor && statement.startsWith("PROC_ItemUnlockAndOpen(S_SHA_Crypt_DoorToWestCrypt_")) westDoor = endpoint(splitArguments(statement)[0] ?? "");
  if (!floodTimer && statement.includes('"SHA_Crypt_FloodTimeout"')) floodTimer = Number(splitArguments(statement)[2]);
}

if (braziers.length !== 8 || new Set(braziers.map(({ corner }) => corner)).size !== 4
  || detectors.length !== 16 || detectors.filter(({ ring }) => ring === "SHA_InnerRing").length !== 8
  || detectors.filter(({ ring }) => ring === "SHA_OuterRing").length !== 8
  || rings.length !== 2 || fireTrapPoints.length !== 10
  || !centralSwitch?.objectId || !churchDoor?.objectId || !westDoor?.objectId || floodTimer !== 24000) {
  throw new Error("Incomplete Gauntlet of Shar entrance-puzzle extraction.");
}

const catalog = {
  schemaVersion: 1,
  sourceBuild: "24532579",
  stats: {
    braziers: braziers.length,
    corners: new Set(braziers.map(({ corner }) => corner)).size,
    lightDetectors: detectors.length,
    barrierRings: rings.length,
    fireTrapPoints: fireTrapPoints.length,
  },
  id: "shar-entrance-rings",
  title: "Gauntlet Entrance Ring Puzzle",
  braziers,
  detectors,
  rings,
  centralSwitch,
  results: {
    removesArcaneLockFrom: churchDoor,
    unlocksAndOpens: westDoor,
    disablesRingBarriers: true,
    blocksFireTrap: true,
  },
  hazards: {
    ringPushbackDelayMs: 4000,
    fireFloodTimer: floodTimer,
    fireTrapPoints,
  },
};
fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Shar entrance puzzle: ${catalog.stats.braziers} braziers, ${catalog.stats.lightDetectors} detectors, and ${catalog.stats.barrierRings} rings cataloged.`);
