import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(projectRoot, "map-sources", "extracted", "story-goals", "Gustav", "Act1_UND_ArcaneTower.txt");
const outputPath = path.join(projectRoot, "map-sources", "catalog", "arcane-tower-transport.json");
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
const buttons = [];
const positions = new Map();
const hiddenButtonIds = new Set();
let generator = null;
let secretRing = null;
let blockedArcanaDc = null;

for (let index = 0; index < lines.length; index += 1) {
  const statement = lines[index].trim();
  if (!generator && statement.startsWith("DB_UND_ArcaneGenerator(") && statement.match(guidPattern)) {
    generator = endpoint(splitArguments(statement)[0] ?? "");
  }
  if (statement.startsWith("DB_UND_ArcaneTeleport_Buttons(") && statement.match(guidPattern) && !statement.includes("NULL_")) {
    const arguments_ = splitArguments(statement);
    const button = endpoint(arguments_[0] ?? "");
    buttons.push({
      button,
      atFloor: Number(arguments_[1]),
      toFloor: Number(arguments_[2]),
      evidence: evidenceAt(lines, index),
    });
  }
  if (statement.startsWith("DB_UND_ArcaneTeleport_Positions(") && statement.match(guidPattern) && !statement.includes("NULL_")) {
    const arguments_ = splitArguments(statement);
    positions.set(Number(arguments_[1]), {
      floor: Number(arguments_[1]),
      destination: endpoint(arguments_[0] ?? ""),
      evidence: evidenceAt(lines, index),
    });
  }
  if (statement.startsWith("DB_UND_ArcaneTeleport_SecretRing_Zones(") && statement.match(guidPattern) && !statement.includes("NULL_")) {
    const button = endpoint(splitArguments(statement)[1] ?? "");
    if (button.objectId) hiddenButtonIds.add(button.objectId);
  }
  if (!secretRing && statement.startsWith("Equipped(S_UND_ArcaneTower_SecretRing_")) {
    secretRing = endpoint(splitArguments(statement)[0] ?? "");
  }
  if (!blockedArcanaDc && statement.startsWith("PROC_TrySkillCheck(_Player,_Button,\"Arcana\"")) {
    blockedArcanaDc = Number(statement.match(/DC_Legacy_(\d+)_/)?.[1]);
  }
}

const routes = buttons.map((button) => ({
  ...button,
  destination: positions.get(button.toFloor)?.destination,
  hidden: hiddenButtonIds.has(button.button.objectId),
}));
if (!generator?.objectId || !secretRing?.objectId || blockedArcanaDc !== 10
  || positions.size !== 6 || routes.length !== 12
  || routes.some(({ button, atFloor, toFloor, destination }) => !button.objectId || !Number.isInteger(atFloor) || !Number.isInteger(toFloor) || !destination?.objectId)
  || routes.filter(({ hidden }) => hidden).length !== 2) {
  throw new Error("Incomplete Arcane Tower transport extraction.");
}

const catalog = {
  schemaVersion: 1,
  sourceBuild: "24532579",
  stats: {
    floors: positions.size,
    routes: routes.length,
    hiddenButtons: routes.filter(({ hidden }) => hidden).length,
    powerSources: 1,
  },
  id: "arcane-tower-transport",
  title: "Arcane Tower Lift Network",
  generator,
  powerIngredient: "Sussur Bloom",
  blockedArcanaDc,
  secretRing,
  secretRingTitle: "Guiding Light",
  floors: [...positions.values()].sort((left, right) => left.floor - right.floor),
  routes,
};
fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Arcane Tower transport: ${catalog.stats.routes} exact routes across ${catalog.stats.floors} floors cataloged.`);
