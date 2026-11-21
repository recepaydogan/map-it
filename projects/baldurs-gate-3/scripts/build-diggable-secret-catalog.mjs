import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const storyRoot = path.join(projectRoot, "map-sources", "extracted", "story-goals");
const outputPath = path.join(projectRoot, "map-sources", "catalog", "diggable-secrets.json");
const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
});
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
const idFrom = (value) => value.match(guidPattern)?.[0]?.toLocaleLowerCase("en-US");
const tokenFrom = (value) => value.replace(/^\([A-Z]+\)/, "").trim();

const entries = new Map();
for (const filePath of walkFiles(storyRoot).filter((candidate) => candidate.toLocaleLowerCase("en-US").endsWith(".txt"))) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const statement = lines[index].trim();
    const standard = statement.startsWith("DB_DiggableSecretMapMarker(");
    const custom = statement.startsWith("DB_DiggableSecretMapMarker_Custom_LOW_Sewers(");
    const shovelArea = statement.startsWith("DB_ShovelArea(");
    if (!standard && !custom && !shovelArea) continue;
    const arguments_ = splitArguments(statement);
    const entityArgument = arguments_[standard ? 3 : 0] ?? "";
    const objectId = idFrom(entityArgument);
    if (!objectId || objectId === "00000000-0000-0000-0000-000000000000") continue;
    const entry = entries.get(objectId) ?? {
      objectId,
      token: tokenFrom(entityArgument),
      kind: custom ? "sewer-dig-spot" : "buried-mound",
      evidence: [],
    };
    if (custom) entry.kind = "sewer-dig-spot";
    if (shovelArea) {
      const buriedChestArgument = arguments_[1] ?? "";
      const buriedChestId = idFrom(buriedChestArgument);
      if (buriedChestId && buriedChestId !== "00000000-0000-0000-0000-000000000000") {
        entry.buriedChest = {
          objectId: buriedChestId,
          token: tokenFrom(buriedChestArgument),
        };
      }
    }
    if (standard) {
      entry.mapMarkerId = arguments_[0]?.replace(/^"|"$/g, "");
      entry.showFlagId = idFrom(arguments_[1] ?? "");
      entry.hideFlagId = idFrom(arguments_[2] ?? "");
    }
    entry.evidence.push({
      sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
      sourceLine: index + 1,
      statement,
    });
    entries.set(objectId, entry);
  }
}

const orderedEntries = [...entries.values()].sort((left, right) => left.objectId.localeCompare(right.objectId, "en"));
const catalog = {
  schemaVersion: 1,
  sourceBuild: "24532579",
  stats: {
    diggableSecrets: orderedEntries.length,
    buriedMounds: orderedEntries.filter(({ kind }) => kind === "buried-mound").length,
    sewerDigSpots: orderedEntries.filter(({ kind }) => kind === "sewer-dig-spot").length,
    linkedBuriedChests: orderedEntries.filter(({ buriedChest }) => buriedChest).length,
  },
  entries: orderedEntries,
  byObjectId: Object.fromEntries(orderedEntries.map((entry) => [entry.objectId, entry])),
};
fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Diggable secrets: ${catalog.stats.diggableSecrets} exact placed treasure spots cataloged.`);
