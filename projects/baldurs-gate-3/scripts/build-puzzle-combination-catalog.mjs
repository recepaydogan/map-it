import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const storyRoot = path.join(projectRoot, "map-sources", "extracted", "story-goals");
const outputPath = path.join(projectRoot, "map-sources", "catalog", "puzzle-combinations.json");
const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });

const splitArguments = (statement) => {
  const start = statement.indexOf("(");
  const end = statement.lastIndexOf(")");
  if (start < 0 || end <= start) return [];
  const arguments_ = [];
  let depth = 0;
  let quote = false;
  let current = "";
  for (const character of statement.slice(start + 1, end)) {
    if (character === '"') quote = !quote;
    if (!quote && character === "(") depth += 1;
    if (!quote && character === ")") depth -= 1;
    if (!quote && depth === 0 && character === ",") {
      arguments_.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  arguments_.push(current.trim());
  return arguments_;
};

const entityFromArgument = (argument) => {
  const id = argument.match(guidPattern)?.[0]?.toLocaleLowerCase("en-US");
  if (!id || id === "00000000-0000-0000-0000-000000000000") return null;
  return {
    id,
    token: argument.replace(/^\([A-Z]+\)/, "").trim(),
  };
};

const combinations = new Map();
let combinedStatements = 0;
let templatesCombinedStatements = 0;
for (const filePath of walkFiles(storyRoot).filter((candidate) => candidate.toLocaleLowerCase("en-US").endsWith(".txt"))) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const statement = lines[index].trim();
    const objectCombination = statement.startsWith("Combined(");
    const templateCombination = statement.startsWith("TemplatesCombined(");
    if (!objectCombination && !templateCombination) continue;
    if (objectCombination) combinedStatements += 1;
    else templatesCombinedStatements += 1;
    const arguments_ = splitArguments(statement);
    const receptacle = entityFromArgument(arguments_[0] ?? "");
    const ingredient = entityFromArgument(arguments_[1] ?? "");
    if (!receptacle || !ingredient || receptacle.id === ingredient.id) continue;
    const identityKind = objectCombination ? "object" : "template";
    const key = `${identityKind}:${receptacle.id}:${ingredient.id}`;
    const current = combinations.get(key) ?? {
      id: `${identityKind === "object" ? "combines" : "template-combines"}:${receptacle.id}:${ingredient.id}`,
      identityKind,
      receptacle: { ...receptacle, identityKind },
      ingredient: { ...ingredient, identityKind },
      evidence: [],
    };
    current.evidence.push({
      sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
      sourceLine: index + 1,
      statement,
    });
    combinations.set(key, current);
  }
}

const entries = [...combinations.values()].sort((left, right) => left.id.localeCompare(right.id, "en"));
const byObjectId = {};
const byTemplateId = {};
for (const combination of entries) {
  for (const [role, entity] of [["receptacle", combination.receptacle], ["ingredient", combination.ingredient]]) {
    const index = combination.identityKind === "object" ? byObjectId : byTemplateId;
    index[entity.id] = [...(index[entity.id] ?? []), { combinationId: combination.id, role }];
  }
}
const catalog = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceBuild: "24532579",
  stats: {
    combinedStatements,
    exactCombinations: entries.length,
    exactObjectCombinations: entries.filter(({ identityKind }) => identityKind === "object").length,
    exactTemplateCombinations: entries.filter(({ identityKind }) => identityKind === "template").length,
    linkedObjects: Object.keys(byObjectId).length,
    linkedTemplates: Object.keys(byTemplateId).length,
  },
  combinations: entries,
  byObjectId,
  byTemplateId,
};
fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Puzzle combinations: ${entries.length} exact receptacle-item pairs from ${combinedStatements} Combined and ${templatesCombinedStatements} TemplatesCombined statements.`);
