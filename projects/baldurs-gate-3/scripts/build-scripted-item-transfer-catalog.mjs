import fs from "node:fs";
import path from "node:path";
import { readLocalization } from "./lib/localization.mjs";
import { attributeValue, guidPattern, parseEndpoint, readStoryFacts, walkFiles } from "./lib/story-goal-facts.mjs";
import { createStoryRuleLookup } from "./lib/story-rule-context.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Builds the catalog of story-scripted item transfers: exact Osiris statements
// that hand a placed item or a spawned item template to a character or
// container. Every transfer keeps the item template, the resolved owner and the
// originating story line so the item database can cite a verified source for
// items that never rest on the ground or in an authored inventory.

const projectRoot = path.resolve(import.meta.dirname, "..");

const arguments_ = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined) {
    throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
  }
  arguments_.set(key.slice(2), [...(arguments_.get(key.slice(2)) ?? []), value]);
}
const resolveArgument = (key, fallback) => (arguments_.get(key) ?? [fallback]).map((value) => path.resolve(projectRoot, value));
const resolveArguments = (key, fallbacks) => (arguments_.get(key) ?? fallbacks).map((value) => path.resolve(projectRoot, value));

const storyRoots = resolveArguments("story-source", ["map-sources/extracted/story-goals"]);
const placementRoots = resolveArguments("placements", [
  "map-sources/extracted/package-placements",
  "map-sources/converted/wld-placements",
  "map-sources/converted/main-level-placements",
  "map-sources/converted/auxiliary-level-placements",
]);
const [rootTemplateCatalogPath] = resolveArgument("root-template-catalog", "map-sources/catalog/root-templates.json");
const [englishLocalizationPath] = resolveArgument("localization-en", "map-sources/converted/localization/english/english.xml");
const [turkishLocalizationPath] = resolveArgument("localization-tr", "map-sources/converted/localization/turkish/turkish.xml");
const [storyLocationCatalogPath] = resolveArgument("story-location-catalog", "map-sources/catalog/story-location-relations.json");
const [outputPath] = resolveArgument("output", "map-sources/catalog/scripted-item-transfers.json");
const sourceBuild = arguments_.get("source-build")?.[0] ?? "24532579";

// Statement shapes that move an exact item into an owner's possession.
const TRANSFER_PREDICATES = {
  Equip: { kind: "equip", ownerIndex: 0, itemIndex: 1, itemIsTemplate: false },
  ToInventory: { kind: "inventory", ownerIndex: 1, itemIndex: 0, itemIsTemplate: false },
  TemplateAddTo: { kind: "template-grant", ownerIndex: 1, itemIndex: 0, itemIsTemplate: true, amountIndex: 2 },
};

const rootTemplateCatalog = JSON.parse(fs.readFileSync(rootTemplateCatalogPath, "utf8"));
// Initial inventory placements are authored starting positions that the
// story-location relation catalog already turns into map markers.
const initialInventoryPairs = new Set((fs.existsSync(storyLocationCatalogPath)
  ? JSON.parse(fs.readFileSync(storyLocationCatalogPath, "utf8")).initialItemTransfers ?? []
  : []).map((relation) => `${relation.item.id}:${relation.target.id}`));
const localization = {
  en: readLocalization(englishLocalizationPath),
  tr: readLocalization(turkishLocalizationPath),
};

const normalizeObjectType = (type, placementKind) => {
  const searchable = `${type ?? ""} ${placementKind ?? ""}`.toLocaleLowerCase("en-US");
  if (searchable.includes("character")) return "character";
  if (searchable.includes("trigger")) return "trigger";
  if (searchable.includes("item")) return "item";
  return "unknown";
};

// Placed objects by MapKey. The first authored definition wins; later copies
// of the same object only fill attributes the first definition left empty.
const placedObjects = new Map();
for (const placementRoot of placementRoots) {
  const files = walkFiles(placementRoot)
    .filter((candidate) => candidate.toLocaleLowerCase("en-US").endsWith(".lsj"))
    .sort((left, right) => left.localeCompare(right, "en"));
  for (const filePath of files) {
    const objects = JSON.parse(fs.readFileSync(filePath, "utf8"))?.save?.regions?.Templates?.GameObjects;
    if (!Array.isArray(objects)) continue;
    const placementKind = path.relative(placementRoot, filePath).split(path.sep).at(-2) ?? "unknown";
    for (const object of objects) {
      const id = attributeValue(object, "MapKey", "").toLocaleLowerCase("en-US");
      if (!guidPattern.test(id)) continue;
      const existing = placedObjects.get(id) ?? {};
      placedObjects.set(id, {
        id,
        type: existing.type ?? normalizeObjectType(attributeValue(object, "Type", ""), placementKind),
        templateId: existing.templateId || attributeValue(object, "TemplateName", "").toLocaleLowerCase("en-US"),
        internalName: existing.internalName || attributeValue(object, "Name", ""),
        displayNameHandle: existing.displayNameHandle || attributeValue(object, "DisplayName", ""),
      });
    }
  }
}

const localizedDisplayName = (object) => {
  const template = rootTemplateCatalog.templates?.[object.templateId];
  return Object.fromEntries(Object.entries({
    en: localization.en.get(object.displayNameHandle) ?? template?.displayName?.en,
    tr: localization.tr.get(object.displayNameHandle) ?? template?.displayName?.tr,
  }).filter(([, value]) => value));
};

const resolveItem = (endpoint, shape) => {
  if (shape.itemIsTemplate) {
    const template = rootTemplateCatalog.templates?.[endpoint.id];
    if (template?.type !== "item") return null;
    return { name: endpoint.name, templateId: endpoint.id };
  }
  const object = placedObjects.get(endpoint.id);
  if (object?.type !== "item" || !object.templateId) return null;
  return { id: object.id, token: endpoint.token, name: endpoint.name, templateId: object.templateId };
};

const resolveOwner = (endpoint) => {
  const object = placedObjects.get(endpoint.id);
  if (!object || !["character", "item"].includes(object.type)) return null;
  const displayName = localizedDisplayName(object);
  if (!displayName.en) return null;
  return { id: object.id, token: endpoint.token, name: endpoint.name, type: object.type, displayName };
};

const transfers = new Map();
const excludedTransfers = [];
const ruleLookups = new Map();
for (const fact of readStoryFacts(storyRoots, projectRoot)) {
  const shape = TRANSFER_PREDICATES[fact.predicate];
  if (!shape) continue;
  const itemEndpoint = parseEndpoint(fact.arguments[shape.itemIndex] ?? "");
  const ownerEndpoint = parseEndpoint(fact.arguments[shape.ownerIndex] ?? "");
  if (!itemEndpoint || !ownerEndpoint) continue;
  if (shape.kind === "inventory" && initialInventoryPairs.has(`${itemEndpoint.id}:${ownerEndpoint.id}`)) continue;
  if (/debug/i.test(itemEndpoint.name) || /debug/i.test(ownerEndpoint.name)) continue;
  const item = resolveItem(itemEndpoint, shape);
  const owner = resolveOwner(ownerEndpoint);
  if (!item || !owner) continue;
  const amount = shape.amountIndex === undefined ? 1 : Number(fact.arguments[shape.amountIndex]);
  if (!Number.isInteger(amount) || amount < 1) continue;
  const id = `${item.id ?? item.templateId}:${shape.kind}:${owner.id}`;
  if (!ruleLookups.has(fact.evidence.sourcePath)) {
    ruleLookups.set(fact.evidence.sourcePath, createStoryRuleLookup(fs.readFileSync(path.join(projectRoot, fact.evidence.sourcePath), "utf8")));
  }
  const rule = ruleLookups.get(fact.evidence.sourcePath)(fact.evidence.sourceLine);
  const exclusionReason = fact.negated ? "negated-statement" : rule?.debugOnly ? "debug-rule"
    : rule && (!rule.actionLine || fact.evidence.sourceLine < rule.actionLine) ? "non-action-statement" : undefined;
  if (exclusionReason) {
    excludedTransfers.push({ id, kind: shape.kind, item, owner, amount, reason: exclusionReason, rule, evidence: [fact.evidence] });
    continue;
  }
  const existing = transfers.get(id);
  if (existing) {
    existing.amount = Math.max(existing.amount, amount);
    if (!existing.evidence.some(({ sourcePath, sourceLine }) => sourcePath === fact.evidence.sourcePath && sourceLine === fact.evidence.sourceLine)) {
      existing.evidence.push(fact.evidence);
    }
    continue;
  }
  transfers.set(id, { id, kind: shape.kind, item, owner, amount, evidence: [fact.evidence] });
}

const normalizedTransfers = [...transfers.values()]
  .sort((left, right) => left.item.templateId.localeCompare(right.item.templateId, "en") || left.id.localeCompare(right.id, "en"));
const byItemTemplateId = Object.fromEntries(normalizedTransfers.reduce((groups, transfer) => {
  groups.set(transfer.item.templateId, [...(groups.get(transfer.item.templateId) ?? []), transfer.id]);
  return groups;
}, new Map()));
const catalog = {
  schemaVersion: 1,
  sourceBuild,
  stats: {
    transfers: normalizedTransfers.length,
    itemTemplates: Object.keys(byItemTemplateId).length,
    owners: new Set(normalizedTransfers.map(({ owner }) => owner.id)).size,
    excludedStatements: excludedTransfers.length,
    byKind: Object.fromEntries(Object.values(TRANSFER_PREDICATES)
      .map(({ kind }) => [kind, normalizedTransfers.filter((transfer) => transfer.kind === kind).length])),
  },
  transfers: normalizedTransfers,
  excludedTransfers,
  byItemTemplateId,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
writeGeneratedFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Scripted item transfers: ${catalog.stats.transfers} transfers covering ${catalog.stats.itemTemplates} item templates and ${catalog.stats.owners} owners.`);
