import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(projectRoot, "map-sources", "extracted", "story-goals", "GustavDev", "Act3_WYR_SerialKiller_OpenHand.txt");
const outputPath = path.join(projectRoot, "map-sources", "catalog", "secret-puzzles.json");
const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const splitArguments = (statement) => {
  const body = statement.slice(statement.indexOf("(") + 1, statement.lastIndexOf(")"));
  const output = [];
  let current = "";
  let depth = 0;
  for (const character of body) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth === 0 && character === ",") {
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

const lines = fs.readFileSync(sourcePath, "utf8").split(/\r?\n/);
const pairs = [];
let target = null;
const evidence = [];
for (let index = 0; index < lines.length; index += 1) {
  const statement = lines[index].trim();
  if (statement.startsWith("DB_WYR_OpenHand_Buttons(") && statement.match(guidPattern)) {
    const arguments_ = splitArguments(statement);
    const button = endpoint(arguments_[0] ?? "");
    const stone = endpoint(arguments_[1] ?? "");
    const movedPosition = endpoint(arguments_[2] ?? "");
    if (button.objectId && stone.objectId && movedPosition.objectId) {
      pairs.push({ button, stone, movedPosition });
      evidence.push({ sourcePath: path.relative(projectRoot, sourcePath).split(path.sep).join("/"), sourceLine: index + 1, statement });
    }
  }
  if (!target && statement.startsWith("Open((ITEM)S_WYR_OpenHand_CellarSlidingWall_")) {
    target = endpoint(statement);
    evidence.push({ sourcePath: path.relative(projectRoot, sourcePath).split(path.sep).join("/"), sourceLine: index + 1, statement });
  }
}

if (pairs.length !== 2 || !target?.objectId) {
  throw new Error(`Incomplete Open Hand secret-door puzzle extraction: pairs=${pairs.length}, target=${Boolean(target?.objectId)}.`);
}

const puzzle = {
  id: "open-hand-secret-tunnel",
  title: "Open Hand Temple Secret Tunnel",
  kind: "reveal-two-buttons",
  requiredButtonCount: pairs.length,
  pairs,
  target,
  evidence,
};
const byObjectId = {};
for (const pair of pairs) {
  byObjectId[pair.stone.objectId] = { puzzleId: puzzle.id, role: "stone", pairIndex: pairs.indexOf(pair) };
  byObjectId[pair.button.objectId] = { puzzleId: puzzle.id, role: "button", pairIndex: pairs.indexOf(pair) };
}
byObjectId[target.objectId] = { puzzleId: puzzle.id, role: "target" };

const catalog = {
  schemaVersion: 1,
  sourceBuild: "24532579",
  stats: { puzzles: 1, objectLinks: Object.keys(byObjectId).length, requiredButtons: pairs.length },
  puzzles: [puzzle],
  byObjectId,
};
fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Secret puzzles: ${catalog.stats.puzzles} exact chain across ${catalog.stats.objectLinks} placed objects cataloged.`);
