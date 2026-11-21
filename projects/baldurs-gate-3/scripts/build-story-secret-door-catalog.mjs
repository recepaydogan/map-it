import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const storyRoot = path.join(projectRoot, "map-sources", "extracted", "story-goals");
const outputPath = path.join(projectRoot, "map-sources", "catalog", "story-secret-doors.json");
const predicates = new Set([
  "DB_FOR_ThayanCellar_SecretDoors",
  "DB_SHA_Mausoleum_SecretDoors",
  "DB_SHA_Trials_LightTrialSecretDoors",
]);
const directSecretDoorPredicates = new Set(["Open", "SetCanInteract"]);
const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
});
const entries = new Map();
for (const filePath of walkFiles(storyRoot).filter((candidate) => candidate.toLocaleLowerCase("en-US").endsWith(".txt"))) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const statement = lines[index].trim();
    const predicate = statement.match(/^([A-Za-z0-9_]+)\(/)?.[1];
    if (!predicates.has(predicate) && !directSecretDoorPredicates.has(predicate)) continue;
    const firstArgument = statement.slice(statement.indexOf("(") + 1).split(",", 1)[0];
    const token = firstArgument.replace(/^\([A-Z]+\)/, "").trim();
    if (directSecretDoorPredicates.has(predicate) && !/(?:secret|hidden).?door/i.test(token)) continue;
    const objectId = firstArgument.match(guidPattern)?.[0]?.toLocaleLowerCase("en-US");
    if (!objectId || objectId === "00000000-0000-0000-0000-000000000000") continue;
    const current = entries.get(objectId) ?? {
      objectId,
      token,
      predicates: [],
      evidence: [],
    };
    current.predicates = [...new Set([...current.predicates, predicate])];
    current.evidence.push({
      sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
      sourceLine: index + 1,
      statement,
    });
    entries.set(objectId, current);
  }
}

const ordered = [...entries.values()].sort((left, right) => left.objectId.localeCompare(right.objectId, "en"));
const catalog = {
  schemaVersion: 1,
  sourceBuild: "24532579",
  stats: { exactStorySecretDoors: ordered.length },
  entries: ordered,
  byObjectId: Object.fromEntries(ordered.map((entry) => [entry.objectId, entry])),
};
fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Story secret doors: ${ordered.length} exact placed doors cataloged.`);
