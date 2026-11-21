import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
const baselinePath = "map-sources/audits/pre-explicit-root-stats.json";
const current = read("map-sources/catalog/root-templates.json");
const before = fs.existsSync(path.join(root, baselinePath)) ? read(baselinePath) : current;
const after = read("map-sources/audits/root-templates-explicit-stats.json");
const sourceFiles = new Map(), resolved = new Map();
const nativeStats = (id, stack = new Set()) => {
  if (resolved.has(id)) return resolved.get(id);
  assert(!stack.has(id), `Native inheritance cycle: ${id}`);
  stack.add(id);
  const file = `map-sources/extracted/root-templates/${after.templates[id].provenance}`;
  if (!sourceFiles.has(file)) sourceFiles.set(file, new Map(read(file).save.regions.Templates.GameObjects.map((object) => [object.MapKey.value.toLowerCase(), object])));
  const object = sourceFiles.get(file).get(id);
  assert(object, `Missing source root ${id}`);
  const value = Object.hasOwn(object, "Stats") ? object.Stats.value
    : object.ParentTemplateId?.value ? nativeStats(object.ParentTemplateId.value.toLowerCase(), stack) : undefined;
  stack.delete(id);
  resolved.set(id, value);
  return value;
};
assert.deepEqual(Object.keys(before.templates), Object.keys(after.templates));
const changes = [];
for (const [id, template] of Object.entries(after.templates)) {
  assert.equal(template.stats, nativeStats(id), `Native Stats differ: ${id}`);
  const omitStats = ({ stats: ignored, ...rest }) => { void ignored; return rest; };
  assert.deepEqual(omitStats(template), omitStats(before.templates[id]));
  if (template.stats !== before.templates[id].stats) changes.push({ id, before: before.templates[id].stats, after: template.stats });
}
const report = { checked: resolved.size, changes, unrelatedFieldsUnchanged: true };
if (process.argv.includes("--apply")) {
  assert(JSON.stringify(current) === JSON.stringify(before) || JSON.stringify(current) === JSON.stringify(after), "Catalog changed outside the reviewed root Stats update");
  if (!fs.existsSync(path.join(root, baselinePath))) fs.copyFileSync(path.join(root, "map-sources/catalog/root-templates.json"), path.join(root, baselinePath), fs.constants.COPYFILE_EXCL);
  writeGeneratedFile(path.join(root, "map-sources/catalog/root-templates.json"), `${JSON.stringify(after, null, 2)}\n`);
}
writeGeneratedFile(path.join(root, "map-sources/catalog/root-template-stats-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log("Native root Stats audit:", { checked: report.checked, changes: changes.length, unrelatedFieldsUnchanged: true });
