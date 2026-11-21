import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { readNativeEquipment } from "./lib/native-equipment.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  if (!process.argv[index].startsWith("--") || process.argv[index + 1] === undefined) throw new Error("Expected --name value arguments");
  args.set(process.argv[index].slice(2), process.argv[index + 1]);
}
for (const key of ["sources", "output", "source-build"]) if (!args.has(key)) throw new Error(`Missing --${key}`);
const sources = JSON.parse(args.get("sources")).map((file) => path.resolve(root, file));
if (!sources.length) throw new Error("At least one explicit native equipment file is required");
const outputPath = path.resolve(root, args.get("output"));
const { definitions, hashes } = readNativeEquipment(sources, root);
for (const [relative, expected] of Object.entries(hashes)) {
  if (createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex") !== expected) {
    throw new Error(`Equipment source changed during generation: ${relative}`);
  }
}
const entries = [...definitions.values()];
const stats = { files: sources.length, definitions: entries.length,
  groups: entries.reduce((count, entry) => count + entry.groups.length, 0),
  entries: entries.reduce((count, entry) => count + entry.groups.reduce((sum, group) => sum + group.entries.length, 0), 0),
  alternativeGroups: entries.flatMap((entry) => entry.groups).filter((group) => group.entries.length > 1).length };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
writeGeneratedFile(outputPath, `${JSON.stringify({ schemaVersion: 1, sourceBuild: args.get("source-build"),
  scope: "Authored initial equipment definitions only. Lootability, scene changes, current possession and item-generation identity require separate resolution.",
  stats, sourceHashes: hashes, definitions: Object.fromEntries(definitions) }, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, stats }, null, 2));
