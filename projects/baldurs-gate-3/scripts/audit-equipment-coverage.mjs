import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Independent native-source comparison; do not import the equipment parser.
const root = path.resolve(import.meta.dirname, "..");
if (![5, 6].includes(process.argv.length)) throw new Error("Usage: node scripts/audit-equipment-coverage.mjs <equipment-catalog> <maps-root> <report> [template-stage]");
const [catalogPath, mapsRoot, outputPath, templateStagePath] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, errors = [], objects = new Map();
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const readText = (file) => {
  const bytes = fs.readFileSync(file), key = relative(file), actual = digest(bytes);
  if (hashes[key] && hashes[key] !== actual) throw new Error(`Audit input changed: ${key}`);
  hashes[key] = actual;
  return bytes.toString("utf8");
};
const read = (file) => JSON.parse(readText(file));
const check = (condition, message) => { if (!condition) errors.push(message); };
const catalog = read(catalogPath), expectedDefinitions = {};
for (const [sourcePath, expectedHash] of Object.entries(catalog.sourceHashes)) {
  const lines = readText(path.join(root, sourcePath)).split(/\r?\n/);
  check(hashes[sourcePath] === expectedHash, `Equipment source hash changed: ${sourcePath}`);
  const starts = lines.flatMap((line, index) => /^new equipment "/.test(line.trim()) ? [index] : []);
  for (const [offset, start] of starts.entries()) {
    const id = lines[start].trim().match(/^new equipment "([^"]+)"$/)?.[1];
    if (!id) throw new Error(`Invalid native header: ${sourcePath}:${start + 1}`);
    check(!Object.hasOwn(expectedDefinitions, id), `Repeated native equipment ID: ${id}`);
    const groups = [], entry = { id, sourcePath, sourceLine: start + 1, groups };
    for (let index = start + 1; index < (starts[offset + 1] ?? lines.length); index++) {
      const line = lines[index].trim();
      if (!line || line.startsWith("//")) continue;
      const weapon = line.match(/^add initialweaponset "([^"]+)"$/);
      const item = line.match(/^add equipment entry "([^"]+)"$/);
      if (weapon) entry.initialWeaponSet = weapon[1];
      else if (line === "add equipmentgroup") groups.push({ sourceLine: index + 1, entries: [] });
      else if (item && groups.length) groups.at(-1).entries.push({ statsId: item[1], sourceLine: index + 1 });
      else throw new Error(`Unaccounted native equipment row: ${sourcePath}:${index + 1}`);
    }
    expectedDefinitions[id] = entry;
  }
}
check(isDeepStrictEqual(expectedDefinitions, catalog.definitions), "Equipment definitions differ from complete native source rows");
const templates = read(path.join(root, "map-sources/catalog/root-templates.json")).templates;
const members = new Map(read(path.join(root, "map-sources/catalog/party-members.json")).members.map((entry) => [entry.id, entry.characterId]));
const stats = read(path.join(root, "map-sources/catalog/gameplay-stats.json")).entries;
const database = read(path.join(root, "public/data/item-database.json"));
const byStats = new Map();
for (const item of database.items) byStats.set(item.statsId, [...(byStats.get(item.statsId) ?? []), item]);
const loadObjects = (file) => {
  if (!objects.has(file)) objects.set(file, new Map((read(file).save?.regions?.Templates?.GameObjects ?? [])
    .map((object) => [object.MapKey?.value, object])));
  return objects.get(file);
};
const templateField = (id, field, visited = new Set()) => {
  if (!id) return undefined;
  if (visited.has(id)) throw new Error(`Cyclic native template: ${id}`);
  const template = templates[id];
  if (!template) return undefined;
  const file = path.join(root, "map-sources/extracted/root-templates", template.provenance);
  const object = loadObjects(file).get(id);
  if (!object) throw new Error(`Native template missing at indexed source: ${id}`);
  if (Object.hasOwn(object, field) && !Array.isArray(object[field])) {
    return { value: object[field]?.value ?? (field === "Equipment" ? "" : undefined), sourcePath: relative(file), objectId: id, field };
  }
  return templateField(object.ParentTemplateId?.value, field, new Set([...visited, id]));
};
const nativeInventoryRows = (file, object, objectId) => (object.ItemList ?? []).flatMap((list) => list.Item ?? []).map((entry, index) => ({
  sourcePath: relative(file), objectId, index, itemName: entry.ItemName?.value ?? "", templateId: entry.TemplateID?.value?.toLowerCase() ?? "",
  itemObjectId: entry.UUID?.value ?? "", droppedOnDeath: entry.IsDroppedOnDeath?.value,
}));
const templateInventoryRows = (id, seen = new Set()) => {
  if (!id || !templates[id]) return [];
  if (seen.has(id)) throw new Error(`Inventory template cycle: ${id}`);
  const file = path.join(root, "map-sources/extracted/root-templates", templates[id].provenance);
  const object = loadObjects(file).get(id);
  if (!object) throw new Error(`Missing inventory template: ${id}`);
  return [...nativeInventoryRows(file, object, id), ...templateInventoryRows(object.ParentTemplateId?.value, new Set([...seen, id]))];
};
let templateFieldAudit;
if (templateStagePath) {
  const staged = read(templateStagePath);
  check(isDeepStrictEqual(Object.keys(templates).sort(), Object.keys(staged.templates).sort()), "Equipment template stage changed template identities");
  let withEquipmentFields = 0;
  for (const [id, template] of Object.entries(staged.templates)) {
    const { equipmentId, equipmentLootable, ...unchanged } = template;
    check(isDeepStrictEqual(unchanged, templates[id]), `Unrelated template data changed: ${id}`);
    check(equipmentId === templateField(id, "Equipment")?.value, `Native equipment inheritance differs: ${id}`);
    check(equipmentLootable === templateField(id, "IsEquipmentLootable")?.value, `Native equipment lootability differs: ${id}`);
    if (equipmentId !== undefined || equipmentLootable !== undefined) withEquipmentFields++;
  }
  templateFieldAudit = { templateStagePath, templates: Object.keys(staged.templates).length, withEquipmentFields };
}
const placementRoots = ["map-sources/extracted/package-placements", "map-sources/converted/wld-placements",
  "map-sources/converted/main-level-placements", "map-sources/converted/auxiliary-level-placements"];
const appearances = [], unresolved = [];
let characterAppearances = 0, emptyEquipmentAppearances = 0, maps = 0;
for (const directory of fs.readdirSync(mapsRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentFile = path.join(mapsRoot, directory.name, "content.json");
  if (!fs.existsSync(contentFile)) throw new Error(`Map content missing: ${directory.name}`);
  maps++;
  for (const entity of read(contentFile).entities) {
    if (entity.gameplay?.type !== "Character" && !entity.partyMember && !entity.storyDestination) continue;
    characterAppearances++;
    const characterId = entity.storyDestination?.characterContentId ?? members.get(entity.partyMember?.memberId) ?? entity.id;
    const native = new Map();
    for (const { sourcePath } of entity.provenance ?? []) {
      if (!/\/Characters\//i.test(sourcePath)) continue;
      for (const parent of placementRoots) {
        const file = path.join(root, parent, sourcePath.replace(/^supplementary\//, ""));
        if (!fs.existsSync(file)) continue;
        const object = loadObjects(file).get(characterId);
        if (object) native.set(file, object);
      }
    }
    const fieldValues = {};
    for (const field of ["Equipment", "IsEquipmentLootable", "IsLootable"]) {
      const values = [...native].map(([file, object]) => Object.hasOwn(object, field) && !Array.isArray(object[field])
        ? { value: object[field]?.value ?? (field === "Equipment" ? "" : undefined), sourcePath: relative(file), objectId: characterId, field }
        : templateField(object.TemplateName?.value, field)).filter(Boolean);
      const unique = [...new Map(values.map((entry) => [JSON.stringify(entry.value), entry])).values()];
      if (unique.length === 1) fieldValues[field] = unique[0];
      else if (unique.length > 1) fieldValues[field] = { conflict: unique };
    }
    const inventory = [...native].flatMap(([file, object]) => [...nativeInventoryRows(file, object, characterId), ...templateInventoryRows(object.TemplateName?.value)]);
    const context = { mapId: directory.name, contentId: entity.id, characterId, title: entity.title,
      sceneArrival: Boolean(entity.storyDestination), fields: fieldValues,
      inventoryReferences: [...new Map(inventory.map((entry) => [`${entry.sourcePath}/${entry.objectId}/${entry.index}`, entry])).values()] };
    if (!native.size || fieldValues.Equipment?.conflict || !fieldValues.Equipment) {
      unresolved.push({ ...context, reason: !native.size ? "native-character-not-found" : "equipment-field-unresolved" });
      continue;
    }
    const equipmentId = fieldValues.Equipment.value;
    if (!equipmentId) { emptyEquipmentAppearances++; continue; }
    const definition = catalog.definitions[equipmentId];
    if (!definition) { unresolved.push({ ...context, equipmentId, reason: "equipment-definition-not-found" }); continue; }
    const represented = new Set([...(entity.deathLoot?.guaranteedDrops ?? []),
      ...(entity.deathLoot?.randomLootPools ?? []).flatMap((pool) => pool.possibleLoot ?? [])]
      .map((item) => item.statsId).filter(Boolean));
    const equipment = definition.groups.flatMap((group, groupIndex) => group.entries.map(({ statsId, sourceLine }) => {
      const stat = stats[statsId];
      const candidates = (byStats.get(statsId) ?? []).filter((item) => item.templateIds.includes(stat?.rootTemplate));
      return { statsId, groupIndex, sourcePath: definition.sourcePath, sourceLine,
        groupSize: group.entries.length, representedInLoot: represented.has(statsId),
        rootTemplateId: stat?.rootTemplate, rootMatchedItemIds: candidates.map(({ id }) => id),
        itemNames: candidates.map(({ name }) => name) };
    }));
    appearances.push({ ...context, equipmentId, equipment });
  }
}
for (const [file, expected] of Object.entries(hashes)) check(digest(fs.readFileSync(path.join(root, file))) === expected, `Audit input changed before completion: ${file}`);
const missing = appearances.filter((entry) => entry.equipment.some((item) => !item.representedInLoot));
const report = { scope: "Independent complete equipment-file parsing and native character/template field resolution for the supplied map set. Missing rows are authored-equipment references absent from loot profiles, not proof of guaranteed current-scene drops. Root-matched item IDs are identity candidates; progression, lootability defaults, story transfers and scene conditions remain separate review gates.",
  catalogPath, mapsRoot, stats: { maps, nativeDefinitions: Object.keys(expectedDefinitions).length, characterAppearances,
    equipmentAppearances: appearances.length, uniqueEquipmentCharacters: new Set(appearances.map(({ characterId }) => characterId)).size,
    emptyEquipmentAppearances, unresolvedAppearances: unresolved.length, appearancesWithMissingEquipment: missing.length,
    missingEquipmentRows: appearances.reduce((count, entry) => count + entry.equipment.filter((item) => !item.representedInLoot).length, 0),
    explicitlyLootableEquipmentAppearances: appearances.filter((entry) => entry.fields.IsEquipmentLootable?.value === true).length },
  ...(templateFieldAudit ? { templateFieldAudit } : {}), appearances, unresolved, hashes, errors };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
writeGeneratedFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ stats: report.stats, templateFieldAudit, errorCount: errors.length, errors: errors.slice(0,20) }, null, 2));
if (errors.length) process.exitCode = 1;
