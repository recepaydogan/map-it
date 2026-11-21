import fs from "node:fs";
import path from "node:path";

const parseArguments = (values) => {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    }
    result.set(key.slice(2), value);
  }
  for (const required of ["source", "recipe", "output"]) {
    if (!result.has(required)) throw new Error(`Missing required argument: --${required}`);
  }
  return result;
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const normalizeId = (value) => value?.toLocaleLowerCase("en-US");

const resolveEvidence = (sourceRoot, evidence) => {
  const sourcePath = path.resolve(sourceRoot, evidence.file);
  const relativePath = path.relative(sourceRoot, sourcePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Evidence path escapes the source root: ${evidence.file}.`);
  }
  const source = fs.readFileSync(sourcePath, "utf8");
  const matches = [];
  let cursor = 0;
  while (cursor <= source.length) {
    const index = source.indexOf(evidence.needle, cursor);
    if (index < 0) break;
    matches.push(index);
    cursor = index + Math.max(evidence.needle.length, 1);
  }
  if (matches.length === 0) throw new Error(`Evidence text was not found in ${evidence.file}: ${evidence.needle}`);
  const occurrence = evidence.occurrence ?? 1;
  if (!Number.isInteger(occurrence) || occurrence < 1) {
    throw new Error(`Evidence occurrence must be a positive integer in ${evidence.file}.`);
  }
  if (evidence.occurrence === undefined && matches.length > 1) {
    throw new Error(`Evidence text is ambiguous in ${evidence.file}; select one of ${matches.length} occurrences: ${evidence.needle}`);
  }
  const index = matches[occurrence - 1];
  if (index === undefined) {
    throw new Error(`Evidence occurrence ${occurrence} exceeds ${matches.length} matches in ${evidence.file}.`);
  }
  return {
    provenance: evidence.file.split(path.sep).join("/"),
    sourceLine: source.slice(0, index).split("\n").length,
    statement: evidence.needle,
    ...(matches.length > 1 ? { occurrence } : {}),
  };
};

const main = () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const sourceRoot = path.resolve(arguments_.get("source"));
  const recipe = readJson(path.resolve(arguments_.get("recipe")));
  if (recipe.schemaVersion !== 1 || !Array.isArray(recipe.risks)) {
    throw new Error("The story-risk recipe must use schemaVersion 1 and contain a risks array.");
  }
  const seen = new Set();
  const risks = recipe.risks.map((risk) => {
    const targetObjectId = normalizeId(risk.targetObjectId);
    if (!risk.id || !targetObjectId || !risk.type || !risk.title || !risk.severity) {
      throw new Error("Every story risk needs an id, targetObjectId, type, title and severity.");
    }
    if (seen.has(risk.id)) throw new Error(`Duplicate story-risk id: ${risk.id}.`);
    seen.add(risk.id);
    return {
      ...risk,
      targetObjectId,
      evidence: risk.evidence.map((entry) => resolveEvidence(sourceRoot, entry)),
    };
  });
  const byTarget = {};
  for (const risk of risks) (byTarget[risk.targetObjectId] ??= []).push(risk);
  const outputPath = path.resolve(arguments_.get("output"));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    sourceBuild: arguments_.get("source-build") ?? undefined,
    stats: {
      risks: risks.length,
      targetObjects: Object.keys(byTarget).length,
      evidenceStatements: risks.reduce((total, risk) => total + risk.evidence.length, 0),
    },
    risks,
    byTarget,
  }, null, 2)}\n`);
  console.log(`Story risks: ${risks.length} curator-verified rules across ${Object.keys(byTarget).length} exact target objects.`);
};

try {
  main();
} catch (error) {
  console.error("Story-risk catalog build failed:", error);
  process.exitCode = 1;
}
