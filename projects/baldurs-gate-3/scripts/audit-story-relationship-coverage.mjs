import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const storyRoot = path.join(projectRoot, "map-sources", "extracted", "story-goals");
const catalogRoot = path.join(projectRoot, "map-sources", "catalog");
const outputPath = path.join(catalogRoot, "story-relationship-audit.json");
const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const emptyGuid = "00000000-0000-0000-0000-000000000000";
const highValuePredicatePattern = /ambush|book|container|crime|dialog|dig|door|give|hasitem|item|key|ladder|lock|loot|owner|portal|puzzle|quest|recipe|reward|secret|shovel|spell|teleport|trade|trap|treasure|trigger|unlock|use/i;

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
});

const stripComment = (value) => {
  const commentIndex = value.indexOf("//");
  return (commentIndex >= 0 ? value.slice(0, commentIndex) : value).trim();
};
const normalizeStoryPath = (value) => String(value ?? "")
  .replaceAll("\\", "/")
  .replace(/^.*?story-goals\//i, "")
  .replace(/^.*?\/(Gustav(?:Dev)?\/)/i, "$1");

const parseStatements = (filePath) => {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const statements = [];
  for (let index = 0; index < lines.length; index += 1) {
    const sourceLine = index + 1;
    let statement = stripComment(lines[index]).replace(/^(?:AND|NOT)\s+/, "").trim();
    if (!/^[A-Za-z][A-Za-z0-9_]*\s*\(/.test(statement)) continue;
    let balance = [...statement].reduce((value, character) => (
      value + (character === "(" ? 1 : character === ")" ? -1 : 0)
    ), 0);
    while (balance > 0 && index + 1 < lines.length) {
      index += 1;
      const next = stripComment(lines[index]);
      statement += ` ${next}`;
      balance += [...next].reduce((value, character) => (
        value + (character === "(" ? 1 : character === ")" ? -1 : 0)
      ), 0);
    }
    const predicate = statement.match(/^([A-Za-z][A-Za-z0-9_]*)\s*\(/)?.[1];
    if (!predicate) continue;
    const guids = [...new Set((statement.match(guidPattern) ?? [])
      .map((guid) => guid.toLocaleLowerCase("en-US"))
      .filter((guid) => guid !== emptyGuid))];
    if (guids.length < 2) continue;
    statements.push({
      predicate,
      guids,
      signature: `${predicate}:${[...guids].sort().join(":")}`,
      sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
      sourceKey: `${normalizeStoryPath(path.relative(projectRoot, filePath))}:${sourceLine}`,
      sourceLine,
      statement: statement.replace(/\s+/g, " "),
    });
  }
  return statements;
};

const collectEvidence = (value, statements, locations) => {
  if (Array.isArray(value)) {
    for (const item of value) collectEvidence(item, statements, locations);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (typeof value.statement === "string") statements.push(value.statement);
  if (Number.isInteger(value.sourceLine)) {
    const sourcePath = typeof value.sourcePath === "string"
      ? value.sourcePath
      : typeof value.provenance === "string"
        ? value.provenance
        : null;
    if (sourcePath?.toLocaleLowerCase("en-US").endsWith(".txt")) {
      locations.add(`${normalizeStoryPath(sourcePath)}:${value.sourceLine}`);
    }
  }
  for (const nested of Object.values(value)) collectEvidence(nested, statements, locations);
};

const catalogFiles = fs.readdirSync(catalogRoot)
  .filter((name) => name.endsWith(".json"))
  .filter((name) => !name.endsWith("-placements.json"))
  .filter((name) => !["marker-data-audit.json", "story-relationship-audit.json"].includes(name));
const catalogEvidence = [];
const catalogEvidenceLocations = new Set();
for (const name of catalogFiles) {
  collectEvidence(
    JSON.parse(fs.readFileSync(path.join(catalogRoot, name), "utf8")),
    catalogEvidence,
    catalogEvidenceLocations,
  );
}
const coveredSignatures = new Set(catalogEvidence.flatMap((statement) => {
  const predicate = statement.match(/^(?:AND\s+|NOT\s+)?([A-Za-z][A-Za-z0-9_]*)\s*\(/)?.[1];
  const guids = [...new Set((statement.match(guidPattern) ?? [])
    .map((guid) => guid.toLocaleLowerCase("en-US"))
    .filter((guid) => guid !== emptyGuid))];
  return predicate && guids.length >= 2 ? [`${predicate}:${[...guids].sort().join(":")}`] : [];
}));

const relationshipStatements = walkFiles(storyRoot)
  .filter((filePath) => filePath.toLocaleLowerCase("en-US").endsWith(".txt"))
  .filter((filePath) => !/SavegamePatches/i.test(filePath))
  .flatMap(parseStatements);
const byPredicate = Map.groupBy(relationshipStatements, ({ predicate }) => predicate);
const predicates = [...byPredicate].map(([predicate, statements]) => {
  const uniqueStatements = [...new Map(statements.map((entry) => [entry.signature, entry])).values()];
  const covered = uniqueStatements.filter(({ signature, sourceKey }) => (
    coveredSignatures.has(signature) || catalogEvidenceLocations.has(sourceKey)
  ));
  const uncovered = uniqueStatements.filter(({ signature, sourceKey }) => (
    !coveredSignatures.has(signature) && !catalogEvidenceLocations.has(sourceKey)
  ));
  return {
    predicate,
    occurrences: statements.length,
    uniqueRelationships: uniqueStatements.length,
    coveredRelationships: covered.length,
    uncoveredRelationships: uncovered.length,
    coverage: uniqueStatements.length === 0 ? 1 : Number((covered.length / uniqueStatements.length).toFixed(4)),
    highValueCandidate: highValuePredicatePattern.test(predicate),
    uncoveredSamples: uncovered.slice(0, 5).map(({ signature: _signature, sourceKey: _sourceKey, ...sample }) => sample),
  };
}).sort((left, right) => (
  Number(right.highValueCandidate) - Number(left.highValueCandidate)
  || right.uncoveredRelationships - left.uncoveredRelationships
  || right.uniqueRelationships - left.uniqueRelationships
  || left.predicate.localeCompare(right.predicate, "en")
));

const audit = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceBuild: "24532579",
  stats: {
    catalogFiles: catalogFiles.length,
    catalogEvidenceStatements: catalogEvidence.length,
    relationshipStatements: relationshipStatements.length,
    uniqueRelationships: predicates.reduce((total, entry) => total + entry.uniqueRelationships, 0),
    coveredRelationships: predicates.reduce((total, entry) => total + entry.coveredRelationships, 0),
    uncoveredRelationships: predicates.reduce((total, entry) => total + entry.uncoveredRelationships, 0),
    predicates: predicates.length,
    highValueUncoveredPredicates: predicates.filter((entry) => entry.highValueCandidate && entry.uncoveredRelationships > 0).length,
  },
  predicates,
};

fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(`Story relationship audit: ${audit.stats.coveredRelationships}/${audit.stats.uniqueRelationships} unique multi-GUID relationships covered by generated catalogs.`);
console.log("Top high-value gaps:", predicates
  .filter((entry) => entry.highValueCandidate && entry.uncoveredRelationships > 0)
  .slice(0, 25)
  .map((entry) => `${entry.predicate}=${entry.uncoveredRelationships}`)
  .join(", "));
