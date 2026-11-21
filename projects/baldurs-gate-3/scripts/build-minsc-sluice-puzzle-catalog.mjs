import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(projectRoot, "map-sources", "extracted", "story-goals", "GustavDev", "Act3b_LOW_MinscHideout.txt");
const difficultyPath = path.join(projectRoot, "map-sources", "extracted", "dialogs", "difficulty-classes.lsx");
const outputPath = path.join(projectRoot, "map-sources", "catalog", "minsc-sluice-puzzle.json");
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
const numberFrom = (value) => Number.parseFloat(value);
const unquote = (value) => value.replace(/^"|"$/g, "");
const evidenceAt = (lines, index) => ({
  sourcePath: path.relative(projectRoot, sourcePath).split(path.sep).join("/"),
  sourceLine: index + 1,
  statement: lines[index].trim(),
});

const lines = fs.readFileSync(sourcePath, "utf8").split(/\r?\n/);
const valves = new Map();
const indicators = new Map();
const stages = new Map();
const incrementTimers = new Map();
const gates = [];
const forceValves = [];
const disabledValves = [];
let forceCheck = null;
let releaseValve = null;
let heatDurationSeconds = null;
let coolDurationSeconds = null;
let solutionStageMatches = 0;
let releaseToStageMatches = 0;

for (let index = 0; index < lines.length; index += 1) {
  const statement = lines[index].trim();
  if (statement.startsWith("DB_LOW_MinscHideout_Valves(") && statement.match(guidPattern)) {
    const valve = endpoint(splitArguments(statement)[0] ?? "");
    const kind = valve.token.includes("WaterValve") ? "water" : valve.token.includes("TemperatureValve") ? "temperature" : null;
    if (kind) valves.set(valve.objectId, { kind, valve, evidence: evidenceAt(lines, index) });
  }
  if (statement.startsWith("DB_LOW_MinscHideout_ValveIndicators(") && statement.match(guidPattern)) {
    const arguments_ = splitArguments(statement);
    const valve = endpoint(arguments_[0] ?? "");
    const indicator = endpoint(arguments_[1] ?? "");
    indicators.set(valve.objectId, { indicator, evidence: evidenceAt(lines, index) });
  }
  if (statement.startsWith("DB_LOW_MinscHideout_ValveStatuses(") && statement.match(guidPattern)) {
    const arguments_ = splitArguments(statement);
    const valve = endpoint(arguments_[0] ?? "");
    const entries = stages.get(valve.objectId) ?? [];
    entries.push({
      status: unquote(arguments_[1] ?? ""),
      durationSeconds: numberFrom(arguments_[2] ?? ""),
      stage: numberFrom(arguments_[3] ?? ""),
      evidence: evidenceAt(lines, index),
    });
    stages.set(valve.objectId, entries);
  }
  if (statement.startsWith("DB_LOW_MinscHideout_ValveTimerStatuses(")) {
    const arguments_ = splitArguments(statement);
    const valve = endpoint(arguments_[0] ?? "");
    incrementTimers.set(valve.objectId, {
      status: unquote(arguments_[1] ?? ""),
      durationSeconds: numberFrom(arguments_[2] ?? ""),
      evidence: evidenceAt(lines, index),
    });
  }
  if (statement.startsWith("DB_LOW_MinscHideout_SluiceGates(") && statement.match(guidPattern)) {
    const arguments_ = splitArguments(statement);
    const gate = endpoint(arguments_[0] ?? "");
    const blocker = endpoint(arguments_[1] ?? "");
    if (gate.objectId && blocker.objectId) gates.push({ gate, blocker, evidence: evidenceAt(lines, index) });
  }
  if (statement.startsWith('DB_KnowledgeCheckItem_AD("LOW_MinscHideout_ForceValveRoll"')) {
    const arguments_ = splitArguments(statement);
    forceValves.push({ valve: endpoint(arguments_[1] ?? ""), evidence: evidenceAt(lines, index) });
    const difficulty = endpoint(arguments_[3] ?? "");
    forceCheck = {
      skill: unquote(arguments_[2] ?? ""),
      difficultyClassId: difficulty.objectId,
      difficultyClassName: difficulty.token.replace(/_[0-9a-f-]{36}$/i, ""),
    };
  }
  if (statement.startsWith("DB_LOW_MinscHideout_DisabledValves(") && statement.match(guidPattern)) {
    disabledValves.push(endpoint(splitArguments(statement)[0] ?? ""));
  }
  if (!releaseValve && statement.startsWith("UseStarted(_, (ITEM)S_LOW_MinscHideout_ReleaseValve_")) releaseValve = endpoint(splitArguments(statement)[1] ?? "");
  if (statement.startsWith("ApplyStatus(S_LOW_MinscHideout_TemperatureValve_") && statement.includes("_HEATUP")) {
    heatDurationSeconds = numberFrom(splitArguments(statement)[2] ?? "");
  }
  if (statement.startsWith("ApplyStatus(S_LOW_MinscHideout_TemperatureValve_") && statement.includes("_COOLDOWN")) {
    coolDurationSeconds = numberFrom(splitArguments(statement)[2] ?? "");
  }
  if (/DB_LOW_MinscHideout_ValveStatuses\([^\n]*,\s*2\)/.test(statement)) solutionStageMatches += 1;
  if (statement === "DB_LOW_MinscHideout_ValveStatuses(_Valve, _Status, _StatusDuration, 3)") releaseToStageMatches += 1;
}

const difficultySource = fs.readFileSync(difficultyPath, "utf8");
const difficultyNode = [...difficultySource.matchAll(/<node id="DifficultyClass">([\s\S]*?)<\/node>/g)]
  .map((match) => match[1])
  .find((node) => node.includes(`value="${forceCheck?.difficultyClassId}"`));
const difficultyClass = Number.parseInt(difficultyNode?.match(/id="Difficulties"[^>]*value="(\d+)"/)?.[1] ?? "", 10);
forceCheck = { ...forceCheck, difficultyClass };

const valveEntries = [...valves.values()].map((entry) => ({
  ...entry,
  ...indicators.get(entry.valve.objectId),
  stages: (stages.get(entry.valve.objectId) ?? []).sort((left, right) => left.stage - right.stage),
  incrementTimer: incrementTimers.get(entry.valve.objectId),
})).sort((left, right) => left.kind.localeCompare(right.kind, "en"));

if (valveEntries.length !== 2 || valveEntries.some(({ indicator, stages: entries, incrementTimer }) => !indicator?.objectId || entries.length !== 4 || !incrementTimer)
  || gates.length !== 2 || forceValves.length !== 2 || disabledValves.length !== 1 || !releaseValve?.objectId
  || forceCheck.skill !== "Athletics" || forceCheck.difficultyClass !== 25
  || heatDurationSeconds !== 6 || coolDurationSeconds !== 6 || solutionStageMatches < 2 || releaseToStageMatches !== 1) {
  throw new Error(`Incomplete Minsc sluice-puzzle extraction: ${JSON.stringify({
    valves: valveEntries.length,
    valveDetails: valveEntries.map(({ indicator, stages: entries, incrementTimer }) => ({ indicator: indicator?.objectId, stages: entries.length, incrementTimer })),
    gates: gates.length,
    forceValves: forceValves.length,
    disabledValves: disabledValves.length,
    releaseValve: releaseValve?.objectId,
    forceCheck,
    heatDurationSeconds,
    coolDurationSeconds,
    solutionStageMatches,
    releaseToStageMatches,
  })}`);
}

const catalog = {
  schemaVersion: 1,
  sourceBuild: "24532579",
  stats: {
    valves: valveEntries.length,
    indicators: indicators.size,
    authoredStages: valveEntries.reduce((sum, valve) => sum + valve.stages.length, 0),
    gates: gates.length,
    forceValves: forceValves.length,
    releaseValves: 1,
    disabledValves: disabledValves.length,
  },
  id: "minsc-sluice-puzzle",
  title: "Abandoned Cistern Sluice Puzzle",
  solutionStage: 2,
  valves: valveEntries,
  gates,
  forceValves,
  forceCheck,
  releaseValve,
  disabledValves,
  elementalAdjustment: {
    targetValveId: valveEntries.find(({ kind }) => kind === "temperature").valve.objectId,
    heatDamageType: "Fire",
    coolDamageType: "Cold",
    heatDurationSeconds,
    coolDurationSeconds,
  },
  overload: {
    stage: 4,
    durationSeconds: -1,
    releaseToStage: 3,
    waterHazard: "steam-blast",
    temperatureHazard: "fire-blast",
  },
};

fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Minsc sluice puzzle: ${catalog.stats.valves} timed valves, ${catalog.stats.authoredStages} stages, ${catalog.stats.gates} gates, and DC ${forceCheck.difficultyClass} bypass cataloged.`);
