import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(projectRoot, "map-sources", "extracted", "story-goals", "Act3_WYR_Wyrmway.txt");
const outputPath = path.join(projectRoot, "map-sources", "catalog", "wyrmway-puzzles.json");
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
const notationFrom = (token) => {
  const match = token.match(/S_WYR_Chess_([1-8])([a-h])_/i);
  return match ? `${match[2].toLocaleLowerCase("en-US")}${match[1]}` : token;
};
const evidenceAt = (lines, index) => ({
  sourcePath: path.relative(projectRoot, sourcePath).split(path.sep).join("/"),
  sourceLine: index + 1,
  statement: lines[index].trim(),
});
const justiceTitleFallbacks = new Map([
  ["WYR_Wyrmway_SolutionPainting1Name", "'The Hanging'"],
  ["WYR_Wyrmway_SolutionPainting2Name", "'Freedom'"],
  ["WYR_Wyrmway_SolutionPainting3Name", "'The Cell'"],
]);

const lines = fs.readFileSync(sourcePath, "utf8").split(/\r?\n/);
let chessAnchor = null;
let insightAnchor = null;
let courageAnchor = null;
let justiceAnchor = null;
const activeVariants = new Set();
const chessSolutions = new Map();
const suspects = [];
const evidenceBooks = [];
const justicePaintings = [];
const courageEnemies = [];
let justiceCorrectPainting = null;
let courageTorch = null;
let courageArena = null;
let courageTimer = null;
let currentVariant = null;

for (let index = 0; index < lines.length; index += 1) {
  const statement = lines[index].trim();
  if (statement.startsWith("DB_WYR_Wyrmway_IndicatorStatues(")) {
    const arguments_ = splitArguments(statement);
    const key = arguments_.at(-1)?.replace(/^"|"$/g, "");
    if (key === "WYM_Wyrmway_Chess") chessAnchor = endpoint(arguments_[0] ?? "");
    if (key === "WYM_Wyrmway_InsightPuzzle") insightAnchor = endpoint(arguments_[0] ?? "");
    if (key === "WYM_Wyrmway_CouragePuzzle") courageAnchor = endpoint(arguments_[0] ?? "");
    if (key === "WYR_Wyrmway_PaintingPuzzle") justiceAnchor = endpoint(arguments_[0] ?? "");
  }
  if (statement.startsWith("DB_WYR_Chess_SetupFlag(")) {
    const variant = Number(splitArguments(statement)[0]);
    if (Number.isInteger(variant)) activeVariants.add(variant);
  }
  const setupVariant = statement.match(/^PROC_WYR_Chess_Setup\((\d+)\)$/)?.[1];
  if (setupVariant) currentVariant = Number(setupVariant);
  if (statement.startsWith("DB_WYR_Chess_Solution(") && currentVariant && activeVariants.has(currentVariant)) {
    const arguments_ = splitArguments(statement);
    const from = endpoint(arguments_[1] ?? "");
    const to = endpoint(arguments_[2] ?? "");
    if (from.objectId && to.objectId) {
      const moves = chessSolutions.get(currentVariant) ?? [];
      moves.push({
        step: Number(arguments_[0]),
        from: { ...from, notation: notationFrom(from.token) },
        to: { ...to, notation: notationFrom(to.token) },
        evidence: evidenceAt(lines, index),
      });
      chessSolutions.set(currentVariant, moves);
    }
  }
  if (statement.startsWith("DB_WYR_InsightPuzzle_Suspect(") && statement.match(guidPattern)) {
    const arguments_ = splitArguments(statement);
    const suspect = endpoint(arguments_[0] ?? "");
    if (suspect.objectId) suspects.push({ ...suspect, correct: Number(arguments_[1]) === 1, evidence: evidenceAt(lines, index) });
  }
  if (statement.startsWith("DB_WYR_InsightPuzzle_Birds(") && statement.match(guidPattern)) {
    const arguments_ = splitArguments(statement);
    const bird = endpoint(arguments_[0] ?? "");
    const book = endpoint(arguments_[1] ?? "");
    if (bird.objectId && book.objectId) evidenceBooks.push({ bird, book, evidence: evidenceAt(lines, index) });
  }
  if (statement.startsWith("DB_WYR_PaintingPuzzle_SolutionPaintings(") && statement.match(guidPattern)) {
    const arguments_ = splitArguments(statement);
    const painting = endpoint(arguments_[0] ?? "");
    const solvedPainting = endpoint(arguments_[1] ?? "");
    const ownDisplayTrigger = endpoint(arguments_[2] ?? "");
    if (painting.objectId && solvedPainting.objectId && ownDisplayTrigger.objectId) {
      justicePaintings.push({
        painting,
        solvedPainting,
        ownDisplayTrigger,
        displayNameKey: arguments_.at(-1)?.replace(/^"|"$/g, ""),
        evidence: evidenceAt(lines, index),
      });
    }
  }
  const correctPaintingMatch = statement.match(/^PROC_WYR_PaintingPuzzle_PaintingSolveAttempt\(\(ITEM\)(S_WYR_PaintingPuzzle_SolutionPainting\d+_[0-9a-f-]{36}), _\)$/i);
  if (correctPaintingMatch) justiceCorrectPainting = endpoint(correctPaintingMatch[1]);
  if (statement.startsWith("DB_WYR_CourageTrial_Enemies(") && statement.match(guidPattern)) {
    const arguments_ = splitArguments(statement);
    const enemy = endpoint(arguments_[1] ?? "");
    if (enemy.objectId) courageEnemies.push({ phase: Number(arguments_[0]), enemy, evidence: evidenceAt(lines, index) });
  }
  if (!courageTorch && statement.startsWith("ApplyStatus(S_WYR_CourageTest_Torch_")) {
    courageTorch = endpoint(statement.match(/S_WYR_CourageTest_Torch_[0-9a-f-]{36}/i)?.[0] ?? "");
  }
  if (!courageArena && statement.startsWith("LeftTrigger(_Character, S_WYR_Wyrmway_TestArea_")) {
    courageArena = endpoint(statement.match(/S_WYR_Wyrmway_TestArea_[0-9a-f-]{36}/i)?.[0] ?? "");
  }
  const timerMatch = statement.match(/^TurnBasedTimerLaunch\([^,]+, "WYR_CourageTest_General", "WYR_CourageTrial_TimerName", (\d+)\);$/);
  if (timerMatch) courageTimer = Number(timerMatch[1]);
}

const variants = [...activeVariants].sort().map((variant) => ({
  variant,
  moves: (chessSolutions.get(variant) ?? []).sort((left, right) => left.step - right.step),
}));
if (!chessAnchor?.objectId || !insightAnchor?.objectId || !courageAnchor?.objectId || !justiceAnchor?.objectId || variants.length !== 3
  || variants.some(({ moves }) => moves.length !== 3) || suspects.length !== 3
  || suspects.filter(({ correct }) => correct).length !== 1 || evidenceBooks.length !== 3
  || justicePaintings.length !== 3 || !justiceCorrectPainting?.objectId
  || !justicePaintings.some(({ painting }) => painting.objectId === justiceCorrectPainting.objectId)
  || courageEnemies.length !== 8 || !courageTorch?.objectId || !courageArena?.objectId || courageTimer !== 24000) {
  throw new Error("Incomplete Wyrmway trial extraction.");
}

const catalog = {
  schemaVersion: 1,
  sourceBuild: "24532579",
  stats: {
    puzzles: 4,
    activeChessVariants: variants.length,
    chessMoves: variants.reduce((count, { moves }) => count + moves.length, 0),
    insightSuspects: suspects.length,
    insightEvidenceBooks: evidenceBooks.length,
    justicePaintings: justicePaintings.length,
    courageEnemies: courageEnemies.length,
    couragePhases: new Set(courageEnemies.map(({ phase }) => phase)).size,
  },
  chess: {
    id: "wyrmway-chess",
    title: "Chamber of Strategy",
    anchor: chessAnchor,
    variants,
  },
  insight: {
    id: "wyrmway-insight",
    title: "Chamber of Insight",
    anchor: insightAnchor,
    suspects,
    evidenceBooks,
  },
  justice: {
    id: "wyrmway-justice",
    title: "Chamber of Justice",
    anchor: justiceAnchor,
    paintings: justicePaintings.map((painting) => ({
      ...painting,
      fallbackTitle: justiceTitleFallbacks.get(painting.displayNameKey),
      correct: painting.painting.objectId === justiceCorrectPainting.objectId,
    })),
  },
  courage: {
    id: "wyrmway-courage",
    title: "Chamber of Courage",
    anchor: courageAnchor,
    torch: courageTorch,
    arena: courageArena,
    timer: courageTimer,
    enemies: courageEnemies,
    failureConditions: ["torch-bearer-defeated", "torch-bearer-left-arena"],
  },
};
fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Wyrmway puzzles: ${catalog.stats.puzzles} trials, ${catalog.stats.chessMoves} chess moves, ${catalog.stats.justicePaintings} paintings, and ${catalog.stats.courageEnemies} courage enemies cataloged.`);
