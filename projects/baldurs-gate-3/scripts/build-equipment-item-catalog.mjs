import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { listItemSourceFiles, isItemStatFile, readResolvedItemStats } from "./lib/native-item-stats.mjs";
import { readItemProgression } from "./lib/item-progression.mjs";
import { readVerifiedEquipmentCatalog } from "./lib/native-equipment.mjs";
import { resolveEquipmentItems } from "./lib/equipment-item-identity.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  if (!process.argv[index].startsWith("--") || process.argv[index + 1] === undefined) throw new Error("Expected --name value arguments");
  args.set(process.argv[index].slice(2), process.argv[index + 1]);
}
for (const key of ["equipment-catalog", "item-database", "output"]) if (!args.has(key)) throw new Error(`Missing --${key}`);
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const equipmentPath = path.resolve(root, args.get("equipment-catalog"));
const itemPath = path.resolve(root, args.get("item-database"));
const statsRoot = path.resolve(root, args.get("stats-source") ?? "map-sources/extracted/item-stats");
const outputPath = path.resolve(root, args.get("output"));
const hashes = {};
const remember = (file) => {
  const bytes = fs.readFileSync(file), key = relative(file), digest = createHash("sha256").update(bytes).digest("hex");
  if (hashes[key] && hashes[key] !== digest) throw new Error(`Equipment identity input changed: ${key}`);
  hashes[key] = digest;
  return bytes;
};
remember(equipmentPath);
const equipment = readVerifiedEquipmentCatalog(equipmentPath, root), database = JSON.parse(remember(itemPath));
if (equipment.sourceBuild !== database.sourceBuild) throw new Error("Equipment and item source builds differ");
const statFiles = listItemSourceFiles(statsRoot, isItemStatFile);
const progressionFiles = listItemSourceFiles(statsRoot, (file) => path.basename(file) === "ItemProgressionVisuals.txt");
if (!statFiles.length || !progressionFiles.length) throw new Error("Complete native Stats/progression sources are required");
const equipmentFiles = Object.keys(equipment.sourceHashes).map((file) => path.resolve(root, file));
for (const file of [...equipmentFiles, ...statFiles, ...progressionFiles]) remember(file);
const references = resolveEquipmentItems({ definitions: equipment.definitions, items: database.items,
  stats: readResolvedItemStats(statFiles, root), progression: readItemProgression(progressionFiles, root) });
// A later map/item consumer must use this exact item database and source set;
// neither catalog age nor a coincidentally matching item name is sufficient.
const entries = Object.values(references);
const stats = { definitions: Object.keys(equipment.definitions).length, groups: equipment.stats.groups, entries: equipment.stats.entries,
  references: entries.length, resolvedReferences: entries.filter(({ status }) => status === "resolved").length,
  reviewReferences: entries.filter(({ status }) => status === "review").length,
  resolvedEntryRows: Object.values(equipment.definitions).flatMap(({ groups }) => groups.flatMap(({ entries }) => entries))
    .filter(({ statsId }) => references[statsId].status === "resolved").length };
for (const file of Object.keys(hashes)) remember(path.join(root, file));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
writeGeneratedFile(outputPath, `${JSON.stringify({ schemaVersion: 1, sourceBuild: equipment.sourceBuild,
  scope: "Exact authored equipment generation identities only. Group alternatives, lootability and current-scene possession must be handled separately; resolved does not mean guaranteed loot.",
  inputs: { equipmentCatalog: relative(equipmentPath), itemDatabase: relative(itemPath), statsRoot: relative(statsRoot),
    stats: statFiles.map(relative), progression: progressionFiles.map(relative) },
  stats, definitions: equipment.definitions, references, hashes }, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, stats, review: entries.filter(({ status }) => status === "review")
  .map(({ statsId, mode, rootTemplateId }) => ({ statsId, mode, rootTemplateId })) }, null, 2));
