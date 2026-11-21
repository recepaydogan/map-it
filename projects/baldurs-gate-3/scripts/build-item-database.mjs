import fs from "node:fs";
import { selectAcquisitionNameMatches } from "./lib/item-acquisition-identity.mjs";
import { writeGeneratedFile, withTransientFileRetry } from "./lib/write-generated-file.mjs";
import { syncAcquisitionSearch } from "./lib/sync-acquisition-search.mjs";
import { createTreasureItemResolver } from "./lib/treasure-item-identity.mjs";
import { readItemProgression } from "./lib/item-progression.mjs";
import { collectItemTemplateVariants, selectTemplateStatItems } from "./lib/item-template-identity.mjs";
import { readNativeItemPlacements } from "./lib/native-item-placements.mjs";
import { ITEM_MODULE_PRIORITY as MODULE_PRIORITY, listItemSourceFiles as listFiles, isItemStatFile, readResolvedItemStats } from "./lib/native-item-stats.mjs";
import { readVerifiedEquipmentCatalog, equipmentStatReferences } from "./lib/native-equipment.mjs";
import { acquisitionAvailability, allowsDeathAcquisition, createSceneContentResolver, readVerifiedSceneContentCatalog } from "./lib/scene-content-profile.mjs";
import { isDeepStrictEqual } from "node:util";
import { resolveEquipmentItems } from "./lib/equipment-item-identity.mjs";
import { createInventoryOwnerResolver } from "./lib/inventory-item-profile.mjs";
import path from "node:path";
import { readItemCombinations } from "./lib/item-combinations.mjs";
import { splitStatExpressions as splitValues } from "./lib/stat-expression-list.mjs";
import { getInventoryQuantity } from "../src/lib/inventory-quantity.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");

const arguments_ = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined) {
    throw new Error(`Invalid argument near ${key ?? "end of command"}.`);
  }
  arguments_.set(key.slice(2), value);
}

const resolveArgument = (key, fallback) => path.resolve(
  projectRoot,
  arguments_.get(key) ?? fallback,
);

const statsRoot = resolveArgument("stats-source", "map-sources/extracted/item-stats");
const itemCombinationsRoot = resolveArgument("item-combinations", "map-sources/extracted/item-combos");
const templatesRoot = resolveArgument("root-templates", "map-sources/extracted/root-templates");
const iconMappingsRoot = resolveArgument("icon-mappings", "map-sources/extracted/icon-mappings");
const englishLocalizationPath = resolveArgument(
  "localization-en",
  "map-sources/converted/localization/english/english.xml",
);
const turkishLocalizationPath = resolveArgument(
  "localization-tr",
  "map-sources/converted/localization/turkish/turkish.xml",
);
const stageRoot = arguments_.has("stage-root") ? resolveArgument("stage-root") : null;
if (stageRoot) {
  const relative = path.relative(path.join(projectRoot, "map-sources/audits"), stageRoot);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("An item stage must be a child of map-sources/audits");
  if (arguments_.has("output")) throw new Error("Use --stage-root without --output; staged files must remain together");
}
const outputPath = stageRoot ? path.join(stageRoot, "item-database.json") : resolveArgument("output", "public/data/item-database.json");
const resolutionRoot = stageRoot ?? path.join(projectRoot, "map-sources/catalog");
const mapsRoot = resolveArgument("maps-source", "public/maps");
if (!fs.statSync(mapsRoot).isDirectory()) throw new Error(`Acquisition maps input is not a directory: ${mapsRoot}`);
const dialogCatalogPath = resolveArgument("dialog-catalog", "map-sources/catalog/dialog-checks.json");
const forgeCatalogPath = resolveArgument("forge-catalog", "map-sources/catalog/adamantine-forge.json");
const treasureCatalogPath = resolveArgument("treasure-catalog", "map-sources/catalog/treasure-tables.json");
const scriptedTransferCatalogPath = resolveArgument("scripted-transfer-catalog", "map-sources/catalog/scripted-item-transfers.json");
const placementRoots = JSON.parse(arguments_.get("placements") ?? JSON.stringify([
  "map-sources/extracted/package-placements",
  "map-sources/converted/wld-placements",
  "map-sources/converted/main-level-placements",
  "map-sources/converted/auxiliary-level-placements",
])).map((root) => path.resolve(projectRoot, root));
const sourceBuild = arguments_.get("source-build") ?? "24532579";
const sceneContentFor = createSceneContentResolver(arguments_.has("scene-content-catalog")
  ? readVerifiedSceneContentCatalog(resolveArgument("scene-content-catalog"), projectRoot) : null);

const ITEM_STAT_TYPES = new Set(["Weapon", "Armor", "Object"]);
const PROPERTY_EXCLUSIONS = new Set([
  "RootTemplate",
  "ValueUUID",
  "ValueRounding",
  "ValueScale",
  "ValueLevel",
  "LevelGroup",
  "SoundSize",
  "FallingHitEffect",
  "FallingLandEffect",
  "Armor",
  "DarkvisionRange",
  "FOV",
  "MaxAmount",
  "MinAmount",
  "MinimumDetectionRange",
  "Sight",
  "Vitality",
  "Priority",
  "PersonalStatusImmunities",
  "BludgeoningResistance",
  "SlashingResistance",
  "PiercingResistance",
  "AcidResistance",
  "ColdResistance",
  "FireResistance",
  "ForceResistance",
  "LightningResistance",
  "NecroticResistance",
  "PoisonResistance",
  "PsychicResistance",
  "RadiantResistance",
  "ThunderResistance",
]);

const attributeValue = (attribute) => attribute?.value ?? attribute?.handle;

const readResolvedTemplates = () => {
  const rawTemplates = new Map();
  for (const filePath of listFiles(templatesRoot, (file) => file.endsWith(".lsj"))) {
    const document = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const module = [...MODULE_PRIORITY.keys()].find((candidate) => filePath.includes(`${path.sep}${candidate}${path.sep}`)) ?? "Unknown";
    for (const template of document.save?.regions?.Templates?.GameObjects ?? []) {
      const id = attributeValue(template.MapKey);
      if (id) rawTemplates.set(id.toLocaleLowerCase("en-US"), { ...template, module });
    }
  }
  const resolved = new Map();
  const resolving = new Set();
  const resolve = (id) => {
    const normalizedId = id.toLocaleLowerCase("en-US");
    if (resolved.has(normalizedId)) return resolved.get(normalizedId);
    const template = rawTemplates.get(normalizedId);
    if (!template) return null;
    if (resolving.has(normalizedId)) throw new Error(`Template inheritance cycle at ${id}.`);
    resolving.add(normalizedId);
    const parentId = attributeValue(template.ParentTemplateId);
    const parent = parentId ? resolve(parentId) : null;
    const result = { ...(parent ?? {}), ...template };
    resolving.delete(normalizedId);
    resolved.set(normalizedId, result);
    return result;
  };
  for (const id of rawTemplates.keys()) resolve(id);
  return { rawTemplates, resolvedTemplates: resolved };
};

const decodeXml = (value) => value
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&quot;", '"')
  .replaceAll("&apos;", "'")
  .replaceAll("&amp;", "&");

const stripLocalizationMarkup = (value) => decodeXml(value)
  .replace(/<br\s*\/?\s*>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/\r/g, "")
  .trim();

const readLocalization = (filePath) => {
  const values = new Map();
  const xml = fs.readFileSync(filePath, "utf8");
  for (const match of xml.matchAll(/<content\s+contentuid="([^"]+)"[^>]*>([\s\S]*?)<\/content>/g)) {
    const value = stripLocalizationMarkup(match[2]);
    if (value) values.set(match[1], value);
  }
  return values;
};

const readIconMappings = () => {
  const mappings = new Map();
  for (const filePath of listFiles(iconMappingsRoot, (file) => file.endsWith(".lsx"))) {
    const atlas = path.basename(filePath, ".lsx");
    const xml = fs.readFileSync(filePath, "utf8");
    for (const node of xml.matchAll(/<node id="IconUV">([\s\S]*?)<\/node>/g)) {
      const values = Object.fromEntries([...node[1].matchAll(/<attribute id="([^"]+)"[^>]*value="([^"]*)"\s*\/>/g)]
        .map((match) => [match[1], match[2]]));
      if (!values.MapKey) continue;
      mappings.set(values.MapKey, {
        atlas,
        u1: Number(values.U1),
        u2: Number(values.U2),
        v1: Number(values.V1),
        v2: Number(values.V2),
      });
    }
  }
  return mappings;
};

const localizationHandle = (value) => value?.split(";", 1)[0];

const formatDescriptionParameter = (value) => {
  const damage = value?.match(/^DealDamage\(([^,]+),\s*([^)]+)\)$/);
  if (damage) return damage[1];
  return value;
};

const applyDescriptionParameters = (description, parameters) => {
  const values = splitValues(parameters).map(formatDescriptionParameter);
  return description?.replace(/\[(\d+)]/g, (match, index) => values[Number(index) - 1] ?? match);
};

const resolveLocalizedEffect = (id, stats, localization) => {
  const stat = stats.get(id);
  const nameHandle = localizationHandle(stat?.data.DisplayName);
  const englishName = nameHandle ? localization.en.get(nameHandle) : undefined;
  if (!stat || !englishName) return null;
  const descriptionHandle = localizationHandle(stat.data.Description);
  const englishDescription = applyDescriptionParameters(
    descriptionHandle ? localization.en.get(descriptionHandle) : undefined,
    stat.data.DescriptionParams,
  );
  const turkishDescription = applyDescriptionParameters(
    descriptionHandle ? localization.tr.get(descriptionHandle) : undefined,
    stat.data.DescriptionParams,
  );
  return {
    id,
    kind: stat.type === "PassiveData" ? "passive" : "action",
    name: englishName,
    localizedNames: Object.fromEntries(Object.entries({
      en: englishName,
      tr: nameHandle ? localization.tr.get(nameHandle) : undefined,
    }).filter(([, value]) => value)),
    ...(englishDescription ? { description: englishDescription } : {}),
    localizedDescriptions: Object.fromEntries(Object.entries({
      en: englishDescription,
      tr: turkishDescription,
    }).filter(([, value]) => value)),
  };
};

const resolveItemEffects = (stat, stats, localization) => {
  const boostValues = [
    stat.data.Boosts,
    stat.data.DefaultBoosts,
    stat.data.BoostsOnEquip,
    stat.data.BoostsOnEquipMainHand,
    stat.data.BoostsOnEquipOffHand,
  ].filter(Boolean).join(";");
  const ids = [
    ...[...boostValues.matchAll(/UnlockSpell\(([^,)]+)/g)].map((match) => match[1].trim()),
    ...splitValues(stat.data.PassivesOnEquip),
  ];
  return [...new Set(ids)]
    .map((id) => resolveLocalizedEffect(id, stats, localization))
    .filter(Boolean);
};

const inferCategory = (stat) => {
  if (stat.type === "Weapon") {
    return /shield/i.test(stat.data.WeaponType ?? stat.id) ? "shields" : "weapons";
  }
  if (stat.type === "Armor") {
    if (stat.data.Shield === "Yes" || /shield/i.test(stat.data["Proficiency Group"] ?? stat.id)) return "shields";
    if (/amulet|ring|cloak/i.test(stat.data.Slot ?? stat.id)) return "accessories";
    return "armor";
  }
  const itemUseType = stat.data.ItemUseType ?? "";
  const objectCategory = stat.data.ObjectCategory ?? "";
  const passivesOnEquip = stat.data.PassivesOnEquip ?? "";
  const searchable = [stat.id, objectCategory, stat.data.InventoryTab, itemUseType]
    .filter(Boolean)
    .join(" ");
  if (/scroll/i.test(itemUseType) || /magic.?scroll/i.test(objectCategory)) return "scrolls";
  if (/(?:^|_)key(?:_|$)/i.test(stat.id) || /\bkey\b/i.test(`${objectCategory} ${itemUseType}`)) return "keys";
  if (/(?:^|;)ALCH_Ingredient_[^;]*_Passive(?:;|$)/i.test(passivesOnEquip)) return "alchemy";
  if (/potion|elixir|coating|poison/i.test(searchable)) return "potions";
  if (/arrow|bolt|throwing/i.test(searchable)) return "ammunition";
  if (/grenade|bomb|explosive/i.test(searchable)) return "throwables";
  if (/ingredient|alchemy|extract|solution|sublimate|suspension|vitriol|ash/i.test(searchable)) return "alchemy";
  if (/book|note|letter|readable|scroll/i.test(searchable)) return "books";
  if (/quest|story|key/i.test(searchable)) return "quest-items";
  if (/consumable|food|drink|supply/i.test(searchable)) return "consumables";
  return "miscellaneous";
};

const inferSubtype = (stat) => {
  if (stat.type === "Weapon") {
    const proficiency = splitValues(stat.data["Proficiency Group"])
      .find((value) => !/^(?:Martial|Simple)Weapons$/i.test(value));
    return proficiency?.replace(/s$/, "")
      || stat.data.WeaponType
      || stat.data.WeaponGroup
      || stat.data["Weapon Group"]
      || stat.type;
  }
  if (stat.type === "Armor") {
    return stat.data.ArmorType && stat.data.ArmorType !== "None"
      ? stat.data.ArmorType
      : stat.data.Slot || stat.type;
  }
  return stat.data.ObjectCategory || stat.data.ItemUseType || stat.type;
};

const compactProperties = (data) => Object.fromEntries(Object.entries(data)
  .filter(([key, value]) => value !== "" && !PROPERTY_EXCLUSIONS.has(key))
  .sort(([left], [right]) => left.localeCompare(right, "en")));

const acquisitionNameKey = (value) => (value ?? "")
  .normalize("NFKD")
  .replace(/\p{M}/gu, "")
  .toLocaleLowerCase("en-US")
  .replace(/[^\p{L}\p{N}]+/gu, "");

const addToIndex = (index, key, item) => {
  if (!key) return;
  const entries = index.get(key) ?? [];
  entries.push(item);
  index.set(key, entries);
};

// Reads every placed object from the raw placement roots: its template, its
// localized display name (authored override first, root template second) and
// its authored inventory. Level and global placements share this layout.
const readPlacedObjects = (resolvedTemplates, localization) => {
  const templateValue = (templateId, attribute) => {
    let template = resolvedTemplates.get(templateId);
    const visited = new Set();
    // A visual child node must not clear an inherited scalar equipment ID.
    while (template && Array.isArray(template[attribute])) {
      const parentId = template.ParentTemplateId?.value;
      if (visited.has(parentId)) throw new Error(`Template attribute cycle: ${templateId}/${attribute}`);
      visited.add(parentId);
      template = resolvedTemplates.get(parentId);
    }
    return template?.[attribute]?.value;
  };
  return readNativeItemPlacements({ roots: placementRoots, projectRoot, localization,
    templateHandle: (templateId, attribute) => resolvedTemplates.get(templateId)?.[attribute]?.handle,
    templateValue });
};

const attachAcquisitions = (items, stats, placedObjects, equipment) => {
  const partyCatalogPath = resolveArgument("party-member-catalog", "map-sources/catalog/party-members.json");
  const ownerForEntity = createInventoryOwnerResolver(fs.existsSync(partyCatalogPath)
    ? JSON.parse(fs.readFileSync(partyCatalogPath, "utf8")).members : []);
  const byStatsId = new Map();
  const byTemplateId = new Map();
  const byName = new Map();
  const byObjectId = new Map();
  for (const item of items) {
    item.acquisitions = [];
    if (item.generation?.origin === "placed-identity") {
      const objectId = item.generation.sourceObjectId;
      if (!objectId || byObjectId.has(objectId)) throw new Error(`Duplicate or missing placed item identity: ${item.id}`);
      byObjectId.set(objectId, item);
      continue;
    }
    addToIndex(byStatsId, item.statsId, item);
    for (const templateId of item.templateIds) addToIndex(byTemplateId, templateId.toLocaleLowerCase("en-US"), item);
    for (const name of Object.values(item.localizedNames)) addToIndex(byName, acquisitionNameKey(name), item);
  }

  const resolveItems = ({ objectId, statsId, templateId, names = [] }) => {
    const placedIdentity = objectId && byObjectId.get(objectId);
    if (placedIdentity) {
      if (templateId && !placedIdentity.templateIds.includes(templateId.toLowerCase())
        || statsId && placedIdentity.statsId !== statsId) throw new Error(`Inconsistent placed item reference: ${objectId}`);
      return [placedIdentity];
    }
    const normalizedTemplateId = templateId?.toLocaleLowerCase("en-US");
    if (normalizedTemplateId && byTemplateId.has(normalizedTemplateId)) {
      return selectTemplateStatItems(byTemplateId.get(normalizedTemplateId), statsId);
    }
    if (statsId && byStatsId.has(statsId)) {
      const matches = byStatsId.get(statsId);
      if (matches.length === 1) return matches;
      const nameKeys = new Set(names.map(acquisitionNameKey).filter(Boolean));
      const namedMatches = matches.filter((item) => Object.values(item.localizedNames)
        .some((name) => nameKeys.has(acquisitionNameKey(name))));
      if (namedMatches.length) return selectAcquisitionNameMatches(namedMatches, names);
      return [];
    }
    for (const name of names) {
      const matches = byName.get(acquisitionNameKey(name));
      if (matches?.length) {
        const selected = selectAcquisitionNameMatches(matches, [name]);
        if (selected.length) return selected;
      }
    }
    return [];
  };

  const acquisitionKeys = new Map(items.map((item) => [item.id, new Set()]));
  const treasureTables = fs.existsSync(treasureCatalogPath)
    ? JSON.parse(fs.readFileSync(treasureCatalogPath, "utf8")).tables ?? {}
    : {};
  const progression = readItemProgression(listFiles(statsRoot, (file) => path.basename(file) === "ItemProgressionVisuals.txt"), projectRoot);
  const treasureItems = createTreasureItemResolver({ stats, byStatsId, byTemplateId, progression });
  const equipmentIdentities = equipment ? resolveEquipmentItems({ definitions: equipment.definitions, stats, items, progression }) : null;
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const resolveEquipmentDrop = (drop, entity) => {
    const source = drop.equipmentSource, reference = equipmentIdentities?.[drop.statsId];
    const ownerId = ownerForEntity(entity), owner = placedObjects.get(ownerId);
    if (!reference || reference.status !== "resolved" || reference.itemIds.length !== 1
      || reference.itemIds[0] !== source.itemId || reference.rootTemplateId !== drop.templateId
      || entity.storyDestination || entity.id !== ownerId || owner?.equipmentId !== source.definitionId
      || owner.equipmentLootable !== true || owner.lootable !== true || drop.canBePickpocketed
      || owner.inventory.some((entry) => entry.itemName === drop.statsId || entry.templateId === drop.templateId)) {
      throw new Error(`Unproven authored equipment acquisition: ${entity.id}/${drop.statsId}`);
    }
    const definition = equipment.definitions[source.definitionId];
    if (!definition || source.sourcePath !== definition.sourcePath || source.groups.length !== drop.amount
      || new Set(source.groups.map(({ groupIndex }) => groupIndex)).size !== source.groups.length
      || source.groups.some(({ groupIndex, sourceLine }) => {
        const group = definition.groups[groupIndex];
        return group?.entries.length !== 1 || group.entries[0].statsId !== drop.statsId || group.entries[0].sourceLine !== sourceLine;
      })) throw new Error(`Invalid equipment group evidence: ${entity.id}/${drop.statsId}`);
    return [itemsById.get(source.itemId)];
  };
  const inventoryResolution = new Map();
  const dialogTransferResolution = [];
  const resolveNativeInventoryEntry = (entry) => {
    const placedItem = placedObjects.get(entry.objectId);
    const templateId = placedItem?.templateId || entry.templateId;
    // An empty UUID/TemplateID pair is a generated Stats entry, not a placed
    // object. Only this source form may use ItemName as the generating Stats.
    if (!templateId && stats.has(entry.itemName)) return treasureItems.resolve(entry.itemName);
    return resolveItems({ objectId: entry.objectId, templateId,
      statsId: placedItem?.statsId, names: [entry.itemName] });
  };
  const resolveInventoryItems = ({ statsId, itemName, title, objectId, templateId }, ownerId) => {
    // ItemName can be a placed object's internal name, not a Stats reference.
    // The owner's exact UUID/TemplateID inventory entries take precedence.
    const owner = placedObjects.get(ownerId);
    const entries = owner?.inventory.filter((entry) => entry.itemName === itemName
      && (!objectId || entry.objectId === objectId)
      && (!templateId || (placedObjects.get(entry.objectId)?.templateId || entry.templateId) === templateId)) ?? [];
    if (entries.length) {
      const items = [...new Map(entries.flatMap(resolveNativeInventoryEntry).map((item) => [item.id, item])).values()];
      inventoryResolution.set(`${ownerId}:${itemName}:${objectId ?? ""}:${templateId ?? ""}`, { ownerId, itemName, sourcePath: owner.sourcePath,
        entries: entries.map(({ objectId, templateId }) => ({ objectId, templateId,
          ...(placedObjects.has(objectId) ? { objectSourcePath: placedObjects.get(objectId).sourcePath } : {}) })), itemIds: items.map(({ id }) => id) });
      return items;
    }
    if (stats.has(itemName)) return treasureItems.resolve(itemName);
    return resolveItems({ objectId, statsId, templateId, names: [title, itemName] });
  };
  // Follow the generating stat's native root when it is unambiguous. Shared
  // stat names alone do not authorize cinematic/template sibling acquisitions.
  const treasureStockItems = (tableId, namedStock = []) => {
    const table = treasureTables[tableId];
    if (!table?.namedStockIds) return namedStock.flatMap((name) => resolveItems({ names: [name] }));
    return table.namedStockIds.flatMap(treasureItems.resolve);
  };
  const mappedItemObjectIds = new Set();
  // Public marker context per placed object, so inventories mined from the raw
  // placements link to the same map location as the marker-derived records.
  const publicEntityContexts = new Map();
  const publicLootAvailabilityById = new Map();
  // Every marker of a placed object across maps, keyed by the object it
  // represents (story-destination copies count for their source character).
  const entityContextsByObjectId = new Map();
  const add = (targets, acquisition) => {
    for (const item of targets) {
      const key = [
        acquisition.kind,
        acquisition.sourceId ?? "",
        acquisition.source,
        acquisition.mapId ?? "",
        acquisition.locationId ?? "",
        acquisition.detail ?? "",
      ].join("\u0000");
      const keys = acquisitionKeys.get(item.id);
      if (keys.has(key)) continue;
      keys.add(key);
      item.acquisitions.push({
        id: `${item.id}:acquisition:${keys.size}`,
        ...acquisition,
      });
    }
  };

  // Resolve identities before grouping. Separate stacks accumulate; mutually
  // exclusive source rows do not. Never merge different acquisition methods.
  const addInventory = (entries, resolve, context, kind, availability) => {
    const groups = new Map();
    for (const entry of entries) for (const item of resolve(entry)) {
      const group = groups.get(item.id) ?? { item, entries: [] };
      group.entries.push({ amount: entry.amount,
        ...(entry.inventoryCondition ? { inventoryCondition: entry.inventoryCondition } : {}) });
      groups.set(item.id, group);
    }
    for (const { item, entries: variants } of groups.values()) {
      const quantity = getInventoryQuantity(variants);
      if (!quantity.maximum) continue;
      add([item], { kind, ...context,
        ...acquisitionAvailability(availability, quantity.conditional ? "story" : "guaranteed"),
        ...(quantity.maximum > 1 ? { amount: quantity.maximum } : {}),
        ...(quantity.conditional ? { inventoryVariants: variants } : {}) });
    }
  };

  if (fs.existsSync(mapsRoot)) {
    for (const directory of fs.readdirSync(mapsRoot, { withFileTypes: true })) {
      if (!directory.isDirectory()) continue;
      const contentPath = path.join(mapsRoot, directory.name, "content.json");
      const locationsPath = path.join(mapsRoot, directory.name, "locations.json");
      const metadataPath = path.join(mapsRoot, directory.name, "metadata.json");
      const requiredFiles = [contentPath, locationsPath, metadataPath];
      if (requiredFiles.every((file) => !fs.existsSync(file))) continue;
      const missingFiles = requiredFiles.filter((file) => !fs.existsSync(file));
      if (missingFiles.length) throw new Error(`Incomplete acquisition map input: ${missingFiles.join(", ")}`);

      const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
      const entities = Array.isArray(content.entities) ? content.entities : Object.values(content.entities ?? {});
      const entityById = new Map(entities.map((entity) => [entity.id, entity]));
      const locationList = JSON.parse(fs.readFileSync(locationsPath, "utf8")).locations ?? [];
      const locationByContentId = new Map(locationList.map((location) => [location.contentId, location]));
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      const mapContext = {
        mapId: directory.name,
        mapName: metadata.displayName ?? directory.name,
      };
      const locationContext = (contentId) => {
        const location = locationByContentId.get(contentId);
        return location ? {
          ...mapContext,
          locationId: location.id,
          ...(location.region ? { region: location.region } : {}),
        } : mapContext;
      };
      const sourceDetails = (entity) => {
        const currentPosition = entity.partyMember?.positions?.find(({ contentId }) => contentId === entity.id);
        return {
          sourceId: entity.partyMember?.memberId
            ? `party-member:${entity.partyMember.memberId}`
            : entity.storyDestination?.characterContentId ?? entity.id,
          source: entity.localizedTitles?.en ?? entity.title,
          localizedSources: Object.fromEntries(Object.entries({
            en: entity.localizedTitles?.en ?? entity.title,
            tr: entity.localizedTitles?.tr,
          }).filter(([, value]) => value)),
          ...(currentPosition?.localizedConditions ? {
            locationDetail: currentPosition.localizedConditions.en,
            localizedLocationDetails: currentPosition.localizedConditions,
          } : {}),
        };
      };

      for (const entity of entities) {
        if (entity.deathLoot?.availability?.deathDropsUnavailable) {
          const reviewed = sceneContentFor(entity.storyDestination);
          if (!reviewed?.deathDropsUnavailable || entity.deathLoot.availability.id !== reviewed.id
            || !isDeepStrictEqual(entity.deathLoot.availability.localizedConditions, reviewed.lootAvailability)
            || !isDeepStrictEqual(entity.deathLoot.availability.evidence, reviewed.evidence)) {
            throw new Error(`Unverified scene death-acquisition restriction: ${entity.id}`);
          }
        }
        const directTargets = resolveItems({
          objectId: entity.id,
          statsId: entity.statsId,
          templateId: entity.templateId,
          names: [entity.localizedTitles?.en, entity.title],
        });
        const uniqueEquipmentMarker = entity.gameplay?.unique
          && ["item-weapons", "item-armor", "item-jewellery"].includes(entity.kind);
        if (directTargets.length && (
          uniqueEquipmentMarker
          || ["key-item", "valuable-item", "item-alchemy", "item-books", "item-paintings"].includes(entity.kind)
        )) {
          if (entity.itemLocation) mappedItemObjectIds.add(entity.id);
          const owner = entity.itemLocation?.ownerContentId
            ? entityById.get(entity.itemLocation.ownerContentId)
            : undefined;
          const source = owner ? sourceDetails(owner) : sourceDetails(entity);
          const targetContext = locationContext(owner?.id ?? entity.id);
          const available = acquisitionAvailability(owner?.deathLoot?.availability, "guaranteed");
          if (!entity.itemLocation) {
            add(directTargets, { kind: "world", certainty: "guaranteed", ...source, ...targetContext });
          } else if (entity.itemLocation.ownerKind === "container") {
            add(directTargets, { kind: "container", ...source, ...targetContext, ...available });
          } else {
            if (entity.itemLocation.droppedOnDeath && allowsDeathAcquisition(owner?.deathLoot?.availability)) {
              add(directTargets, { kind: "drop", ...source, ...targetContext, ...available });
            }
            if (entity.itemLocation.pickpocketable) {
              add(directTargets, { kind: "pickpocket", ...source, ...targetContext, ...available });
            }
          }
          if (entity.itemLocation?.ownerKind === "character"
            && !entity.itemLocation.droppedOnDeath
            && !entity.itemLocation.pickpocketable) {
            add(directTargets, { kind: "carried", ...source, ...targetContext, ...available });
          }
        }

        const entitySource = sourceDetails(entity);
        const entityLocation = locationContext(entity.id);
        if (entity.sceneContext?.itemTransfers) {
          const reviewed = sceneContentFor(entity.storyDestination);
          if (!reviewed || !isDeepStrictEqual(entity.sceneContext.itemTransfers, reviewed.itemTransfers)) {
            throw new Error(`Unverified scene item transfer: ${entity.id}`);
          }
          for (const transfer of reviewed.itemTransfers) {
            const entry = transfer.item, placed = placedObjects.get(transfer.objectId);
            const targets = resolveItems({ objectId: transfer.objectId, templateId: entry.templateId, statsId: entry.statsId });
            const item = targets[0];
            if (!placed || placed.templateId !== entry.templateId || placed.statsId && placed.statsId !== entry.statsId
              || transfer.destinationContentId !== entity.storyDestination.characterContentId || targets.length !== 1
              || item.id !== entry.itemId || item.name !== entry.title || !isDeepStrictEqual(item.localizedNames, entry.localizedNames)) {
              throw new Error(`Changed physical scene item: ${entity.id}/${transfer.objectId}`);
            }
            const localizedConditions = Object.fromEntries(Object.entries(transfer.localizedConditions).map(([language, text]) => [language,
              `${reviewed.localizedDescriptions[language] ?? reviewed.localizedDescriptions.en}\n\n${text}`]));
            // Moving the existing object establishes conditional possession,
            // not a spawned copy, death drop or pickpocket permission.
            add([item], { kind: "carried", ...entitySource, ...entityLocation,
              ...acquisitionAvailability({ localizedConditions }, "story"), ...(entry.amount > 1 ? { amount: entry.amount } : {}) });
          }
        }
        const replacement = entity.sceneContext?.inventoryChange;
        if (replacement) {
          const reviewed = sceneContentFor(entity.storyDestination);
          if (!reviewed || !isDeepStrictEqual(replacement, reviewed.inventoryChange)
            || entity.deathLoot && !isDeepStrictEqual(entity.deathLoot.availability?.localizedConditions, reviewed.lootAvailability)) {
            throw new Error(`Unverified scene inventory change: ${entity.id}`);
          }
          for (const branch of replacement.branches.filter((branch) => !branch.reviewOnly)) for (const entry of branch.items) {
            const item = itemsById.get(entry.itemId);
            if (!item || item.id !== entry.templateId || item.generation || !item.templateIds.includes(entry.templateId)
              || item.statsId !== entry.statsId || item.name !== entry.title || !isDeepStrictEqual(item.localizedNames, entry.localizedNames)) {
              throw new Error(`Scene item identity changed: ${entity.id}/${entry.itemId}`);
            }
            // A script assigning clothing proves conditional possession only,
            // not a death drop or a pickpocket permission in this later scene.
            add([item], { kind: "carried", ...entitySource, ...entityLocation,
              ...acquisitionAvailability({ localizedConditions: branch.localizedConditions }, "story"),
              ...(entry.amount > 1 ? { amount: entry.amount } : {}) });
          }
        }
        const equipmentChange = entity.sceneContext?.equipmentChange;
        if (equipmentChange) {
          const reviewed = sceneContentFor(entity.storyDestination);
          if (!reviewed || !isDeepStrictEqual(equipmentChange, reviewed.equipmentChange)) {
            throw new Error(`Unverified scene equipment change: ${entity.id}`);
          }
          for (const entry of equipmentChange.items) {
            const item = itemsById.get(entry.itemId), identity = equipmentIdentities?.[entry.statsId];
            if (!item || identity?.status !== "resolved" || identity.itemIds.length !== 1 || identity.itemIds[0] !== item.id
              || identity.rootTemplateId !== entry.templateId || !item.templateIds.includes(entry.templateId)
              || item.statsId !== entry.statsId || item.name !== entry.title || !isDeepStrictEqual(item.localizedNames, entry.localizedNames)) {
              throw new Error(`Scene equipment identity changed: ${entity.id}/${entry.itemId}`);
            }
            // Giving an equipment set proves possession during the scene, not
            // pickpocket permission or an unconditional death-drop outcome.
            add([item], { kind: "carried", ...entitySource, ...entityLocation,
              ...acquisitionAvailability({ localizedConditions: equipmentChange.localizedConditions }, "story"),
              ...(entry.amount > 1 ? { amount: entry.amount } : {}) });
          }
        }
        publicEntityContexts.set(entity.id, { ...entitySource, ...entityLocation });
        if (entity.deathLoot?.availability) publicLootAvailabilityById.set(entity.id, entity.deathLoot.availability);
        if (entityLocation.locationId) {
          const objectId = ownerForEntity(entity);
          entityContextsByObjectId.set(objectId, [...(entityContextsByObjectId.get(objectId) ?? []), {
            ...entityLocation,
            storyGoals: (entity.storyDestination?.evidence ?? []).map(({ sourcePath }) => sourcePath),
          }]);
        }
        if (entity.deathLoot) {
          const drops = entity.deathLoot.guaranteedDrops;
          const resolve = (drop) => drop.equipmentSource ? resolveEquipmentDrop(drop, entity) : resolveInventoryItems(drop, ownerForEntity(entity));
          const isCharacterSource = entity.gameplay?.type === "Character" && entity.kind !== "corpse";
          const isContainerInventory = !isCharacterSource && (entity.containerLoot?.items?.length ?? 0) > 0;
          if (!isContainerInventory && allowsDeathAcquisition(entity.deathLoot.availability)) {
            addInventory(drops, resolve, { ...entitySource, ...entityLocation }, "drop", entity.deathLoot.availability);
          }
          if (isCharacterSource) {
            addInventory(drops.filter((drop) => drop.canBePickpocketed), resolve,
              { ...entitySource, ...entityLocation }, "pickpocket", entity.deathLoot.availability);
          }
        }
        for (const tableId of entity.vendor?.tradeTables ?? []) {
          add(treasureStockItems(tableId, entity.vendor.namedStock), {
            kind: "vendor",
            certainty: "stock",
            ...entitySource,
            ...entityLocation,
          });
        }
        for (const stock of entity.vendor?.conditionalStock ?? []) {
          add(stock.stockIds.flatMap(treasureItems.resolve), {
            kind: "vendor", certainty: "story", ...entitySource, ...entityLocation,
            detail: stock.localizedConditions.en, localizedDetails: stock.localizedConditions,
            locationDetail: stock.localizedConditions.en, localizedLocationDetails: stock.localizedConditions,
          });
        }
        addInventory(entity.containerLoot?.items ?? [], (entry) => resolveInventoryItems(entry, ownerForEntity(entity)),
          { ...entitySource, ...entityLocation }, "container");
        const randomPools = [
          ...(entity.deathLoot?.randomLootPools ?? []).map((pool) => ({ pool, availability: entity.deathLoot.availability })),
          ...(entity.containerLoot?.randomLootPools ?? []).map((pool) => ({ pool })),
        ];
        for (const { pool, availability } of randomPools) {
          add(treasureStockItems(pool.tableId, pool.namedStock), {
            kind: "random-loot",
            ...entitySource,
            ...entityLocation,
            ...acquisitionAvailability(availability, "random"),
          });
        }
      }
    }
  }

  // Authored inventories, trade tables and loot tables of every placed
  // character and container, including owners that never become map markers
  // and traders whose marker is not classified as a vendor. Owners that are
  // markers reuse their marker context so these records merge with the
  // marker-derived ones.
  for (const owner of placedObjects.values()) {
    if (!owner.displayName.en) continue;
    const ownerContext = publicEntityContexts.get(owner.id) ?? {
      sourceId: owner.id,
      source: owner.displayName.en,
      localizedSources: owner.displayName,
    };
    for (const tableId of owner.tradeTables) {
      add(treasureStockItems(tableId), { kind: "vendor", certainty: "stock", ...ownerContext });
    }
    for (const tableId of owner.treasureTables) {
      add(treasureStockItems(tableId), { kind: "random-loot", ...ownerContext,
        ...acquisitionAvailability(publicLootAvailabilityById.get(owner.id), "random") });
    }
    const inventory = owner.inventory.filter((entry) => !entry.objectId || !mappedItemObjectIds.has(entry.objectId));
    const availability = publicLootAvailabilityById.get(owner.id);
    if (owner.ownerKind === "container") {
      addInventory(inventory, resolveNativeInventoryEntry, ownerContext, "container", availability);
    } else {
      if (allowsDeathAcquisition(availability)) {
        addInventory(inventory.filter((entry) => entry.droppedOnDeath), resolveNativeInventoryEntry, ownerContext, "drop", availability);
      }
      addInventory(inventory.filter((entry) => entry.pickpocketable), resolveNativeInventoryEntry, ownerContext, "pickpocket", availability);
      addInventory(inventory.filter((entry) => !entry.droppedOnDeath && !entry.pickpocketable), resolveNativeInventoryEntry, ownerContext, "carried", availability);
    }
  }

  // Story-scripted transfers: exact Osiris statements that equip, hand over or
  // spawn an item for a character or container. A transfer links to the owner's
  // marker only when that is unambiguous: a story-destination marker whose
  // teleport statement comes from the same story goal as the transfer, or the
  // owner's sole authored marker. A lone later-scene destination is not proof
  // that an unrelated transfer happened there. Otherwise keep it unlinked.
  if (fs.existsSync(scriptedTransferCatalogPath)) {
    const transferCatalog = JSON.parse(fs.readFileSync(scriptedTransferCatalogPath, "utf8"));
    const linkedContext = (transfer) => {
      const candidates = entityContextsByObjectId.get(transfer.owner.id) ?? [];
      const goals = new Set(transfer.evidence.map(({ sourcePath }) => sourcePath));
      const sameGoal = candidates.filter(({ storyGoals }) => storyGoals.some((goal) => goals.has(goal)));
      const selected = sameGoal.length === 1 ? sameGoal[0]
        : candidates.length === 1 && candidates[0].storyGoals.length === 0 ? candidates[0] : null;
      return selected ? { mapId: selected.mapId, mapName: selected.mapName, locationId: selected.locationId, ...(selected.region ? { region: selected.region } : {}) } : {};
    };
    for (const transfer of transferCatalog.transfers ?? []) {
      const placedItem = placedObjects.get(transfer.item.id);
      add(resolveItems({ objectId: transfer.item.id, templateId: placedItem?.templateId ?? transfer.item.templateId, statsId: placedItem?.statsId }), {
        kind: transfer.owner.type === "character" ? "carried" : "container",
        certainty: "story",
        sourceId: transfer.owner.id,
        source: transfer.owner.displayName.en,
        localizedSources: transfer.owner.displayName,
        ...(transfer.amount > 1 ? { amount: transfer.amount } : {}),
        ...linkedContext(transfer),
      });
    }
  }

  if (fs.existsSync(dialogCatalogPath)) {
    const dialogCatalog = JSON.parse(fs.readFileSync(dialogCatalogPath, "utf8"));
    for (const dialog of Object.values(dialogCatalog.dialogs ?? {})) {
      for (const outcome of dialog.choiceOutcomes ?? []) {
        for (const consequence of outcome.consequences ?? []) {
          for (const effect of [...(consequence.rewards ?? []), ...(consequence.itemTransfers ?? [])]) {
            const placedItem = effect.kind === "placed-item" ? placedObjects.get(effect.itemId) : undefined;
            const templateId = effect.kind === "template" ? effect.itemId : placedItem?.templateId;
            // Resolve native identity, including placed Stats overrides. A name
            // match must not substitute an unrelated item for a missing UUID.
            const targets = templateId && byTemplateId.has(templateId.toLocaleLowerCase("en-US"))
              ? resolveItems({ objectId: placedItem?.id, templateId, statsId: placedItem?.statsId }) : [];
            const resolution = { dialogId: dialog.id, choiceId: outcome.id, relationId: effect.id,
              direction: effect.direction ?? "legacy-reward", recipient: effect.recipient,
              sourceItemId: effect.itemId, templateId, statsId: placedItem?.statsId,
              itemIds: targets.map(({ id }) => id), status: "unresolved-item" };
            dialogTransferResolution.push(resolution);
            if (!targets.length) continue;
            // Delivering the player's item is an outgoing transfer, not an
            // acquisition source. The recipient may consume it immediately.
            if (effect.sender?.kind === "player") {
              resolution.status = "outgoing-player-transfer";
              continue;
            }
            const details = {
              ...(outcome.localizedText?.en ? { detail: outcome.localizedText.en } : {}),
              localizedDetails: Object.fromEntries(Object.entries(outcome.localizedText ?? {})
                .filter(([, value]) => value)),
              ...(effect.amount > 1 ? { amount: effect.amount } : {}),
            };
            if (!effect.direction || effect.direction === "to-player") {
              add(targets, { kind: "reward", certainty: "scripted", source: dialog.title,
                localizedSources: { en: dialog.title }, ...details });
              resolution.status = "player-reward";
              continue;
            }
            const owner = effect.recipient?.kind === "participant" && effect.recipient.participantIds.length === 1
              ? placedObjects.get(effect.recipient.participantIds[0]) : undefined;
            if (effect.direction !== "to-participant" || !owner?.displayName.en) {
              resolution.status = "unresolved-recipient";
              continue;
            }
            // This is conditional ownership, not a newly obtained player item
            // and not proof that the owner drops it or can be pickpocketed.
            add(targets, { kind: owner.ownerKind === "character" ? "carried" : "container", certainty: "story",
              sourceId: owner.id, source: owner.displayName.en, localizedSources: owner.displayName, ...details });
            resolution.status = "conditional-ownership";
          }
        }
      }
    }
  }

  if (fs.existsSync(forgeCatalogPath)) {
    const forgeCatalog = JSON.parse(fs.readFileSync(forgeCatalogPath, "utf8"));
    const forgeLocation = locationByMapContentId(mapsRoot, "grymforge", forgeCatalog.forgeAnchor?.id);
    for (const recipe of forgeCatalog.recipes ?? []) {
      // The recipe's statId describes the mould chamber, not the spawned item.
      // The native rule creates the result template with its own default Stats.
      add(resolveItems({ templateId: recipe.resultTemplateId, names: [recipe.title] }), {
        kind: "crafted",
        certainty: "scripted",
        source: forgeCatalog.forge?.title ?? "Adamantine Forge",
        localizedSources: forgeCatalog.forge?.localizedTitles ?? { en: "Adamantine Forge" },
        ...forgeLocation,
      });
    }
  }

  for (const item of items) {
    item.acquisitions.sort((left, right) => {
      const priority = ["reward", "crafted", "world", "vendor", "drop", "pickpocket", "container", "carried", "random-loot"];
      return priority.indexOf(left.kind) - priority.indexOf(right.kind)
        || left.source.localeCompare(right.source, "en");
    });
  }
  return { treasureResolution: [...treasureItems.records.values()], inventoryResolution: [...inventoryResolution.values()], dialogTransferResolution };
};

const locationByMapContentId = (root, mapId, contentId) => {
  if (!contentId) return {};
  const locationsPath = path.join(root, mapId, "locations.json");
  const metadataPath = path.join(root, mapId, "metadata.json");
  if (!fs.existsSync(locationsPath) || !fs.existsSync(metadataPath)) return {};
  const location = (JSON.parse(fs.readFileSync(locationsPath, "utf8")).locations ?? [])
    .find((candidate) => candidate.contentId === contentId);
  if (!location) return {};
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  return {
    mapId,
    mapName: metadata.displayName ?? mapId,
    locationId: location.id,
    ...(location.region ? { region: location.region } : {}),
  };
};

const attachCraftingRelations = (items, stats) => {
  const byId = new Map(items.map((item) => [item.id, item]));
  const byStatsId = new Map();
  const byTemplateId = new Map();
  const byComboCategory = new Map();
  for (const item of items) {
    if (item.generation?.origin === "placed-identity") continue;
    addToIndex(byStatsId, item.statsId, item);
    for (const templateId of item.templateIds) {
      addToIndex(byTemplateId, templateId.toLocaleLowerCase("en-US"), item);
    }
  }
  for (const [statsId, stat] of stats) {
    for (const category of splitValues(stat.data.ComboCategory)) {
      for (const item of byStatsId.get(statsId) ?? []) addToIndex(byComboCategory, category, item);
    }
  }

  const uniqueItems = (candidates) => [...new Map(candidates.map((item) => [item.id, item])).values()];
  const resolveMaterial = ({ type, id }) => uniqueItems(
    type === "category" ? byComboCategory.get(id) ?? [] : byStatsId.get(id) ?? [],
  );
  const resolveResult = ({ statsId, templateId }) => uniqueItems([
    ...(templateId ? byTemplateId.get(templateId.toLocaleLowerCase("en-US")) ?? [] : []),
    ...(!templateId ? byStatsId.get(statsId) ?? [] : []),
  ]);
  const canonical = (candidates) => candidates.find((item) => item.unique) ?? candidates[0];
  const definitions = readItemCombinations(itemCombinationsRoot);

  if (fs.existsSync(forgeCatalogPath)) {
    const forge = JSON.parse(fs.readFileSync(forgeCatalogPath, "utf8"));
    for (const recipe of forge.recipes ?? []) {
      definitions.push({
        id: recipe.id,
        source: "adamantine-forge",
        sourceNames: forge.forge?.localizedTitles ?? { en: forge.forge?.title ?? "Adamantine Forge" },
        result: { statsId: recipe.statId, templateId: recipe.resultTemplateId, amount: 1 },
        materials: [
          { type: "item", id: forge.mithralOre.statsId },
          { type: "template", id: recipe.moldTemplateId },
        ],
      });
    }
  }

  let attachedRecipes = 0;
  let relationRecords = 0;
  const resolvedRecipes = new Map();
  for (const definition of definitions) {
    const results = resolveResult(definition.result);
    if (!results.length) continue;

    const groupedMaterials = new Map();
    for (const material of definition.materials) {
      const key = `${material.type}:${material.id}`;
      const existing = groupedMaterials.get(key);
      if (existing) existing.amount += 1;
      else groupedMaterials.set(key, { ...material, amount: 1 });
    }
    const materials = [...groupedMaterials.values()].map((material) => {
      const options = material.type === "template"
        ? uniqueItems(byTemplateId.get(material.id.toLocaleLowerCase("en-US")) ?? [])
        : resolveMaterial(material);
      return {
        kind: material.type === "category" ? "category" : "item",
        sourceId: material.id,
        amount: material.amount,
        options: options.map(({ id }) => id),
      };
    });
    if (!materials.length || materials.some(({ options }) => options.length === 0)) continue;

    const result = canonical(results);
    const recipe = {
      id: definition.id,
      source: definition.source,
      ...(definition.sourceNames ? { sourceNames: definition.sourceNames } : {}),
      resultAmount: definition.result.amount,
      materials,
    };
    resolvedRecipes.set(recipe.id, recipe);
    for (const output of results) {
      output.crafting ??= { recipeIds: [], usedIn: [] };
      if (!output.crafting.recipeIds.includes(recipe.id)) {
        output.crafting.recipeIds.push(recipe.id);
        attachedRecipes += 1;
      }
    }

    const usedIn = {
      recipeId: recipe.id,
      source: recipe.source,
      ...(recipe.sourceNames ? { sourceNames: recipe.sourceNames } : {}),
      resultAmount: recipe.resultAmount,
      resultItemId: result.id,
    };
    for (const material of materials) {
      for (const optionId of material.options) {
        const item = byId.get(optionId);
        item.crafting ??= { recipeIds: [], usedIn: [] };
        if (!item.crafting.usedIn.some(({ recipeId, resultItemId }) => (
          recipeId === usedIn.recipeId && resultItemId === usedIn.resultItemId
        ))) {
          item.crafting.usedIn.push(usedIn);
          relationRecords += 1;
        }
      }
    }
  }

  for (const item of items) {
    if (!item.crafting) continue;
    item.crafting.recipeIds.sort((left, right) => left.localeCompare(right, "en"));
    item.crafting.usedIn.sort((left, right) => (
      (byId.get(left.resultItemId)?.name ?? "").localeCompare(byId.get(right.resultItemId)?.name ?? "", "en")
        || left.recipeId.localeCompare(right.recipeId, "en")
    ));
  }
  return {
    recipes: [...resolvedRecipes.values()].sort((left, right) => left.id.localeCompare(right.id, "en")),
    stats: { recipeDefinitions: definitions.length, attachedRecipes, relationRecords },
  };
};

const buildCatalog = () => {
  const stats = readResolvedItemStats(listFiles(statsRoot, isItemStatFile), projectRoot);
  const equipment = arguments_.has("equipment-catalog")
    ? readVerifiedEquipmentCatalog(resolveArgument("equipment-catalog"), projectRoot) : null;
  if (equipment && equipment.sourceBuild !== sourceBuild) throw new Error("Equipment and item source builds differ");
  const { rawTemplates, resolvedTemplates } = readResolvedTemplates();
  const localization = {
    en: readLocalization(englishLocalizationPath),
    tr: readLocalization(turkishLocalizationPath),
  };
  const iconMappings = readIconMappings();
  const placements = readPlacedObjects(resolvedTemplates, localization);
  const candidates = [];
  for (const variant of collectItemTemplateVariants({ stats, rawTemplates, resolvedTemplates, statOverrides: placements.statOverrides,
    identityOverrides: placements.identityOverrides,
    equipmentReferences: equipmentStatReferences(equipment) })) {
    const { templateId, statsId } = variant;
    const rawTemplate = rawTemplates.get(templateId);
    const template = { ...resolvedTemplates.get(templateId), ...variant.attributes };
    const stat = stats.get(statsId);
    if (!stat || !ITEM_STAT_TYPES.has(stat.type)) continue;
    const nameHandle = template.DisplayName?.handle;
    const name = nameHandle ? localization.en.get(nameHandle) : undefined;
    if (!name) continue;
    const descriptionHandle = template.Description?.handle;
    const description = descriptionHandle ? localization.en.get(descriptionHandle) : undefined;
    const iconId = attributeValue(template.Icon);
    candidates.push({
      id: variant.id,
      ...(variant.generation ? { generation: variant.generation } : {}),
      statsId,
      templateIds: [attributeValue(rawTemplate.MapKey)],
      name,
      localizedNames: Object.fromEntries(Object.entries({
        en: name,
        tr: nameHandle ? localization.tr.get(nameHandle) : undefined,
      }).filter(([, value]) => value)),
      ...(description ? { description } : {}),
      localizedDescriptions: Object.fromEntries(Object.entries({
        en: description,
        tr: descriptionHandle ? localization.tr.get(descriptionHandle) : undefined,
      }).filter(([, value]) => value)),
      category: inferCategory(stat),
      subtype: inferSubtype(stat),
      type: stat.type,
      rarity: stat.data.Rarity || "Common",
      unique: stat.data.Unique === "1",
      ...(iconId ? {
        icon: {
          id: iconId,
          ...(iconMappings.get(iconId) ?? {}),
        },
      } : {}),
      gameplay: {
        ...(stat.data.Slot ? { slot: stat.data.Slot } : {}),
        ...(stat.data.ArmorClass ? { armorClass: stat.data.ArmorClass } : {}),
        ...(stat.data.ArmorType ? { armorType: stat.data.ArmorType } : {}),
        ...(stat.data.WeaponType || stat.data.WeaponGroup || stat.data["Weapon Group"]
          ? { weaponType: stat.data.WeaponType || stat.data.WeaponGroup || stat.data["Weapon Group"] }
          : {}),
        ...(stat.data.Damage ? { damage: stat.data.Damage } : {}),
        ...(stat.data["Damage Type"] || stat.data.DamageType
          ? { damageType: stat.data["Damage Type"] || stat.data.DamageType }
          : {}),
        ...(stat.data["Proficiency Group"] || stat.data.ProficiencyGroup
          ? { proficiency: stat.data["Proficiency Group"] || stat.data.ProficiencyGroup }
          : {}),
        ...(stat.data.Weight ? { weight: stat.data.Weight } : {}),
        ...(stat.data.ValueOverride || stat.data.Value ? { value: stat.data.ValueOverride || stat.data.Value } : {}),
        ...(stat.data.VersatileDamage ? { versatileDamage: stat.data.VersatileDamage } : {}),
        ...(stat.data.WeaponRange && Number(stat.data.WeaponRange) > 0
          ? { rangeMeters: Number(stat.data.WeaponRange) / 100 }
          : {}),
        ...(stat.data.Level ? { level: stat.data.Level } : {}),
        ...(stat.data.MinLevel ? { minimumLevel: stat.data.MinLevel } : {}),
        weaponProperties: splitValues(stat.data["Weapon Properties"]),
        enchantment: Number(stat.data.DefaultBoosts?.match(/WeaponEnchantment\((\d+)\)/)?.[1] ?? 0),
        magical: /WeaponProperty\(Magical\)/.test(stat.data.DefaultBoosts ?? "")
          || splitValues(stat.data["Weapon Properties"]).includes("Magical"),
        effects: resolveItemEffects(stat, stats, localization),
        boosts: splitValues(stat.data.Boosts || (stat.type === "Object" ? "" : stat.data.DefaultBoosts)),
        passives: splitValues(stat.data.PassivesOnEquip),
        requirements: splitValues(stat.data.Requirements),
      },
      properties: compactProperties(stat.data),
      provenance: {
        stats: stat.provenance,
        templateModule: rawTemplate.module,
        sourceBuild,
      },
    });
  }

  const uniqueItems = new Map();
  for (const item of candidates) {
    const key = `${item.name}\u0000${item.statsId}\u0000${JSON.stringify(item.properties)}${item.generation ? `\u0000${item.id}` : ""}`;
    const existing = uniqueItems.get(key);
    if (!existing) {
      uniqueItems.set(key, item);
      continue;
    }
    existing.templateIds.push(...item.templateIds);
    if (!existing.icon?.atlas && item.icon?.atlas) existing.icon = item.icon;
    if (!existing.description && item.description) {
      existing.description = item.description;
      existing.localizedDescriptions = item.localizedDescriptions;
    }
  }

  const allItems = [...uniqueItems.values()]
    .map((item) => ({ ...item, templateIds: [...new Set(item.templateIds)].sort() }))
    .sort((left, right) => left.name.localeCompare(right.name, "en") || left.id.localeCompare(right.id, "en"));
  const { treasureResolution, inventoryResolution, dialogTransferResolution } = attachAcquisitions(allItems, stats, placements.objects, equipment);
  // Native "item" templates also represent scenery. A named physical object
  // only joins the player-item catalog when an actual acquisition references
  // it; retain all other source identities in the review artifact.
  const placedItemResolution = allItems.filter((item) => item.generation?.origin === "placed-identity")
    .map((item) => ({ item, status: item.acquisitions.length ? "linked-item" : "unlinked-source-object" }));
  const items = allItems.filter((item) => item.generation?.origin !== "placed-identity" || item.acquisitions.length);
  const crafting = attachCraftingRelations(items, stats);
  const categories = Object.entries(items.reduce((counts, item) => {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, {})).map(([id, count]) => ({ id, count }));

  const catalog = {
    schemaVersion: 3,
    sourceBuild,
    generatedAt: new Date().toISOString(),
    stats: {
      rawTemplates: rawTemplates.size,
      localizedCandidates: candidates.length,
      items: items.length,
      iconsResolved: items.filter((item) => item.icon?.atlas).length,
      acquisitionRecords: items.reduce((sum, item) => sum + item.acquisitions.length, 0),
      ...crafting.stats,
    },
    categories,
    recipes: crafting.recipes,
    items,
  };
  return { catalog, treasureResolution, inventoryResolution, dialogTransferResolution, placedItemResolution };
};

try {
  const { catalog, treasureResolution, inventoryResolution, dialogTransferResolution, placedItemResolution } = buildCatalog();
  if (!stageRoot && fs.existsSync(outputPath)) {
    const previous = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    console.log("Acquisition search synchronization:", syncAcquisitionSearch(previous.items, catalog.items, mapsRoot));
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await withTransientFileRetry(() => writeGeneratedFile(outputPath, `${JSON.stringify(catalog)}\n`), {
    onRetry: (error, attempt) => console.warn(`Retrying item database output after ${error.code} (attempt ${attempt}).`),
  });
  const resolutionStats = Object.fromEntries([...Map.groupBy(treasureResolution, ({ mode }) => mode)].map(([mode, entries]) => [mode, entries.length]));
  writeGeneratedFile(path.join(resolutionRoot, "treasure-item-resolution.json"), `${JSON.stringify({ stats: resolutionStats, entries: treasureResolution }, null, 2)}\n`);
  console.log("Treasure item identity review:", resolutionStats);
  writeGeneratedFile(path.join(resolutionRoot, "inventory-item-resolution.json"), `${JSON.stringify({ entries: inventoryResolution }, null, 2)}\n`);
  writeGeneratedFile(path.join(resolutionRoot, "dialog-item-transfer-resolution.json"), `${JSON.stringify({ entries: dialogTransferResolution }, null, 2)}\n`);
  writeGeneratedFile(path.join(resolutionRoot, "placed-item-identity-resolution.json"), `${JSON.stringify({ entries: placedItemResolution }, null, 2)}\n`);
  if (stageRoot) console.log("Staged item data only; published data, map search metadata and resolution reports were not changed.");
  console.log(`Item database: ${catalog.stats.items} localized items, ${catalog.stats.iconsResolved} mapped icons, ${catalog.categories.length} categories.`);
} catch (error) {
  console.error("Item database build failed:", error);
  process.exitCode = 1;
}
