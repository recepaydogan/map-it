import fs from "node:fs";
import { isHostileCharacter, worldCheckCategories } from "./lib/world-check-presentation.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";
import path from "node:path";
import sharp from "sharp";
import { CONTAINER_FAMILY_PATTERN, isChestRecord } from "./lib/placement-containers.mjs";
import { createFloorSelector } from "./lib/floor-volume.mjs";
import { readCharacterCapabilities } from "./lib/character-capabilities.mjs";
import { groupStoryDestinations, selectStoryDestination } from "./lib/story-destination.mjs";
import { placementAtAnchor } from "./lib/placement-at-anchor.mjs";
import { refineNativeRasterAnchors } from "./lib/native-raster-anchor.mjs";
import { createStoryDestinationProfile } from "./lib/story-destination-profile.mjs";
import { buildSceneVendorProfile, createSceneVendorResolver, createStockTitleResolver } from "./lib/scene-vendor-profile.mjs";
import { buildNativeTradeInventory } from "./lib/native-trade-inventory.mjs";
import { findUniqueEquipmentClass, JEWELLERY_SLOTS } from "./lib/unique-equipment.mjs";
import { createReviewedDestinationCorrections } from "./lib/reviewed-destination-corrections.mjs";
import { applyLevelTransform, applyTemplateTransform, createLevelTransformResolver } from "./lib/level-coordinate-transform.mjs";
import { areReciprocalPortals, createNavigationPortalResolver, createPortalEndpointNormalizer, isStationaryNavigationPortal, isVerticalNavigationPortal, normalizeNavigationPortals } from "./lib/navigation-portal.mjs";
import { readNativeTeleportActions } from "./lib/native-teleport-actions.mjs";
import { createInventoryItemProfiler } from "./lib/inventory-item-profile.mjs";
import { readNativeInventoryCondition } from "./lib/native-inventory-condition.mjs";
import { createSceneContentResolver, readVerifiedSceneContentCatalog, applySceneContentProfile, applySceneInventorySearch } from "./lib/scene-content-profile.mjs";
import { labelByCandidateKind, publicCategoryByCandidateKind } from "./lib/placement-presentation.mjs";
import { createNativeCharacterEquipmentResolver } from "./lib/native-character-equipment.mjs";
import { createEquipmentLootProfiler, applyEquipmentLootProfile, readVerifiedEquipmentItemCatalog } from "./lib/equipment-loot-profile.mjs";

const parseArguments = (arguments_) => {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    }
    values.set(key.slice(2), value);
  }
  for (const required of ["placements", "localization-en", "output"]) {
    if (!values.has(required)) throw new Error(`Missing required argument: --${required}`);
  }
  return values;
};

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const writeRetryBuffer = new Int32Array(new SharedArrayBuffer(4));
const writeFileWithRetry = (filePath, contents) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      writeGeneratedFile(filePath, contents);
      return;
    } catch (error) {
      const transientLock = ["EBUSY", "EPERM", "UNKNOWN"].includes(error.code);
      if (!transientLock || attempt === 19) throw error;
      Atomics.wait(writeRetryBuffer, 0, 0, 250);
    }
  }
};

const readOptionalNumber = (arguments_, name) => {
  if (!arguments_.has(name)) return null;
  const value = Number(arguments_.get(name));
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a finite number.`);
  return value;
};

const decodeXml = (value) => value
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&quot;", "\"")
  .replaceAll("&apos;", "'")
  .replaceAll("&amp;", "&");

const stripLocalizationMarkup = (value) => decodeXml(value)
  .replace(/<br\s*\/?\s*>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/\s+/g, " ")
  .trim();

const readLocalization = (filePath) => {
  if (!filePath) return new Map();
  const xml = fs.readFileSync(filePath, "utf8");
  const entries = new Map();
  const pattern = /<content\s+contentuid="([^"]+)"[^>]*>([\s\S]*?)<\/content>/g;
  for (const match of xml.matchAll(pattern)) {
    entries.set(match[1], stripLocalizationMarkup(match[2]));
  }
  return entries;
};

const xmlAttribute = (body, id) => body
  .match(new RegExp(`<attribute\\s+id="${id}"[^>]*\\svalue="([^"]*)"`))?.[1];

const readDifficultyClasses = (filePaths) => {
  const entries = new Map();
  for (const filePath of filePaths) {
    const xml = fs.readFileSync(filePath, "utf8");
    for (const match of xml.matchAll(/<node\s+id="DifficultyClass">([\s\S]*?)<\/node>/g)) {
      const body = match[1];
      const id = xmlAttribute(body, "UUID")?.toLocaleLowerCase("en-US");
      if (!id) continue;
      const value = Number(xmlAttribute(body, "Difficulties"));
      entries.set(id, {
        id,
        name: xmlAttribute(body, "Name"),
        ...(Number.isFinite(value) ? { value } : {}),
      });
    }
  }
  return entries;
};

const attributeValue = (object, name, fallback = null) => {
  const attribute = object?.[name];
  if (!attribute || Array.isArray(attribute)) return fallback;
  return attribute.value ?? attribute.handle ?? fallback;
};

const parsePosition = (object) => {
  const value = object?.Transform?.[0]?.Position?.value;
  if (typeof value !== "string") return null;
  const coordinates = value.trim().split(/\s+/).map(Number);
  if (coordinates.length !== 3 || coordinates.some((coordinate) => !Number.isFinite(coordinate))) {
    return null;
  }
  return { x: coordinates[0], y: coordinates[1], z: coordinates[2] };
};

// Level-bound placements live under `<module>/Levels/<level>/<kind>/`, while
// story-managed global objects live under `<module>/Globals/<level>/<kind>/`.
// Both layouts describe the same object kinds, so the folder name after the
// level directory is the authoritative placement kind for either layout.
const PLACEMENT_LAYOUT_DIRECTORIES = new Set(["Levels", "Globals"]);

const getSourceIdentity = (root, filePath, provenancePrefix = "") => {
  const relativePath = path.relative(root, filePath).split(path.sep).join("/");
  const parts = relativePath.split("/");
  const layoutIndex = parts.findIndex((part) => PLACEMENT_LAYOUT_DIRECTORIES.has(part));
  const fallbackLayout = layoutIndex < 0 && parts.length >= 4;
  return {
    module: layoutIndex > 0 ? parts[layoutIndex - 1] : fallbackLayout ? parts[0] : "unknown",
    level: layoutIndex >= 0 ? parts[layoutIndex + 1] : fallbackLayout ? parts[1] : "unknown",
    placementKind: layoutIndex >= 0
      ? parts[layoutIndex + 2]?.toLowerCase() ?? "unknown"
      : fallbackLayout ? parts[2].toLowerCase() : "unknown",
    globalPlacement: layoutIndex >= 0 && parts[layoutIndex] === "Globals",
    relativePath: [provenancePrefix, relativePath].filter(Boolean).join("/"),
  };
};

const hasNestedValues = (value) => {
  if (Array.isArray(value)) return value.some(hasNestedValues);
  if (!value || typeof value !== "object") return value !== null && value !== "";
  return Object.values(value).some(hasNestedValues);
};

const collectNestedScalarValues = (value, output = []) => {
  if (Array.isArray(value)) {
    for (const item of value) collectNestedScalarValues(item, output);
    return output;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && value) output.push(value);
    return output;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "value" && typeof child === "string" && child) output.push(child);
    else collectNestedScalarValues(child, output);
  }
  return output;
};

const parseInventoryItems = (object) => (object?.ItemList ?? []).flatMap((group) => group.Item ?? [])
  .map((item) => ({
    objectId: attributeValue(item, "UUID", "").toLocaleLowerCase("en-US"),
    itemName: attributeValue(item, "ItemName", ""),
    templateId: attributeValue(item, "TemplateID", ""),
    amount: attributeValue(item, "Amount", 1),
    droppedOnDeath: attributeValue(item, "IsDroppedOnDeath", false) === true,
    canBePickpocketed: attributeValue(item, "CanBePickpocketed", false) === true,
    tradeable: attributeValue(item, "IsTradeable", attributeValue(item, "IsTradable", false)) === true,
    ...readNativeInventoryCondition(item),
    difficulties: [
      ["explorer", "CasualExplorer"],
      ["balanced", "Classic"],
      ["tactician", "TacticianHardcore"],
      ["honour", "HonorHardcore"],
    ].filter(([, field]) => attributeValue(item, field, false) === true).map(([difficulty]) => difficulty),
  }))
  .filter(({ itemName }) => itemName);

const onUseAttributes = (object) => (object?.OnUsePeaceActions ?? [])
  .flatMap((group) => group?.Action ?? [])
  .flatMap((action) => action?.Attributes ?? []);

const hasAuthoredSecretDoor = (object) => onUseAttributes(object)
  .some((attributes) => attributeValue(attributes, "SecretDoor", false) === true);

const parseRecipeIds = (object) => onUseAttributes(object)
  .map((attributes) => attributeValue(attributes, "RecipeID", ""))
  .filter(Boolean);

const mergeUnique = (left = [], right = [], keyFor = (value) => JSON.stringify(value)) => {
  const merged = new Map();
  for (const value of [...left, ...right]) merged.set(keyFor(value), value);
  return [...merged.values()];
};

const mergeMultiset = (left = [], right = [], keyFor = (value) => JSON.stringify(value)) => {
  const grouped = (values) => values.reduce((groups, value) => {
    const key = keyFor(value);
    const entries = groups.get(key) ?? [];
    entries.push(value);
    groups.set(key, entries);
    return groups;
  }, new Map());
  const leftGroups = grouped(left);
  const rightGroups = grouped(right);
  return [...new Set([...leftGroups.keys(), ...rightGroups.keys()])].flatMap((key) => {
    const leftValues = leftGroups.get(key) ?? [];
    const rightValues = rightGroups.get(key) ?? [];
    const preferred = rightValues.length > 0 ? rightValues : leftValues;
    const count = Math.max(leftValues.length, rightValues.length);
    return Array.from({ length: count }, (_, index) => preferred[index] ?? preferred.at(-1));
  });
};

const mergePlacementRecord = (existing, record, rawObject) => ({
  ...existing,
  ...record,
  // An object authored in a level stays level-bound even when a global copy exists.
  globalPlacement: Boolean(existing.globalPlacement && record.globalPlacement),
  internalName: record.internalName || existing.internalName,
  displayNameHandle: record.displayNameHandle || existing.displayNameHandle,
  displayName: {
    en: record.displayName.en || existing.displayName.en,
    tr: record.displayName.tr || existing.displayName.tr,
  },
  descriptionHandle: record.descriptionHandle || existing.descriptionHandle,
  description: {
    en: record.description.en || existing.description.en,
    tr: record.description.tr || existing.description.tr,
  },
  stats: Object.hasOwn(rawObject, "Stats") ? record.stats : record.stats || existing.stats,
  equipmentId: Object.hasOwn(rawObject, "Equipment") && !Array.isArray(rawObject.Equipment)
    ? record.equipmentId : existing.equipmentId ?? record.equipmentId,
  equipmentLootable: Object.hasOwn(rawObject, "IsEquipmentLootable")
    ? record.equipmentLootable : existing.equipmentLootable ?? record.equipmentLootable,
  templateId: record.templateId || existing.templateId,
  icon: record.icon || existing.icon,
  defaultDialogId: Object.hasOwn(rawObject, "DefaultDialog") ? record.defaultDialogId : existing.defaultDialogId,
  ownerId: Object.hasOwn(rawObject, "owner") ? record.ownerId : existing.ownerId,
  accessKeyId: Object.hasOwn(rawObject, "Key") ? record.accessKeyId : existing.accessKeyId,
  lockDifficultyClassId: Object.hasOwn(rawObject, "LockDifficultyClassID")
    ? record.lockDifficultyClassId
    : existing.lockDifficultyClassId,
  disarmDifficultyClassId: Object.hasOwn(rawObject, "DisarmDifficultyClassID")
    ? record.disarmDifficultyClassId
    : existing.disarmDifficultyClassId,
  defaultState: Object.hasOwn(rawObject, "DefaultState") ? record.defaultState : existing.defaultState,
  faction: Object.hasOwn(rawObject, "Faction") ? record.faction : existing.faction,
  combatGroupId: Object.hasOwn(rawObject, "CombatGroupID") ? record.combatGroupId : existing.combatGroupId,
  ...(existing.characterCapabilities || record.characterCapabilities ? {
    characterCapabilities: { ...existing.characterCapabilities, ...record.characterCapabilities },
  } : {}),
  archetype: Object.hasOwn(rawObject, "Archetype") ? record.archetype : existing.archetype,
  position: record.positionSuppressed ? null : record.position ?? existing.position,
  positionSuppressed: record.positionSuppressed ?? (record.position ? undefined : existing.positionSuppressed),
  flags: {
    isBoss: Object.hasOwn(rawObject, "IsBoss") ? record.flags.isBoss : existing.flags.isBoss,
    storyItem: Object.hasOwn(rawObject, "StoryItem") ? record.flags.storyItem : existing.flags.storyItem,
    isLootable: Object.hasOwn(rawObject, "IsLootable") ? record.flags.isLootable : existing.flags.isLootable,
    isGlobal: Object.hasOwn(rawObject, "IsGlobal") ? record.flags.isGlobal : existing.flags.isGlobal,
    isTrap: Object.hasOwn(rawObject, "IsTrap") ? record.flags.isTrap : existing.flags.isTrap,
    secretDoor: hasAuthoredSecretDoor(rawObject) ? true : existing.flags.secretDoor,
  },
  hasTradeTreasure: existing.hasTradeTreasure || record.hasTradeTreasure,
  tradeTreasures: mergeUnique(existing.tradeTreasures, record.tradeTreasures, String),
  treasureTables: mergeUnique(existing.treasureTables, record.treasureTables, String),
  inventoryItems: mergeMultiset(
    existing.inventoryItems,
    record.inventoryItems,
    (item) => JSON.stringify([item.objectId, item.itemName, item.templateId, item.amount, item.difficulties,
      item.droppedOnDeath, item.canBePickpocketed, item.tradeable, item.inventoryCondition]),
  ),
  inventoryTables: mergeUnique(existing.inventoryTables, record.inventoryTables, String),
  recipeIds: mergeUnique(existing.recipeIds, record.recipeIds, String),
  teleportActions: record.teleportActions ?? existing.teleportActions,
  provenance: mergeUnique(existing.provenance, record.provenance, ({ sourcePath }) => sourcePath),
});

const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";
const isUsableDifficultyId = (value) => Boolean(value) && value !== EMPTY_GUID;
const unusableKeyIds = new Set(["nokey", "none", "storylock"]);
const isUsableKeyId = (value) => {
  if (!value) return false;
  const normalized = String(value).toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
  return Boolean(normalized) && !unusableKeyIds.has(normalized) && normalized !== EMPTY_GUID.replaceAll("-", "");
};

const inferAccessRole = (record) => {
  if (!isUsableKeyId(record.accessKeyId)) return null;
  const identity = [record.internalName, record.displayName?.en, record.displayName?.tr]
    .filter(Boolean)
    .join(" ");
  if (/key/i.test(identity) && !/keyhole|keyholed/i.test(identity)) return "key";
  if (record.lockDifficultyClassId && record.defaultState?.toLocaleLowerCase("en-US") !== "open") return "lock";
  return "lock";
};

const inferTrapType = (record) => {
  const searchable = `${record.internalName} ${record.stats}`;
  if (/trip.?wire/i.test(searchable)) return "tripwire";
  if (/pressure.?plate/i.test(searchable)) return "pressure-plate";
  if (/(?:proximity|mine|explosive)/i.test(searchable)) return "proximity-mine";
  if (/(?:vent|spore|gas)/i.test(searchable)) return "vent";
  if (/(?:chest|container|stash|crate)/i.test(searchable)) return "trapped-container";
  if (/(?:rune|glyph)/i.test(searchable)) return "rune";
  return "trap";
};

/** Bodies placed for looting or Speak with Dead, named as such by the game. */
const CORPSE_NAME_PATTERN = /^(?:Dead|Executed|Mangled|Incinerated|Petrified|Burnt|Charred|Drowned|Fresh|Rotting|Skeletal|Slain|Murdered|Decaying|Impaled|Crushed)\b|\b(?:Corpse|Body|Bodies|Remains|Cadaver|Carcass)\b/i;
const CORPSE_INTERNAL_NAME_PATTERN = /(?:^|[_\W])(?:dead|corpse|body|bodies|remains|cadaver|carcass)(?:$|[_\W])/i;

/** Object stat families that describe the world rather than carryable loot. */
const PASSAGE_FAMILY_PATTERN = /door|gate|skiff|boat|hatch|ladder/i;
const WORLD_OBJECT_FAMILY_PATTERN = /^_?(?:destructible|indestructible|furniture)|^obj_(?:generic|indestructible|destructible|painting|vase|bone|shell)/i;
const NON_GAMEPLAY_MARKER_PATTERN = /debug|fade.?trigger|reminder|timeline|scene|camera|culling|physics|surface|proximity|teleporter.?target|plaque|one.?shot|on.?enter|inside.?trigger|dialog.?start.?trigger|leave.?trigger|(?:effect|sound|vfx).?helper|beam.?source|tressym.?point|audience.?tentacle|summon.?stone|wander.?entrance|controller|kill.?trigger|banter.?trigger|return.?position|ambush.?pos|dynamic|portal.?mirror.?insert|no.?entry|room.?trigger|ai.?hint|(?:^|_)(?:helper|vfx|vb|amb|backup\d*|cancel|past|tense|upset)(?:$|_)/i;
const GENERIC_READABLE_TITLE_PATTERN = /^(?:Book|Old Book|Dusty Book|Worn Book|Clasped Book|Leather-Bound Book|Gilded Book|Leather-Bound Tome|Stained Book|Scroll|Parchment|Letter|Open Book|Closed Book|Tome)$/i;
const READABLE_DECOR_STAT_IDS = new Set(["OBJ_Bookrow"]);

/** Named readable objects use a shared marker, but a focused filter facet.
 * Generic props only qualify when story data proves that the object matters. */
const inferReadableFilterCategory = (record, itemCategory, allowGeneric = false) => {
  if (record.placementKind !== "items" || itemCategory !== "books" || !record.displayName.en) return null;
  if (READABLE_DECOR_STAT_IDS.has(record.stats) || record.stats === "PUZ_Key") return null;
  if (/^(?:Rows? of Books|Stacks? of Books|Pile of Books|Stacks of Scrolls)$/i.test(record.displayName.en)) return null;
  if (!allowGeneric && GENERIC_READABLE_TITLE_PATTERN.test(record.displayName.en)) return null;

  const searchable = [record.displayName.en, record.internalName, record.stats]
    .filter(Boolean)
    .join(" ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ");
  if (/cookbook|\brecipes?\b|culinary|cooking|\bsoups?\b/i.test(searchable)) return "item-recipes";
  if (/\bmap\b|blueprint|diagram|schematic|floor plan|battle plan|invasion plan|route/i.test(searchable)) return "item-maps-plans";
  if (/spellbook|grimoire|codex|necroman|arcane|sorcer|wizard|ritual|magic tome/i.test(searchable)) return "item-arcane-books";
  if (/journal|diary|memoir|logbook|personal log|chronicle|ledger|record|report|register|account|inventory|manifest|\blist\b|schedule|minutes|transcript|deed|contract|\bwrit\b|receipt/i.test(searchable)) return "item-journals-records";
  if (/poster|flyer|notice|gazette|newspaper|broadsheet|advert|pamphlet|announcement|proclamation/i.test(searchable)) return "item-publications";
  if (/letter|\bnote\b|notes|message|correspond|missive|parchment|scribble|scrawl|orders|instructions|request|plea|warning|confession|invitation/i.test(searchable)) return "item-letters-notes";
  return "item-books-lore";
};

const isDisplayablePainting = (record) => record.placementKind === "items"
  && Boolean(record.displayName.en)
  && /painting|portrait/i.test(`${record.stats} ${record.internalName}`)
  && !/^(?:Blank Canvas|Display Name|Painting|Portrait|Landscape)$/i.test(record.displayName.en);

const inferCandidateKind = (record) => {
  const authoredIdentity = [record.internalName, record.stats, record.type]
    .filter(Boolean)
    .join(" ")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
  const searchable = [
    record.internalName,
    record.stats,
    record.type,
    record.displayName.en,
    isUsableKeyId(record.accessKeyId) ? record.accessKeyId : "",
    ...(record.tradeTreasures ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
  if (record.placementKind === "characters") {
    if (record.storyDestination?.arrivalState === "corpse") return "corpse";
    if (record.flags.isBoss) return "boss";
    const corpseNamed = CORPSE_NAME_PATTERN.test(record.displayName.en)
      || CORPSE_INTERNAL_NAME_PATTERN.test(record.internalName.replace(/([a-z])([A-Z])/g, "$1 $2"));
    const explicitlyDead = String(record.defaultState) === "11";
    if (corpseNamed && (explicitlyDead || !record.combatGroupId)) return "corpse";
    if (/(?:^|[_\W])(trader|vendor|merchant|quartermaster|bartender|shopkeeper|innkeeper|smith|alchemist|apothecary)(?:$|[_\W])/i.test(searchable)) return "vendor";
    return isHostileCharacter(record) ? "enemy" : "npc";
  }
  if (record.placementKind === "triggers") {
    // Global triggers are story positions and activation areas (waypoint
    // activation volumes, teleport targets, debug helpers), not authored map
    // features; the level-bound triggers already describe the real transitions.
    if (record.globalPlacement) return null;
    if (NON_GAMEPLAY_MARKER_PATTERN.test(record.internalName)) return null;
    if (/map.?marker|point.?of.?interest|(?:^|_)poi(?:_|$)/i.test(authoredIdentity)) return "point-of-interest";
    if (/(?:^|[_\W])(ladder|climb)(?:$|[_\W])/i.test(authoredIdentity)) return "vertical-connection";
    if (/(?:^|[_\W])(portal|teleport(?:er)?|transition)(?:$|[_\W])/i.test(authoredIdentity)) return "transition";
    return null;
  }
  if (record.placementKind === "items") {
    if (record.flags.isTrap || isUsableDifficultyId(record.disarmDifficultyClassId)) return "trap";
    if ((record.inventoryItems?.length ?? 0) > 0 || (record.inventoryTables?.length ?? 0) > 0) {
      return isChestRecord(record) ? "chest" : "loot-container";
    }
    // A source-authored chest is still a map feature when no inventory was
    // extracted. Its presence must not depend on proving a particular reward.
    if (isChestRecord(record)) return "chest";
    const accessRole = inferAccessRole(record);
    if (accessRole === "key") return "key-item";
    if (/(?:^|_)trap(?:_|$)/i.test(record.internalName)) return "trap";
    if (record.gameplay && ["Weapon", "Armor"].includes(record.gameplay.type) && (
      record.gameplay.unique
      || (record.gameplay.rarity && record.gameplay.rarity.toLocaleLowerCase("en-US") !== "common")
    )) return "valuable-item";
    if (/(?:^|[_\W])(ladder|climb)(?:$|[_\W])/i.test(authoredIdentity)) return "vertical-connection";
    if (/(?:^|[_\W])(portal|teleport(?:er)?|transition|from.?arena|from.?interior|from.?exterior)(?:$|[_\W])/i.test(authoredIdentity)) return "transition";
    if (record.lockDifficultyClassId) {
      return /(?:^|[_\W])(door|gate|hatch|entrance|exit|portal|elevator)(?:$|[_\W])/i.test(authoredIdentity)
        ? "interactable"
        : "valuable-item";
    }
    if (accessRole === "lock") {
      if (isChestRecord(record)) return "chest";
      return /(?:^|[_\W])(chest|container|safe|box|lockbox)(?:$|[_\W])/i.test(searchable)
        ? "loot-container"
        : PASSAGE_FAMILY_PATTERN.test(authoredIdentity) ? "interactable" : "valuable-item";
    }
    if (/(?:^|[_\W])keys?(?:$|[_\W])/i.test(searchable)) return "key-item";
    if (record.gameplay && (
      (record.gameplay.rarity && record.gameplay.rarity.toLocaleLowerCase("en-US") !== "common")
      || record.gameplay.unique
    )) return "valuable-item";
    if (record.flags.storyItem || /(?:^|[_\W])(quest|story|key|puzzle|reward|unique|legendary|veryrare|rare)(?:$|[_\W])/i.test(searchable)) return "valuable-item";
  }
  return null;
};

const isUsefulCandidate = (record) => {
  if (record.candidateKind === "boss" && !record.displayName.en) {
    return !/(?:^|[_\W])(debug|test|dummy|placeholder|wave|siege|w\d+)(?:$|[_\W])/i.test(record.internalName);
  }
  if (record.candidateKind === "waypoint") {
    return Boolean(record.displayName.en) || !/camera.?blocker|safe.?bubble|debug/i.test(record.internalName);
  }
  if (record.candidateKind === "vertical-connection") {
    return Boolean(record.navigationPortal || record.navigationDestination)
      || !NON_GAMEPLAY_MARKER_PATTERN.test(record.internalName);
  }
  if (record.candidateKind !== "transition") return true;
  if (NON_GAMEPLAY_MARKER_PATTERN.test(record.internalName)) {
    return Boolean(record.navigationPortal || record.navigationDestination);
  }
  if (record.displayName.en) return true;
  if (/^(?:ATM|AMB|CAMP)_/i.test(record.internalName)) return false;
  if (record.placementKind === "items") return true;
  return /(?:^|_)(entrance|exit|portal|transition|teleport|ladder|hatch|door|elevator|from.?arena|from.?interior|from.?exterior)(?:$|_)/i
    .test(record.internalName);
};

const projectCoordinate = (position, reference) => {
  if (!reference) return null;
  const normalizedX = (position.x - reference.worldBounds.x) / reference.worldBounds.width;
  const normalizedY = (position.z - reference.worldBounds.y) / reference.worldBounds.height;
  const rasterY = reference.flipY ? 1 - normalizedY : normalizedY;
  return {
    x: reference.imageBounds.x + normalizedX * reference.imageBounds.width,
    y: reference.imageBounds.y + rasterY * reference.imageBounds.height,
  };
};

const isWithinReference = (position, reference) => !reference || (
  position.x >= reference.worldBounds.x
  && position.x <= reference.worldBounds.x + reference.worldBounds.width
  && position.z >= reference.worldBounds.y
  && position.z <= reference.worldBounds.y + reference.worldBounds.height
);

const roundCoordinate = (value) => Math.round(value * 1000) / 1000;
const worldDistance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);

const humanizeInternalName = (value) => value
  .replace(/_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "")
  .replace(/^(?:S_|TOOL_|BLD_|DOOR_|POI_)+/i, "")
  .replace(/^(?:[A-Z]{3})(?:_[A-Z]{2,})?_/i, "")
  .replace(/^(?:FL|F)\d+_?/i, "")
  .replace(/_(?:\d+|[A-F0-9]{8,})$/i, "")
  .replaceAll("_", " ")
  .replace(/([a-z])([A-Z])/g, "$1 $2")
  .replace(/^(?:(?:S|TOOL|BLD|POI|TELEPORT(?: DOOR)?|DOOR)\s+)+/i, "")
  .replace(/\b(?:GP\d*Hack|Teleport(?: Trigger)?|TimelineSceneTrigger|MovedFromWLD Main|VB)\b/gi, "")
  // Model dimensions and editor-only visibility labels are useful to the game,
  // but they make poor user-facing passage names.
  .replace(/\b\d+(?:n\d+)?H\s+A\b/gi, "")
  .replace(/\bInvisible\b/gi, "")
  .replace(/\bP(\d+)\b/gi, "Floor $1")
  .replace(/^\s*A\s+(?=\S+\s+\S+)/i, "")
  .replace(/^(Door)\s+A\s+(?=\S+\s+\S+)/i, "$1 ")
  .replace(/\b(?:Destruct|Moss|Grass)\b$/i, "")
  .replace(/\bTrigger\b$/i, "")
  .replace(/\s+/g, " ")
  .trim();

const humanizeLootContainerName = (value) => {
  const title = humanizeInternalName(value);
  if (/^LOOT\s+GEN\s+Backpack\b/i.test(title)) return "Backpack";
  if (/^LOOT\s+CHA\s+OUTSIDE\s+Skeleton\b/i.test(title)) return "Skeleton";
  return title;
};

// Ambush roster entries frequently use numbered editor identities such as
// S_SHA_Merregon_001. The general marker-title humanizer intentionally removes
// those suffixes and can collapse the result to just "001", so preserve the
// authored creature identity for roster-only labels.
const humanizeAmbusherName = (value) => value
  .replace(/_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "")
  .replace(/^(?:S_|CHARACTER_)+/i, "")
  .replace(/^[A-Z]{3}_/i, "")
  .replace(/_\d+$/i, "")
  .replaceAll("_", " ")
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replace(/\bInt Dev\b/gi, "Intellect Devourer")
  .replace(/\bInt Detonator\b/gi, "Intellect Detonator")
  .replace(/\bPlayer Mirror Character\b/gi, "Party Mirror")
  .replace(/\bAmbusher\b/gi, "")
  .replace(/\bWave\s*(\d+)\b/gi, "Wave $1")
  .replace(/\s+/g, " ")
  .trim();

const humanizeItemRequirementName = (value) => value
  .replace(/_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "")
  .replace(/^\([A-Z]+\)/, "")
  .replaceAll("_", " ")
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replace(/^(?:(?:ALCH|CONS?|LOOT|QUEST|UNI|OBJ|TOOL|GRN|DOS2|MAG|S|PLACEHOLDER)\s+)+/i, "")
  .replace(/\s+[A-Z]$/i, "")
  .replace(/\s+/g, " ")
  .trim();

const humanizeRecipeId = (value) => value
  .replace(/^ALCH_/, "")
  .replaceAll("_", " ")
  .replace(/([a-z])([A-Z])/g, "$1 $2")
  .replace(/\s+/g, " ")
  .trim();

const humanizeStoryFlag = (value) => {
  const withoutGuid = value.replace(/_[0-9a-f]{8}-[0-9a-f-]{27,}$/i, "");
  const semanticSuffix = withoutGuid.match(/_(?:Knows|Knowledge|Learned|Learnt|Read|Found|Has|Give|Transfer|Took|Got)_([A-Za-z0-9_]+)$/i)?.[1];
  return humanizeInternalName(semanticSuffix || withoutGuid)
    .replace(/^(?:(?:Event|State|Quest|Item|Knows|Knowledge|Learned|Learnt|Read|Found|Has|Give|Giving|Transfer|Took|Got)\s+)+/i, "")
    .replace(/\s+(?:Has|Give|Transfer)$/i, "")
    .trim();
};

const readCandidateKindOverrides = (value) => {
  if (!value) return new Map();
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`--candidate-kind-overrides must be valid JSON: ${error.message}`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("--candidate-kind-overrides must be an object keyed by placement UUID.");
  }
  const overrides = new Map();
  for (const [id, kind] of Object.entries(parsed)) {
    if (!Object.hasOwn(labelByCandidateKind, kind)) {
      throw new Error(`Unsupported candidate kind override for ${id}: ${kind}.`);
    }
    overrides.set(id.toLocaleLowerCase("en-US"), kind);
  }
  return overrides;
};

const readCandidateTitleOverrides = (value) => {
  if (!value) return new Map();
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`--candidate-title-overrides must be valid JSON: ${error.message}`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("--candidate-title-overrides must be an object keyed by placement UUID.");
  }
  const overrides = new Map();
  for (const [id, titles] of Object.entries(parsed)) {
    if (!titles || Array.isArray(titles) || typeof titles !== "object" || typeof titles.en !== "string" || !titles.en.trim()) {
      throw new Error(`Candidate title override for ${id} needs a non-empty English title.`);
    }
    if (titles.tr !== undefined && typeof titles.tr !== "string") {
      throw new Error(`Candidate title override for ${id} has an invalid Turkish title.`);
    }
    overrides.set(id.toLocaleLowerCase("en-US"), {
      en: titles.en.trim(),
      tr: typeof titles.tr === "string" ? titles.tr.trim() : "",
    });
  }
  return overrides;
};

const readObjectIdSet = (value, argumentName) => {
  if (!value) return new Set();
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`--${argumentName} must be valid JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== "string" || !id.trim())) {
    throw new Error(`--${argumentName} must be an array of non-empty placement UUIDs.`);
  }
  return new Set(parsed.map((id) => id.toLocaleLowerCase("en-US")));
};

const readPositionOverrides = (value) => {
  if (!value) return new Map();
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`--candidate-position-overrides must be valid JSON: ${error.message}`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("--candidate-position-overrides must be an object keyed by placement UUID.");
  }
  const overrides = new Map();
  for (const [id, position] of Object.entries(parsed)) {
    if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) {
      throw new Error(`Candidate position override for ${id} needs finite x, y and z coordinates.`);
    }
    overrides.set(id.toLocaleLowerCase("en-US"), position);
  }
  return overrides;
};

const main = async () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const placementsRoot = path.resolve(arguments_.get("placements"));
  const supplementaryPlacementRoots = arguments_.has("supplementary-placements")
    ? JSON.parse(arguments_.get("supplementary-placements")).map((root) => path.resolve(root))
    : [];
  const outputPath = path.resolve(arguments_.get("output"));
  const omitRecords = arguments_.get("omit-records") === "true";
  if (omitRecords) {
    const relative = path.relative(path.resolve(import.meta.dirname, "../map-sources/audits"), outputPath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Omitting raw records is allowed only for an isolated audit-stage catalog");
    }
  }
  const publicOutputPath = arguments_.has("public-output")
    ? path.resolve(arguments_.get("public-output"))
    : null;
  const locationsOutputPath = arguments_.has("locations-output")
    ? path.resolve(arguments_.get("locations-output"))
    : null;
  const contentOutputPath = arguments_.has("content-output")
    ? path.resolve(arguments_.get("content-output"))
    : null;
  const rejectionsOutputPath = arguments_.has("rejections-output")
    ? path.resolve(arguments_.get("rejections-output"))
    : null;
  const mapMetadata = arguments_.has("map-metadata")
    ? readJson(path.resolve(arguments_.get("map-metadata")))
    : null;
  const coordinateReference = mapMetadata?.coordinateReference ?? null;
  const selectedLevels = new Set((arguments_.get("levels") ?? "")
    .split(",")
    .map((level) => level.trim())
    .filter(Boolean));
  const levelPattern = arguments_.has("level-pattern")
    ? new RegExp(arguments_.get("level-pattern"), "i")
    : null;
  const matchesConfiguredLevel = (level) => selectedLevels.size === 0 && !levelPattern
    ? true
    : selectedLevels.has(level) || levelPattern?.test(level);
  const includeNamePattern = arguments_.has("include-name-pattern")
    ? new RegExp(arguments_.get("include-name-pattern"), "i")
    : null;
  const excludeNamePattern = arguments_.has("exclude-name-pattern")
    ? new RegExp(arguments_.get("exclude-name-pattern"), "i")
    : null;
  const candidateKindOverrides = readCandidateKindOverrides(arguments_.get("candidate-kind-overrides"));
  const candidateTitleOverrides = readCandidateTitleOverrides(arguments_.get("candidate-title-overrides"));
  const candidatePositionOverrides = readPositionOverrides(arguments_.get("candidate-position-overrides"));
  const forcedObjectIds = readObjectIdSet(arguments_.get("forced-object-ids"), "forced-object-ids");
  const excludedObjectIds = readObjectIdSet(arguments_.get("excluded-object-ids"), "excluded-object-ids");
  const minimumHeight = readOptionalNumber(arguments_, "min-height");
  const maximumHeight = readOptionalNumber(arguments_, "max-height");
  const floorSelection = arguments_.has("floor-volume-selection") ? JSON.parse(arguments_.get("floor-volume-selection")) : null;
  const matchesFloor = createFloorSelector(floorSelection, arguments_.has("floor-volume-catalog")
    ? readJson(path.resolve(arguments_.get("floor-volume-catalog"))) : null);
  if (minimumHeight !== null && maximumHeight !== null && minimumHeight > maximumHeight) {
    throw new Error("--min-height cannot be greater than --max-height.");
  }
  const localization = {
    en: readLocalization(path.resolve(arguments_.get("localization-en"))),
    tr: arguments_.has("localization-tr")
      ? readLocalization(path.resolve(arguments_.get("localization-tr")))
      : new Map(),
  };
  const gameplayCatalog = arguments_.has("stats-catalog")
    ? readJson(path.resolve(arguments_.get("stats-catalog")))
    : null;
  const rootTemplateCatalog = arguments_.has("root-template-catalog")
    ? readJson(path.resolve(arguments_.get("root-template-catalog")))
    : null;
  const localizedGameplayTitle = createStockTitleResolver(gameplayCatalog, rootTemplateCatalog);
  const sceneVendorFor = createSceneVendorResolver(arguments_.has("scene-vendor-catalog")
    ? readJson(path.resolve(arguments_.get("scene-vendor-catalog"))) : null);
  const sceneContentFor = createSceneContentResolver(arguments_.has("scene-content-catalog")
    ? readVerifiedSceneContentCatalog(path.resolve(arguments_.get("scene-content-catalog")), path.resolve(import.meta.dirname, "..")) : null);
  const localizedTreasureStock = (profile, language = "en") => [...new Set(
    (profile?.namedStockIds ?? []).map((id) => localizedGameplayTitle(id, language)).filter(Boolean),
  )].sort((left, right) => left.localeCompare(right, language));
  const treasureCatalog = arguments_.has("treasure-catalog")
    ? readJson(path.resolve(arguments_.get("treasure-catalog")))
    : null;
  const mapTreasurePool = (tableId) => {
    const profile = treasureCatalog?.tables?.[tableId];
    return {
      tableId,
      stockCategories: profile?.stockCategories ?? [],
      namedStock: localizedTreasureStock(profile),
      possibleLoot: (profile?.possibleLoot ?? []).map((outcome) => ({
        id: outcome.id,
        kind: outcome.kind,
        title: outcome.kind === "item"
          ? localizedGameplayTitle(outcome.id) || outcome.title
          : outcome.title,
        initialChance: outcome.initialChance,
        ...(outcome.kind === "item" ? { statsId: outcome.id.replace(/^I_/, "") } : {}),
      })),
    };
  };
  const dialogCatalog = arguments_.has("dialog-catalog")
    ? readJson(path.resolve(arguments_.get("dialog-catalog")))
    : null;
  const dialogItemRequirementCatalog = arguments_.has("dialog-item-requirement-catalog")
    ? readJson(path.resolve(arguments_.get("dialog-item-requirement-catalog")))
    : null;
  const corpseDialogCatalog = arguments_.has("corpse-dialog-catalog")
    ? readJson(path.resolve(arguments_.get("corpse-dialog-catalog")))
    : null;
  const questCatalog = arguments_.has("quest-catalog")
    ? readJson(path.resolve(arguments_.get("quest-catalog")))
    : null;
  const worldCheckCatalog = arguments_.has("world-check-catalog")
    ? readJson(path.resolve(arguments_.get("world-check-catalog")))
    : null;
  const storyRiskCatalog = arguments_.has("story-risk-catalog")
    ? readJson(path.resolve(arguments_.get("story-risk-catalog")))
    : null;
  const permanentBonusCatalog = arguments_.has("permanent-bonus-catalog")
    ? readJson(path.resolve(arguments_.get("permanent-bonus-catalog")))
    : null;
  const rescuePlanCatalog = arguments_.has("rescue-plan-catalog")
    ? readJson(path.resolve(arguments_.get("rescue-plan-catalog")))
    : null;
  const itemDatabase = arguments_.has("item-database")
    ? readJson(path.resolve(arguments_.get("item-database")))
    : null;
  const itemIndex = { byTemplateId: new Map(), byStatsId: new Map(), byName: new Map() };
  const addItemToIndex = (index, key, item) => {
    if (typeof key !== "string" || !key.trim()) return;
    const normalized = key.trim().toLocaleLowerCase("en-US");
    const matches = index.get(normalized) ?? [];
    if (!matches.some((candidate) => candidate.id === item.id)) matches.push(item);
    index.set(normalized, matches);
  };
  for (const item of itemDatabase?.items ?? []) {
    addItemToIndex(itemIndex.byTemplateId, item.id, item);
    for (const templateId of item.templateIds ?? []) addItemToIndex(itemIndex.byTemplateId, templateId, item);
    addItemToIndex(itemIndex.byStatsId, item.statsId, item);
    addItemToIndex(itemIndex.byName, item.name, item);
    for (const localizedName of Object.values(item.localizedNames ?? {})) addItemToIndex(itemIndex.byName, localizedName, item);
  }
  const currentMapId = locationsOutputPath ? path.basename(path.dirname(locationsOutputPath)) : null;
  const uniqueEquipmentClassesByAcquisitionLocationId = new Map();
  const uniqueEquipmentSearchTermsByAcquisitionLocationId = new Map();
  for (const item of itemDatabase?.items ?? []) {
    const equipmentClass = findUniqueEquipmentClass({
      type: item.type,
      rarity: item.rarity,
      ...item.gameplay,
    });
    if (!equipmentClass) continue;
    for (const acquisition of item.acquisitions ?? []) {
      if (!acquisition.locationId || acquisition.mapId !== currentMapId) continue;
      const classes = uniqueEquipmentClassesByAcquisitionLocationId.get(acquisition.locationId) ?? new Set();
      classes.add(equipmentClass);
      uniqueEquipmentClassesByAcquisitionLocationId.set(acquisition.locationId, classes);
      const searchTerms = uniqueEquipmentSearchTermsByAcquisitionLocationId.get(acquisition.locationId) ?? new Set();
      for (const term of [item.name, ...Object.values(item.localizedNames ?? {}), item.statsId, item.rarity]) {
        if (term) searchTerms.add(term);
      }
      uniqueEquipmentSearchTermsByAcquisitionLocationId.set(acquisition.locationId, searchTerms);
    }
  }
  /** Mirrors resolveItemDatabaseEntry: constrain a known root by its Stats,
   * then use Stats or exact-name lookups only when the root is unknown. */
  const findItemDatabaseEntry = (record) => {
    const names = [
      record.displayName?.en,
      record.displayName?.tr,
      record.title,
      ...(record.names ?? []),
    ].filter(Boolean).map((name) => name.toLocaleLowerCase("en-US"));
    const choose = (candidates) => {
      if (candidates.length <= 1) return candidates[0];
      const exact = candidates.filter((item) => names.includes(item.name.toLocaleLowerCase("en-US"))
        || Object.values(item.localizedNames ?? {}).some((name) => names.includes(name.toLocaleLowerCase("en-US"))));
      const documented = exact.filter((item) => item.acquisitions.length > 0);
      if (documented.length === 1) return documented[0];
      return exact[0] ?? candidates.find((item) => item.unique) ?? candidates[0];
    };
    const statsId = record.stats ?? record.statsId;
    const templateMatches = record.templateId
      ? itemIndex.byTemplateId.get(record.templateId.toLocaleLowerCase("en-US")) ?? [] : [];
    if (templateMatches.length) return choose(templateMatches.filter((item) => statsId
      ? item.statsId.toLocaleLowerCase("en-US") === statsId.toLocaleLowerCase("en-US") : !item.generation)) ?? null;
    const lookups = [
      statsId ? itemIndex.byStatsId.get(statsId.toLocaleLowerCase("en-US")) : null,
      ...names.map((name) => itemIndex.byName.get(name)),
    ];
    for (const candidates of lookups) {
      if (candidates?.length) return choose(candidates) ?? null;
    }
    return null;
  };
  const findItemCategory = (record) => findItemDatabaseEntry(record)?.category ?? null;
  const partyMemberCatalog = arguments_.has("party-member-catalog")
    ? readJson(path.resolve(arguments_.get("party-member-catalog")))
    : null;
  const partyMembersByCharacterId = new Map((partyMemberCatalog?.members ?? [])
    .map((member) => [member.characterId.toLocaleLowerCase("en-US"), member]));
  const waypointCatalog = arguments_.has("waypoint-catalog")
    ? readJson(path.resolve(arguments_.get("waypoint-catalog")))
    : null;
  const navigationPortalCatalog = arguments_.has("navigation-portal-catalog")
    ? readJson(path.resolve(arguments_.get("navigation-portal-catalog")))
    : null;
  const inspirationCatalog = arguments_.has("inspiration-catalog")
    ? readJson(path.resolve(arguments_.get("inspiration-catalog")))
    : null;
  const puzzleCombinationCatalog = arguments_.has("puzzle-combination-catalog")
    ? readJson(path.resolve(arguments_.get("puzzle-combination-catalog")))
    : null;
  const readableImpactCatalog = arguments_.has("readable-impact-catalog")
    ? readJson(path.resolve(arguments_.get("readable-impact-catalog")))
    : null;
  const itemStoryImpactCatalog = arguments_.has("item-story-impact-catalog")
    ? readJson(path.resolve(arguments_.get("item-story-impact-catalog")))
    : null;
  const storyLocationRelationCatalog = arguments_.has("story-location-relation-catalog")
    ? readJson(path.resolve(arguments_.get("story-location-relation-catalog")))
    : null;
  const diggableSecretCatalog = arguments_.has("diggable-secret-catalog")
    ? readJson(path.resolve(arguments_.get("diggable-secret-catalog")))
    : null;
  const mechanismLinkCatalog = arguments_.has("mechanism-link-catalog")
    ? readJson(path.resolve(arguments_.get("mechanism-link-catalog")))
    : null;
  const levelTransformCatalog = arguments_.has("level-transform-catalog")
    ? readJson(path.resolve(arguments_.get("level-transform-catalog")))
    : null;
  const resolveLevelTransform = createLevelTransformResolver(levelTransformCatalog);
  const worldMapCatalog = arguments_.has("world-map-catalog")
    ? readJson(path.resolve(arguments_.get("world-map-catalog"))) : null;
  const navigationPortals = normalizeNavigationPortals(navigationPortalCatalog?.portals ?? [],
    createPortalEndpointNormalizer(worldMapCatalog, levelTransformCatalog));
  const findNavigationPortal = createNavigationPortalResolver(navigationPortals, levelTransformCatalog);
  const reciprocalNavigationPortalIds = new Set();
  for (let leftIndex = 0; leftIndex < navigationPortals.length; leftIndex += 1) {
    const left = navigationPortals[leftIndex];
    for (const right of navigationPortals.slice(leftIndex + 1)) {
      if (!areReciprocalPortals(left, right)) continue;
      reciprocalNavigationPortalIds.add(left.instanceId);
      reciprocalNavigationPortalIds.add(right.instanceId);
    }
  }
  const templateTransformsByChild = Map.groupBy(levelTransformCatalog?.templateTransforms ?? [],
    (transform) => `${transform.childModule}/${transform.childLevel}`);
  const summarizeLevelTransform = (transform) => ({
    id: transform.id,
    offset: transform.offset,
    rotationQuarterTurns: transform.rotationQuarterTurns ?? 0,
    matchCount: transform.matchCount,
    maxDeviation: transform.maxDeviation,
  });
  const resolveTemplateProjection = (module, level, position) => {
    if (!position || (matchesConfiguredLevel(level) && resolveLevelTransform(module, level, position))) return null;
    const queue = [{ module, level, position, chain: [] }];
    const matches = [];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current.chain.length >= 8) continue;
      const transformsForLevel = templateTransformsByChild.get(`${current.module}/${current.level}`) ?? [];
      for (const transform of transformsForLevel) {
        if (current.chain.some(({ id }) => id === transform.id)) continue;
        const parentPosition = applyTemplateTransform(current.position, transform);
        const chain = [...current.chain, transform];
        if (matchesConfiguredLevel(transform.parentLevel)) {
          const mapTransform = resolveLevelTransform(transform.parentModule, transform.parentLevel, parentPosition);
          const worldPosition = applyLevelTransform(parentPosition, mapTransform);
          if (isWithinReference(worldPosition, coordinateReference)) {
            matches.push({
              module: transform.parentModule,
              level: transform.parentLevel,
              position: worldPosition,
              chain,
              mapTransform,
            });
          }
          continue;
        }
        queue.push({
          module: transform.parentModule,
          level: transform.parentLevel,
          position: parentPosition,
          chain,
        });
      }
    }
    const uniqueMatches = [...new Map(matches.map((match) => [[
      match.module,
      match.level,
      Math.round(match.position.x * 10_000),
      Math.round(match.position.y * 10_000),
      Math.round(match.position.z * 10_000),
    ].join(":"), match])).values()];
    return uniqueMatches.length === 1 ? uniqueMatches[0] : null;
  };
  const storySecretDoorCatalog = arguments_.has("story-secret-door-catalog")
    ? readJson(path.resolve(arguments_.get("story-secret-door-catalog")))
    : null;
  const storyInteractionCatalog = arguments_.has("story-interaction-catalog")
    ? readJson(path.resolve(arguments_.get("story-interaction-catalog")))
    : null;
  const storyOwnershipZoneCatalog = arguments_.has("story-ownership-zone-catalog")
    ? readJson(path.resolve(arguments_.get("story-ownership-zone-catalog")))
    : null;
  const adamantineForgeCatalog = arguments_.has("adamantine-forge-catalog")
    ? readJson(path.resolve(arguments_.get("adamantine-forge-catalog")))
    : null;
  const secretPuzzleCatalog = arguments_.has("secret-puzzle-catalog")
    ? readJson(path.resolve(arguments_.get("secret-puzzle-catalog")))
    : null;
  const wyrmwayPuzzleCatalog = arguments_.has("wyrmway-puzzle-catalog")
    ? readJson(path.resolve(arguments_.get("wyrmway-puzzle-catalog")))
    : null;
  const crechePuzzleCatalog = arguments_.has("creche-puzzle-catalog")
    ? readJson(path.resolve(arguments_.get("creche-puzzle-catalog")))
    : null;
  const arcaneTowerTransportCatalog = arguments_.has("arcane-tower-transport-catalog")
    ? readJson(path.resolve(arguments_.get("arcane-tower-transport-catalog")))
    : null;
  const sharEntrancePuzzleCatalog = arguments_.has("shar-entrance-puzzle-catalog")
    ? readJson(path.resolve(arguments_.get("shar-entrance-puzzle-catalog")))
    : null;
  const balthazarSecretRoomCatalog = arguments_.has("balthazar-secret-room-catalog")
    ? readJson(path.resolve(arguments_.get("balthazar-secret-room-catalog")))
    : null;
  const minscSluicePuzzleCatalog = arguments_.has("minsc-sluice-puzzle-catalog")
    ? readJson(path.resolve(arguments_.get("minsc-sluice-puzzle-catalog")))
    : null;
  const difficultyClasses = arguments_.has("difficulty-classes")
    ? readDifficultyClasses(JSON.parse(arguments_.get("difficulty-classes")).map((filePath) => path.resolve(filePath)))
    : new Map();
  const findGameplay = (record) => {
    return findGameplayByItemIdentity(record);
  };
  const findGameplayByItemIdentity = (record) => {
    // Empty authored Stats explicitly clears inheritance. Missing Stats must
    // never select an unrelated higher-scored stat that happens to share a root.
    const statsId = record.stats ?? record.statsId;
    if (statsId !== undefined) return gameplayCatalog?.entries?.[statsId]
      ?? gameplayCatalog?.entries?.[statsId.replace(/^I_/, "")] ?? null;
    if (record.templateId) {
      const defaultStatsId = rootTemplateCatalog?.templates?.[record.templateId.toLowerCase()]?.stats;
      return gameplayCatalog?.entries?.[defaultStatsId] ?? null;
    }
    const namedStat = gameplayCatalog?.entries?.[record.itemName]
      ?? gameplayCatalog?.entries?.[record.itemName?.replace(/^I_/, "")];
    if (namedStat) return namedStat;
    const item = findItemDatabaseEntry({
      ...record,
      names: [...(record.names ?? []), record.itemName].filter(Boolean),
    });
    if (!item) return null;
    return gameplayCatalog?.entries?.[item.statsId] ?? {
      type: item.type,
      rarity: item.rarity,
      ...item.gameplay,
    };
  };
  const uniqueEquipmentClassesInTreasureTable = (tableId) => (treasureCatalog?.tables?.[tableId]?.namedStockIds ?? [])
    .map((statsId) => findUniqueEquipmentClass(findGameplayByItemIdentity({ statsId })))
    .filter(Boolean);
  const findUniqueEquipmentClasses = (candidate, gameplay, deathLoot) => {
    const classes = new Set();
    const addGameplay = (entry) => {
      const equipmentClass = findUniqueEquipmentClass(entry);
      if (equipmentClass) classes.add(equipmentClass);
    };
    const addItem = (item) => addGameplay(findGameplayByItemIdentity(item));
    const addLoot = (loot) => {
      for (const item of loot?.items ?? []) addItem(item);
      for (const pool of loot?.randomLootPools ?? []) {
        for (const equipmentClass of uniqueEquipmentClassesInTreasureTable(pool.tableId)) classes.add(equipmentClass);
      }
    };

    addGameplay(gameplay);
    for (const item of candidate.inventoryItems ?? []) addItem(item);
    for (const drop of deathLoot?.guaranteedDrops ?? []) addItem(drop);
    addLoot(candidate.containerLoot);
    addLoot(candidate.diggableSecret?.buriedChest?.loot);
    for (const recipe of candidate.adamantineForge?.recipes ?? []) addGameplay(recipe.gameplay);
    for (const tableId of new Set([
      ...(candidate.tradeTreasures ?? []),
      ...(candidate.sceneVendor?.conditionalStock ?? []).flatMap(({ tradeTables }) => tradeTables),
      ...(candidate.treasureTables ?? []),
      ...(candidate.inventoryTables ?? []),
    ])) {
      for (const equipmentClass of uniqueEquipmentClassesInTreasureTable(tableId)) classes.add(equipmentClass);
    }
    return [...classes];
  };
  /** Every stat id from the entry up to the shared base, lowest first. */
  const gameplayChain = (gameplay) => {
    const chain = [];
    let current = gameplay;
    for (let depth = 0; current && depth < 16; depth += 1) {
      chain.push(current.id);
      current = current.parent ? gameplayCatalog?.entries?.[current.parent] : null;
    }
    return chain;
  };
  const equipmentCategory = (gameplay) => {
    const slot = gameplay?.slot?.toLocaleLowerCase("en-US") ?? "";
    const shieldLike = /shield/i.test(`${gameplay?.weaponType ?? ""} ${gameplay?.armorType ?? ""} ${gameplay?.proficiency ?? ""}`)
      || slot === "melee offhand weapon";
    const type = gameplay?.type?.toLocaleLowerCase("en-US");
    if (type === "weapon") return shieldLike ? "shields" : "weapons";
    if (type === "armor") return shieldLike ? "shields" : JEWELLERY_SLOTS.has(slot) ? "accessories" : "armor";
    return null;
  };
  /** A valuable item nobody carries is either a piece of the world (a chest, a
   * door, a lever) or loot lying there, classified by the item database. */
  const classifyWorldItem = (record) => {
    const chain = gameplayChain(record.gameplay);
    const inChain = (pattern) => chain.some((id) => pattern.test(id));
    if (record.painting) return "item-paintings";
    if (record.readableFilterCategory) return "item-books";
    if (isChestRecord(record)) return "chest";
    if (inChain(CONTAINER_FAMILY_PATTERN)) return "loot-container";
    // Doors, gates and hatches are useful world objects, but they are not map
    // transitions unless extracted portal data or a curated rule proves that
    // they lead somewhere. Treating every locked door as a passage polluted
    // the map with keys, plaques, safes and ordinary room doors.
    if (inChain(PASSAGE_FAMILY_PATTERN)) return "interactable";
    if (inChain(WORLD_OBJECT_FAMILY_PATTERN)) return "interactable";
    const itemCategory = equipmentCategory(record.gameplay) ?? findItemCategory(record) ?? "miscellaneous";
    return itemCategory === "keys" ? "key-item" : `item-${itemCategory}`;
  };
  /** The stat family right below the shared base ("_Undead", "_Humanoid"). */
  const findCreatureFamily = (gameplay) => {
    let current = gameplay;
    let family = null;
    for (let depth = 0; current?.parent && depth < 16; depth += 1) {
      const parent = gameplayCatalog?.entries?.[current.parent];
      if (!parent) break;
      if (!parent.parent) return current.id;
      family = parent.id;
      current = parent;
    }
    return family;
  };
  const findDialogue = (record) => {
    const dialogIds = [...new Set([
      ...(dialogCatalog?.byParticipant?.[record.id.toLocaleLowerCase("en-US")] ?? []),
      ...(record.defaultDialogId && dialogCatalog?.dialogs?.[record.defaultDialogId] ? [record.defaultDialogId] : []),
    ])];
    const dialogs = dialogIds.map((id) => dialogCatalog.dialogs?.[id]).filter(Boolean);
    if (dialogs.length === 0) return null;
    const choices = [];
    const approvalEvents = [];
    const characterChoices = [];
    const choiceOutcomes = [];
    const seenChoices = new Set();
    const seenApprovalEvents = new Set();
    const seenCharacterChoices = new Set();
    const seenChoiceOutcomes = new Set();
    for (const dialog of dialogs) {
      for (const check of dialog.checks ?? []) {
        const key = [check.localizedText?.en || check.textHandle || check.id, check.skill, check.ability, check.difficultyClass].join(":");
        if (seenChoices.has(key)) continue;
        seenChoices.add(key);
        choices.push({
          id: check.id,
          rollType: check.rollType,
          skill: check.skill || undefined,
          ability: check.ability || undefined,
          difficultyClass: check.difficultyClass,
          localizedText: check.localizedText,
          dialogTitle: dialog.title,
          provenance: dialog.provenance,
        });
      }
      for (const approval of dialog.approvals ?? []) {
        const effectsKey = (approval.effects ?? [])
          .map((effect) => `${effect.originId}:${effect.value}`)
          .sort((left, right) => left.localeCompare(right, "en"))
          .join("|");
        const key = [approval.localizedText?.en || approval.textHandle || approval.id, effectsKey].join(":");
        if (seenApprovalEvents.has(key)) continue;
        seenApprovalEvents.add(key);
        approvalEvents.push({
          id: approval.id,
          nodeType: approval.nodeType,
          localizedText: approval.localizedText,
          effects: approval.effects,
          dialogTitle: dialog.title,
          provenance: dialog.provenance,
          reactionProvenance: approval.reactionProvenance,
        });
      }
      for (const characterChoice of dialog.characterChoices ?? []) {
        const facetKey = (characterChoice.facets ?? [])
          .map((facet) => facet.id)
          .sort((left, right) => left.localeCompare(right, "en"))
          .join("|");
        const key = [characterChoice.localizedText?.en || characterChoice.textHandle || characterChoice.id, facetKey].join(":");
        if (seenCharacterChoices.has(key)) continue;
        seenCharacterChoices.add(key);
        characterChoices.push({
          id: characterChoice.id,
          nodeType: characterChoice.nodeType,
          localizedText: characterChoice.localizedText,
          facets: characterChoice.facets,
          conditionSource: characterChoice.conditionSource,
          dialogTitle: dialog.title,
          provenance: dialog.provenance,
        });
      }
      for (const choiceOutcome of dialog.choiceOutcomes ?? []) {
        const consequenceKey = (choiceOutcome.consequences ?? [])
          .map(({ id, rewards, itemTransfers }) => rewards?.length || itemTransfers?.length
            ? JSON.stringify([id, rewards ?? [], itemTransfers ?? []]) : id)
          .sort((left, right) => left.localeCompare(right, "en"))
          .join("|");
        const key = [choiceOutcome.localizedText?.en || choiceOutcome.textHandle || choiceOutcome.id, consequenceKey].join(":");
        if (seenChoiceOutcomes.has(key)) continue;
        seenChoiceOutcomes.add(key);
        choiceOutcomes.push({
          id: choiceOutcome.id,
          nodeType: choiceOutcome.nodeType,
          localizedText: choiceOutcome.localizedText,
          consequenceScope: choiceOutcome.consequenceScope,
          consequences: choiceOutcome.consequences.map(({ rewards, itemTransfers, ...consequence }) => ({
            ...consequence,
            ...(rewards?.length ? { rewards: rewards.map(resolveDialogueReward) } : {}),
            ...(itemTransfers?.length ? { itemTransfers: itemTransfers.map(resolveDialogueReward) } : {}),
          })),
          dialogTitle: dialog.title,
          provenance: dialog.provenance,
        });
      }
    }
    choices.sort((left, right) => (left.difficultyClass ?? Number.MAX_SAFE_INTEGER) - (right.difficultyClass ?? Number.MAX_SAFE_INTEGER)
      || (left.skill ?? "").localeCompare(right.skill ?? "", "en")
      || left.id.localeCompare(right.id, "en"));
    approvalEvents.sort((left, right) => (left.localizedText?.en ?? "").localeCompare(right.localizedText?.en ?? "", "en")
      || left.id.localeCompare(right.id, "en"));
    characterChoices.sort((left, right) => (left.localizedText?.en ?? "").localeCompare(right.localizedText?.en ?? "", "en")
      || left.id.localeCompare(right.id, "en"));
    choiceOutcomes.sort((left, right) => (left.localizedText?.en ?? "").localeCompare(right.localizedText?.en ?? "", "en")
      || left.id.localeCompare(right.id, "en"));
    const approvalEffects = approvalEvents.flatMap((event) => event.effects);
    const moneyTransfers = [...new Map(dialogIds.flatMap((dialogId) => (
      storyLocationRelationCatalog?.dialogMoneyTransfersByDialogId?.[dialogId] ?? []
    )).map((transfer) => [transfer.id, {
      id: transfer.id,
      dialogId: transfer.dialog.id,
      index: transfer.index,
      amount: transfer.amount,
      evidence: transfer.evidence,
    }])).values()]
      .sort((left, right) => left.amount - right.amount || left.index - right.index || left.id.localeCompare(right.id, "en"));
    const characterFacets = [...new Map(characterChoices
      .flatMap((choice) => choice.facets)
      .map((facet) => [facet.id, facet])).values()]
      .sort((left, right) => left.kind.localeCompare(right.kind, "en")
        || (left.localizedNames?.en ?? left.internalName).localeCompare(right.localizedNames?.en ?? right.internalName, "en"));
    const itemRequirements = record.flags.isGlobal && /^S_Player_/i.test(record.internalName) ? [] : [...new Map(dialogs.flatMap((dialog) => {
      const resourceName = path.basename(dialog.provenance, path.extname(dialog.provenance)).toLocaleLowerCase("en-US");
      return (dialogItemRequirementCatalog?.byDialogResourceName?.[resourceName] ?? [])
        .map((requirement) => ({ requirement, dialog }));
    }).map(({ requirement, dialog }) => [
      `${requirement.dialogId}:${requirement.itemTemplateId}`,
      { requirement, dialog },
    ])).values()]
      .map(({ requirement, dialog }) => resolveDialogItemRequirement(requirement, dialog))
      .sort((left, right) => left.title.localeCompare(right.title, "en")
        || left.dialogTitle.localeCompare(right.dialogTitle, "en"));
    return {
      conversationCount: dialogs.length,
      checkCount: choices.length,
      localizedChoiceCount: choices.filter((choice) => choice.localizedText?.en).length,
      skills: [...new Set(choices.map((choice) => choice.skill).filter(Boolean))].sort((left, right) => left.localeCompare(right, "en")),
      choices,
      approvalEventCount: approvalEvents.length,
      approvalEffectCount: approvalEffects.length,
      approvalCharacters: [...new Set(approvalEffects.map((effect) => effect.originName).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, "en")),
      approvalEvents,
      characterChoiceCount: characterChoices.length,
      localizedCharacterChoiceCount: characterChoices.filter((choice) => choice.localizedText?.en).length,
      characterFacets,
      characterChoices,
      choiceOutcomeCount: choiceOutcomes.length,
      choiceOutcomes,
      moneyTransferCount: moneyTransfers.length,
      moneyAmounts: [...new Set(moneyTransfers.map(({ amount }) => amount))].sort((left, right) => left - right),
      moneyTransfers,
      itemRequirementCount: itemRequirements.length,
      itemRequirements,
    };
  };
  const findCorpseDialogue = (record) => {
    const source = corpseDialogCatalog?.byCharacterId?.[record.id.toLocaleLowerCase("en-US")];
    if (!source?.dialogs?.length) return null;
    const questions = [...new Map(source.dialogs
      .flatMap((dialog) => dialog.questions ?? [])
      .map((question) => [question.localizedText?.en?.toLocaleLowerCase("en-US") ?? question.id, {
        id: question.id,
        localizedText: question.localizedText,
      }])).values()]
      .sort((left, right) => (left.localizedText?.en ?? "").localeCompare(right.localizedText?.en ?? "", "en")
        || left.id.localeCompare(right.id, "en"));
    return {
      dialogCount: source.dialogs.length,
      questionCount: questions.length,
      questions,
    };
  };
  const findQuest = (record) => {
    const rawLinks = questCatalog?.byTarget?.[record.id.toLocaleLowerCase("en-US")] ?? [];
    const links = rawLinks.map((link) => ({
      link,
      quest: questCatalog.quests?.[link.questId],
      objective: questCatalog.objectives?.[link.objectiveId],
      marker: questCatalog.markers?.[link.markerGuid],
    })).filter(({ quest, objective, marker }) => quest?.visible && objective && marker?.level === record.level);
    if (links.length === 0) return null;
    const quests = [];
    for (const questId of [...new Set(links.map(({ quest }) => quest.id))]) {
      const quest = questCatalog.quests[questId];
      const objectiveLinks = links.filter(({ quest: candidate }) => candidate.id === questId);
      const objectives = [];
      for (const objectiveId of [...new Set(objectiveLinks.map(({ objective }) => objective.id))]) {
        if (objectiveId.toLocaleLowerCase("en-US").includes("outdated")) continue;
        const objective = questCatalog.objectives[objectiveId];
        const relevantLinks = objectiveLinks.filter(({ objective: candidate }) => candidate.id === objectiveId);
        const steps = [];
        const seenSteps = new Set();
        for (const step of quest.steps.filter((candidate) => candidate.objectiveId === objectiveId)) {
          const key = step.localizedDescriptions?.en || step.descriptionHandle || step.guid;
          if (seenSteps.has(key)) continue;
          seenSteps.add(key);
          steps.push({
            id: step.id,
            guid: step.guid,
            localizedDescriptions: step.localizedDescriptions,
            ...(step.dialogFlagId ? { dialogFlagId: step.dialogFlagId } : {}),
            ...(step.statTriggerId ? { statTriggerId: step.statTriggerId } : {}),
            ...(step.experienceReward ? { experienceReward: step.experienceReward } : {}),
            ...(step.areaLevel ? { areaLevel: step.areaLevel } : {}),
            ...(step.conditionalRules?.length ? {
              conditionalRules: step.conditionalRules.map(({ evidence: _evidence, ...rule }) => rule),
            } : {}),
            ...(step.levelOverride ? { levelOverride: step.levelOverride } : {}),
            ...(step.questRewardLevel ? { questRewardLevel: step.questRewardLevel } : {}),
          });
        }
        objectives.push({
          id: objective.id,
          guid: objective.guid,
          localizedDescriptions: objective.localizedDescriptions,
          priority: objective.priority,
          markerIds: relevantLinks.map(({ marker }) => marker.guid),
          markerLevel: relevantLinks[0].marker.level,
          markerTargetType: relevantLinks[0].marker.targetType,
          localizedMarkerTitles: Object.fromEntries(Object.entries(relevantLinks[0].marker.localizedDisplayTexts ?? {}).filter(([, value]) => value)),
          steps,
        });
      }
      if (objectives.length === 0) continue;
      objectives.sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id, "en"));
      quests.push({
        id: quest.id,
        guid: quest.guid,
        categoryId: quest.categoryId,
        parentQuestId: quest.parentQuestId,
        localizedTitles: quest.localizedTitles,
        objectives,
      });
    }
    if (quests.length === 0) return null;
    quests.sort((left, right) => (questCatalog.quests[left.id]?.sortingPriority ?? 0) - (questCatalog.quests[right.id]?.sortingPriority ?? 0)
      || (left.localizedTitles?.en ?? left.id).localeCompare(right.localizedTitles?.en ?? right.id, "en"));
    const objectives = quests.flatMap((quest) => quest.objectives);
    return {
      questCount: quests.length,
      objectiveCount: objectives.length,
      journalStepCount: objectives.reduce((total, objective) => total + objective.steps.length, 0),
      primaryMarkerTitle: objectives.find((objective) => objective.localizedMarkerTitles?.en)?.localizedMarkerTitles?.en,
      quests,
    };
  };
  const findReadableImpact = (record) => {
    const matches = [
      readableImpactCatalog?.byObjectId?.[record.id.toLocaleLowerCase("en-US")],
      readableImpactCatalog?.byTemplateId?.[record.templateId?.toLocaleLowerCase("en-US")],
    ].filter(Boolean);
    if (matches.length === 0) return null;
    const flags = [...new Map(matches.flatMap((match) => match.flags ?? []).map((impact) => [impact.id, {
      id: impact.id,
      kind: impact.kind,
      flagId: impact.flag.id,
      title: impact.kind === "map-reveal" ? "" : humanizeStoryFlag(impact.flag.token),
      evidence: impact.evidence,
    }])).values()];
    const questUpdates = [...new Map(matches.flatMap((match) => match.questUpdates ?? []).map((impact) => {
      const quest = questCatalog?.quests?.[impact.questId];
      const step = quest?.steps?.find(({ id }) => id === impact.stateId);
      return [impact.id, {
        id: impact.id,
        questId: impact.questId,
        stateId: impact.stateId,
        localizedQuestTitles: quest?.localizedTitles ?? {},
        localizedStateDescriptions: step?.localizedDescriptions ?? {},
        evidence: impact.evidence,
      }];
    })).values()];
    return {
      exactObjectMatch: matches.some(({ scope }) => scope === "object"),
      templateMatch: matches.some(({ scope }) => scope === "template"),
      flags,
      questUpdates,
    };
  };
  const findItemStoryImpact = (record) => {
    const matches = [
      itemStoryImpactCatalog?.byObjectId?.[record.id.toLocaleLowerCase("en-US")],
      itemStoryImpactCatalog?.byTemplateId?.[record.templateId?.toLocaleLowerCase("en-US")],
    ].filter(Boolean);
    if (matches.length === 0) return null;
    const mapFlagImpacts = (field) => [...new Map(matches.flatMap((match) => match[field] ?? []).map((impact) => [impact.flag.id, {
      flagId: impact.flag.id,
      title: humanizeStoryFlag(impact.flag.token),
      evidence: impact.evidence,
    }])).values()];
    const carrying = mapFlagImpacts("carryingFlags");
    const handIns = mapFlagImpacts("handIns");
    const questUpdates = [...new Map(matches.flatMap((match) => match.questUpdates ?? []).map((impact) => {
      const quest = questCatalog?.quests?.[impact.questId];
      const step = quest?.steps?.find(({ id }) => id === impact.stateId);
      return [impact.id, {
        id: impact.id,
        trigger: impact.trigger,
        questId: impact.questId,
        stateId: impact.stateId,
        conditional: impact.conditional,
        localizedQuestTitles: quest?.localizedTitles ?? {},
        localizedStateDescriptions: step?.localizedDescriptions ?? {},
        evidence: impact.evidence,
      }];
    })).values()];
    const exactObjectMatch = matches.some(({ scope }) => scope === "object");
    return {
      exactObjectMatch,
      templateMatch: matches.some(({ scope }) => scope === "template"),
      highValue: exactObjectMatch || handIns.length > 0 || questUpdates.length > 0,
      ...(record.itemAcquisition ? { acquisition: record.itemAcquisition } : {}),
      carrying,
      handIns,
      questUpdates,
    };
  };
  const findWorldChecks = (record) => {
    const rawChecks = worldCheckCatalog?.byTarget?.[record.id.toLocaleLowerCase("en-US")] ?? [];
    if (rawChecks.length === 0) return null;
    const checks = rawChecks.map((check) => {
      if (check.type !== "ambush" || !Array.isArray(check.ambushers)) return check;
      return {
        ...check,
        ambushers: check.ambushers.map((ambusher) => {
          const ambusherRecord = recordsById.get(ambusher.ambusherObjectId);
          const localizedTitles = Object.fromEntries(Object.entries(ambusherRecord?.displayName ?? {})
            .filter(([, value]) => typeof value === "string" && value.trim()));
          return {
            contentId: ambusher.ambusherObjectId,
            title: localizedTitles.en
              || humanizeAmbusherName(ambusherRecord?.internalName || ambusher.token)
              || "Unknown ambusher",
            ...(Object.keys(localizedTitles).length > 0 ? { localizedTitles } : {}),
            provenance: ambusher.provenance,
            sourceLine: ambusher.sourceLine,
          };
        }),
      };
    });
    // A roll describes an interaction, not proof that its target is hidden.
    // Secret doors, buried loot and revealed passages are classified separately.
    const categories = worldCheckCategories(checks);
    return {
      checkCount: checks.length,
      knowledgeCheckCount: checks.filter((check) => check.type === "knowledge-check").length,
      skillCheckCount: checks.filter((check) => check.type === "skill-check").length,
      savingThrowCount: checks.filter((check) => check.type === "saving-throw").length,
      ambushCount: checks.filter((check) => check.type === "ambush").length,
      skills: [...new Set(checks.map((check) => check.skill).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, "en")),
      categories,
      primaryTitle: checks[0].title,
      checks,
    };
  };
  const findInspirations = (record) => {
    const directEventIds = inspirationCatalog?.byObjectId?.[record.id.toLocaleLowerCase("en-US")] ?? [];
    const ruleEventIds = inspirationCatalog?.byRuleObjectId?.[record.id.toLocaleLowerCase("en-US")] ?? [];
    const statsQuestId = record.stats?.toLocaleLowerCase("en-US");
    const eventIds = [...new Set([
      ...directEventIds,
      ...ruleEventIds,
      ...(statsQuestId ? inspirationCatalog?.byQuestId?.[statsQuestId] ?? [] : []),
    ])];
    const events = eventIds.map((id) => inspirationCatalog?.events?.[id]).filter(Boolean);
    if (events.length === 0) return null;
    return {
      eventCount: events.length,
      events: events.map((event) => ({
        id: event.id,
        internalName: event.internalName,
        act: event.act,
        inspirationPoints: event.inspirationPoints,
        rewardLevel: event.rewardLevel,
        localizedTitles: event.localizedTitles,
        localizedDescriptions: event.localizedDescriptions,
        background: event.background,
        ...(event.characters?.length > 0 ? { characters: event.characters } : {}),
        placementEvidence: ruleEventIds.includes(event.id)
          ? {
            kind: "story-rule",
            ...event.placementAnchors.find(({ objectId }) => objectId === record.id.toLocaleLowerCase("en-US")),
          }
          : directEventIds.includes(event.id)
            ? { kind: "direct-object" }
            : { kind: "quest-stats", questId: record.stats },
      })),
    };
  };
  const findStoryRisks = (record) => {
    const risks = storyRiskCatalog?.byTarget?.[record.id.toLocaleLowerCase("en-US")] ?? [];
    if (risks.length === 0) return null;
    return {
      riskCount: risks.length,
      types: [...new Set(risks.map((risk) => risk.type))],
      primaryTitle: risks[0].title,
      risks,
    };
  };
  const findPermanentBonuses = (record) => {
    const interactions = permanentBonusCatalog?.byTarget?.[record.id.toLocaleLowerCase("en-US")] ?? [];
    if (interactions.length === 0) return null;
    return {
      interactionCount: interactions.length,
      primaryTitle: interactions[0].title,
      interactions,
    };
  };
  // Curated positions and mined story-destination copies both share the
  // character's id prefix; only curated ones know which position they are.
  const findPartyMember = (record) => {
    if (record.sceneContent?.kind && record.sceneContent.kind !== "party-member") return null;
    const member = partyMembersByCharacterId.get(record.id.split(":")[0].toLocaleLowerCase("en-US"));
    if (!member) return null;
    const current = member.positions.find((position) => position.contentId === record.id);
    return {
      memberId: member.id,
      originId: member.originId,
      localizedNames: member.localizedNames,
      localizedDescriptions: member.localizedDescriptions,
      race: member.race,
      subRace: member.subRace,
      class: member.class,
      subClass: member.subClass,
      quests: member.quests,
      keepBossMarker: member.keepBossMarker === true,
      ...(current ? { currentPositionId: current.id } : {}),
      positions: member.positions.map((position) => ({
        id: position.id,
        kind: position.kind,
        contentId: position.contentId,
        level: position.level,
        localizedConditions: position.localizedConditions,
      })),
      evidence: current?.evidence ?? [],
    };
  };
  const findRescuePlan = (record) => {
    const target = rescuePlanCatalog?.byTarget?.[record.id.toLocaleLowerCase("en-US")];
    if (!target) return null;
    const plan = rescuePlanCatalog.plans?.find((candidate) => candidate.id === target.planId);
    if (!plan) return null;
    const currentHostage = target.hostageId
      ? plan.hostages.find((hostage) => hostage.id === target.hostageId)
      : null;
    return {
      planId: plan.id,
      title: plan.title,
      role: target.role,
      turnLimits: plan.turnLimits,
      floodTurn: plan.floodTurn,
      floodPositionCount: plan.floodPositionCount,
      fixedHostageCount: plan.fixedHostageCount,
      conditionalHostageCount: plan.conditionalHostageCount,
      totalPossibleHostages: plan.totalPossibleHostages,
      escapeTargetId: plan.escapeTargetId,
      ...(currentHostage ? { currentHostage } : {}),
      hostages: plan.hostages,
      evidence: plan.evidence,
    };
  };

  const placementSources = [
    ...supplementaryPlacementRoots.map((root) => ({ root, provenancePrefix: "supplementary" })),
    { root: placementsRoot, provenancePrefix: "" },
  ];
  const files = placementSources.flatMap(({ root, provenancePrefix }) => walkFiles(root)
    .filter((filePath) => filePath.toLowerCase().endsWith(".lsj"))
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((filePath) => ({ filePath, root, provenancePrefix })));
  const recordsById = new Map();
  let rawObjectCount = 0;

  for (const { filePath, root, provenancePrefix } of files) {
    const source = getSourceIdentity(root, filePath, provenancePrefix);
    const objects = readJson(filePath)?.save?.regions?.Templates?.GameObjects;
    if (!Array.isArray(objects)) {
      throw new Error(`Templates.GameObjects was not found in ${filePath}.`);
    }
    for (const object of objects) {
      rawObjectCount += 1;
      const id = attributeValue(object, "MapKey") || `${source.relativePath}#${rawObjectCount}`;
      const templateId = attributeValue(object, "TemplateName", "").toLocaleLowerCase("en-US");
      const rootTemplate = rootTemplateCatalog?.templates?.[templateId];
      const authoredDisplayNameHandle = attributeValue(object, "DisplayName", "");
      const displayNameHandle = authoredDisplayNameHandle || rootTemplate?.displayNameHandle || "";
      const authoredDescriptionHandle = attributeValue(object, "Description", "");
      const descriptionHandle = authoredDescriptionHandle || rootTemplate?.descriptionHandle || "";
      const sourcePosition = parsePosition(object);
      const objectLevel = attributeValue(object, "LevelName", source.level);
      const templateProjection = resolveTemplateProjection(source.module, objectLevel, sourcePosition);
      const levelTransform = templateProjection?.mapTransform
        ?? resolveLevelTransform(source.module, objectLevel, sourcePosition);
      const positionSuppressed = !templateProjection && !levelTransform
        && templateTransformsByChild.has(`${source.module}/${objectLevel}`);
      const position = templateProjection?.position
        ?? (positionSuppressed ? null : applyLevelTransform(sourcePosition, levelTransform));
      const record = {
        id,
        type: attributeValue(object, "Type", "") || rootTemplate?.type || source.placementKind.replace(/s$/, ""),
        placementKind: source.placementKind,
        globalPlacement: source.globalPlacement,
        module: templateProjection?.module ?? levelTransform?.module ?? source.module,
        level: templateProjection?.level ?? objectLevel,
        ...(templateProjection ? { authoredLevel: objectLevel } : {}),
        internalName: attributeValue(object, "Name", ""),
        displayNameHandle,
        displayName: {
          en: localization.en.get(displayNameHandle) ?? "",
          tr: localization.tr.get(displayNameHandle) ?? "",
        },
        descriptionHandle,
        description: {
          en: localization.en.get(descriptionHandle) ?? "",
          tr: localization.tr.get(descriptionHandle) ?? "",
        },
        stats: Object.hasOwn(object, "Stats") ? attributeValue(object, "Stats", "") : rootTemplate?.stats ?? "",
        templateId,
        icon: attributeValue(object, "Icon", "") || rootTemplate?.icon || "",
        defaultDialogId: attributeValue(object, "DefaultDialog", "").toLocaleLowerCase("en-US"),
        ownerId: attributeValue(object, "owner", "").toLocaleLowerCase("en-US"),
        accessKeyId: attributeValue(object, "Key", ""),
        lockDifficultyClassId: attributeValue(object, "LockDifficultyClassID", "")
          .toLocaleLowerCase("en-US"),
        disarmDifficultyClassId: (Object.hasOwn(object, "DisarmDifficultyClassID")
          ? String(attributeValue(object, "DisarmDifficultyClassID", ""))
          : rootTemplate?.disarmDifficultyClassId ?? "").toLocaleLowerCase("en-US"),
        defaultState: attributeValue(object, "DefaultState", ""),
        faction: attributeValue(object, "Faction", "").toLocaleLowerCase("en-US"),
        combatGroupId: attributeValue(object, "CombatGroupID", "").toLocaleLowerCase("en-US"),
        ...(source.placementKind === "characters" ? { characterCapabilities: readCharacterCapabilities(object) } : {}),
        archetype: attributeValue(object, "Archetype", ""),
        equipmentId: Object.hasOwn(object, "Equipment") && !Array.isArray(object.Equipment)
          ? attributeValue(object, "Equipment", "") : rootTemplate?.equipmentId,
        equipmentLootable: Object.hasOwn(object, "IsEquipmentLootable")
          ? attributeValue(object, "IsEquipmentLootable", false) === true : rootTemplate?.equipmentLootable,
        position,
        ...(positionSuppressed ? { positionSuppressed: "template-instance-outside-selected-map", sourcePosition } : {}),
        ...(templateProjection ? {
          sourcePosition,
          templateProjection: {
            chain: templateProjection.chain.map((transform) => ({
              id: transform.id,
              childLevel: transform.childLevel,
              parentLevel: transform.parentLevel,
              position: transform.position,
              rotation: transform.rotation,
              scale: transform.scale,
              provenance: transform.provenance,
            })),
            ...(templateProjection.mapTransform ? { mapTransform: summarizeLevelTransform(templateProjection.mapTransform) } : {}),
          },
        } : sourcePosition && levelTransform && (Math.hypot(levelTransform.offset.x, levelTransform.offset.z) > 0.000001
          || (levelTransform.rotationQuarterTurns ?? 0) !== 0) ? {
          sourcePosition,
          positionTransform: summarizeLevelTransform(levelTransform),
        } : {}),
        flags: {
          isBoss: attributeValue(object, "IsBoss", false) === true,
          storyItem: attributeValue(object, "StoryItem", false) === true,
          isLootable: attributeValue(object, "IsLootable", false) === true,
          isGlobal: attributeValue(object, "IsGlobal", false) === true,
          isTrap: Object.hasOwn(object, "IsTrap")
            ? attributeValue(object, "IsTrap", false) === true
            : rootTemplate?.isTrap === true,
          secretDoor: hasAuthoredSecretDoor(object),
        },
        hasTradeTreasure: hasNestedValues(object.TradeTreasures),
        tradeTreasures: collectNestedScalarValues(object.TradeTreasures)
          .filter((value) => value !== "FixedString"),
        treasureTables: collectNestedScalarValues(object.Treasures)
          .filter((value) => value !== "FixedString"),
        inventoryItems: parseInventoryItems(object),
        inventoryTables: collectNestedScalarValues(object.InventoryList)
          .filter((value) => value !== "FixedString"),
        recipeIds: parseRecipeIds(object),
        teleportActions: readNativeTeleportActions(object, source.relativePath),
        provenance: [
          { sourcePath: source.relativePath },
          ...(!authoredDisplayNameHandle && rootTemplate?.displayName.en ? [{
            sourcePath: `root-templates/${rootTemplate.provenance}`,
          }] : []),
        ],
      };
      const existing = recordsById.get(id);
      if (existing) {
        recordsById.set(id, mergePlacementRecord(existing, record, object));
        continue;
      }
      recordsById.set(id, record);
    }
  }

  // Synthetic scene/party/portal appearances must not change the population
  // used by the legacy faction heuristic. Count authored actors exactly once,
  // before adding any map-dependent destination records.
  const factionStats = new Map();
  for (const record of recordsById.values()) {
    if (record.placementKind !== "characters" || !record.faction) continue;
    const stats = factionStats.get(record.faction) ?? { members: 0, combatants: 0 };
    stats.members += 1;
    if (record.combatGroupId) stats.combatants += 1;
    factionStats.set(record.faction, stats);
  }
  const hostileFactions = new Set([...factionStats]
    .filter(([, { members, combatants }]) => members >= 5 && combatants / members >= 0.5)
    .map(([faction]) => faction));

  for (const waypoint of waypointCatalog?.waypoints ?? []) {
    recordsById.set(waypoint.shrineId, {
      id: waypoint.shrineId,
      type: "item",
      placementKind: "items",
      module: "official-waypoints",
      level: waypoint.level,
      internalName: waypoint.internalName,
      displayNameHandle: waypoint.localizationHandle,
      displayName: {
        en: waypoint.localizedNames?.en ?? "",
        tr: waypoint.localizedNames?.tr ?? "",
      },
      descriptionHandle: "",
      description: { en: "", tr: "" },
      stats: "",
      templateId: "",
      icon: "",
      position: waypoint.position,
      flags: {
        isBoss: false,
        storyItem: false,
        isLootable: false,
        isGlobal: true,
        isTrap: false,
        secretDoor: false,
      },
      hasTradeTreasure: false,
      tradeTreasures: [],
      inventoryTables: [],
      recipeIds: [],
      waypoint,
      provenance: [
        waypoint.provenance.story,
        waypoint.provenance.shrine,
        waypoint.provenance.trigger,
        waypoint.provenance.localization,
      ],
    });
  }

  for (const sourceRecord of [...recordsById.values()]) {
    const portal = findNavigationPortal(sourceRecord, recordsById);
    if (!portal || isStationaryNavigationPortal(portal) || reciprocalNavigationPortalIds.has(portal.instanceId)) continue;
    const vertical = isVerticalNavigationPortal(portal);
    recordsById.set(`${portal.id}:destination`, {
      ...sourceRecord,
      id: `${portal.id}:destination`,
      internalName: `${sourceRecord.internalName}_Target`,
      module: portal.module,
      level: portal.level,
      position: portal.targetPosition,
      ownerId: "",
      accessKeyId: "",
      lockDifficultyClassId: "",
      defaultState: "",
      flags: { isBoss: false, storyItem: false, isLootable: false, isGlobal: true, isTrap: false, secretDoor: false },
      hasTradeTreasure: false,
      tradeTreasures: [],
      treasureTables: [],
      inventoryItems: [],
      inventoryTables: [],
      recipeIds: [],
      teleportActions: undefined,
      navigationDestination: {
        portalId: portal.id,
        instanceId: portal.instanceId,
        module: portal.module,
        level: portal.level,
        kind: vertical ? "vertical-connection" : "transition",
        sourcePosition: portal.sourcePosition,
        targetPosition: portal.targetPosition,
      },
      provenance: [portal.provenance],
    });
  }

  const matchesSelectedMap = (record) => selectedLevels.size === 0 && !levelPattern
    ? true
    : selectedLevels.has(record.level) || levelPattern?.test(record.level);
  const storyLocationEvidence = (relation) => relation.evidence.map((evidence) => ({
    sourcePath: `${evidence.sourcePath}:${evidence.sourceLine}`,
  }));
  const storyAct = (relation) => relation?.evidence
    ?.map(({ sourcePath }) => sourcePath.match(/(?:BG3_)?Act([123])/i)?.[1])
    .find(Boolean) ?? null;
  // Story-scripted destinations: characters the story teleports or walks to an
  // exact trigger inside this map while their authored placement lies elsewhere
  // (a boss fight in a later act, a trader who relocates). Each such character
  // gets a positioned copy at the destination so its marker, loot and trade
  // stock exist where the encounter actually happens. Reviewed NPC scenes keep
  // separate pins; other local movements retain one source-valid anchor per
  // character/map. Alternate evidence stays attached to its own location.
  const isPlacedInSelectedMap = (record) => Boolean(record.position)
    && matchesSelectedMap(record)
    && isWithinReference(record.position, coordinateReference)
    && (minimumHeight === null || record.position.y >= minimumHeight)
    && (maximumHeight === null || record.position.y <= maximumHeight)
    // Destination selection must use the same floor as final publication.
    // An authored actor on another level must not suppress this floor's arrival.
    && matchesFloor(record.position);
  const destinationsByCharacter = new Map();
  const reviewedDestinations = createReviewedDestinationCorrections(JSON.parse(arguments_.get("scripted-destination-corrections") ?? "[]"),
    storyLocationRelationCatalog ?? { scriptedDestinations: [] }).forMap(currentMapId);
  const previousContentPath = arguments_.get("previous-content") ?? arguments_.get("content-output");
  if (arguments_.has("previous-content") && !fs.existsSync(previousContentPath)) {
    throw new Error(`Previous content does not exist: ${previousContentPath}`);
  }
  const previousStoryDestinations = Object.groupBy((previousContentPath && fs.existsSync(previousContentPath)
    ? Object.values(readJson(previousContentPath).entities) : [])
    .filter(({ storyDestination }) => storyDestination), ({ storyDestination }) => storyDestination.characterContentId);
  // Choose a parent-map arrival from the locations not already represented on
  // a superseding map. Otherwise a child can remove the parent's selected copy
  // and accidentally erase an unrelated alternate arrival elsewhere outdoors.
  const supersedingDestinations = new Set();
  for (const filename of JSON.parse(arguments_.get("superseding-content") ?? "[]")) {
    const entities = readJson(filename).entities;
    if (!Array.isArray(entities)) throw new Error(`Invalid superseding content: ${filename}`);
    for (const { storyDestination: profile } of entities) {
      if (!profile) continue;
      for (const anchorId of [profile.anchorContentId, ...(profile.otherAnchorContentIds ?? [])]) {
        supersedingDestinations.add(`${profile.characterContentId}/${anchorId}`);
      }
    }
  }
  for (const relation of storyLocationRelationCatalog?.scriptedDestinations ?? []) {
    if (supersedingDestinations.has(`${relation.character.id}/${relation.anchor.id}`)) continue;
    const character = recordsById.get(relation.character.id);
    const anchor = recordsById.get(relation.anchor.id);
    if (!character?.displayName.en || !anchor || !isPlacedInSelectedMap(anchor)
      || !relation.npcScene && isPlacedInSelectedMap(character)) continue;
    // A party member's curated story positions replace mined destinations on
    // the maps they cover; elsewhere (Minthara imprisoned at Moonrise) the
    // mined destination still stands in for the character.
    const member = partyMembersByCharacterId.get(character.id.toLocaleLowerCase("en-US"));
    if (!relation.npcScene && member?.positions.some((position) => position.kind === "story"
      && isPlacedInSelectedMap(recordsById.get(position.anchorContentId) ?? {}))) continue;
    destinationsByCharacter.set(character.id, [...(destinationsByCharacter.get(character.id) ?? []), { anchor, relation }]);
  }
  for (const correction of reviewedDestinations) {
    if (!destinationsByCharacter.get(correction.characterId)?.some(({ anchor }) => anchor.id === correction.anchorId)) {
      throw new Error(`Reviewed destination is not eligible for this map/floor: ${currentMapId}/${correction.anchorId}`);
    }
  }
  for (const [characterId, eligibleDestinations] of destinationsByCharacter) for (const destinations of groupStoryDestinations(eligibleDestinations)) {
    const character = recordsById.get(characterId);
    const correction = reviewedDestinations.find((entry) => entry.characterId === characterId
      && destinations.some(({ anchor }) => anchor.id === entry.anchorId));
    const previous = previousStoryDestinations[characterId]?.find(({ storyDestination }) => destinations.some(({ anchor }) => anchor.id === storyDestination.anchorContentId));
    const { anchor } = selectStoryDestination(destinations, correction?.anchorId ?? previous?.storyDestination.anchorContentId);
    const id = correction?.contentId ?? `${characterId}:destination:${anchor.id}`;
    const storyDestination = createStoryDestinationProfile({ characterId, anchorId: anchor.id,
      anchorName: anchor.internalName, correctedFromAnchorId: correction?.previousAnchorId,
      relations: destinations.map(({ relation }) => relation) });
    const { evidence } = storyDestination;
    const sceneVendor = sceneVendorFor(storyDestination);
    const sceneContent = sceneContentFor(storyDestination);
    if (sceneContent?.kind && correction?.presentation?.kind && sceneContent.kind !== correction.presentation.kind) {
      throw new Error(`Conflicting reviewed scene presentation: ${id}`);
    }
    if (sceneContent?.kind && candidateKindOverrides.has(id.toLocaleLowerCase("en-US"))
      && candidateKindOverrides.get(id.toLocaleLowerCase("en-US")) !== sceneContent.kind) {
      throw new Error(`Candidate override conflicts with reviewed scene presentation: ${id}`);
    }
    recordsById.set(id, {
      ...placementAtAnchor(character, anchor),
      id,
      globalPlacement: false,
      ...(correction?.presentation ? { reviewedPresentation: correction.presentation } : {}),
      ...(sceneContent ? { sceneContent, reviewedPresentation: { ...correction?.presentation,
        ...(sceneContent.kind ? { kind: sceneContent.kind } : {}) } } : {}),
      storyDestination,
      ...(sceneVendor ? { sceneVendor, tradeTreasures: sceneVendor.tradeTables } : {}),
      provenance: mergeUnique(character.provenance, [...anchor.provenance, ...evidence],
        ({ sourcePath, sourceLine, statement }) => `${sourcePath}:${sourceLine ?? ""}:${statement ?? ""}`),
    });
  }

  // Party members: the recruitable origins get one positioned copy per curated
  // story position (a rescued companion on the beach, a druid in the worg
  // pens), while an authored placement that is only an off-map holding spot
  // never becomes a marker.
  for (const member of partyMemberCatalog?.members ?? []) {
    const character = recordsById.get(member.characterId);
    if (!character) continue;
    if (!member.authoredPosition) recordsById.set(character.id, { ...character, partyHoldingSpot: true });
    for (const position of member.positions) {
      if (position.kind !== "story") continue;
      const anchor = recordsById.get(position.anchorContentId);
      if (!anchor?.position) continue;
      recordsById.set(position.contentId, {
        ...placementAtAnchor(character, anchor),
        id: position.contentId,
        globalPlacement: false,
        partyHoldingSpot: false,
        partyPosition: { memberId: member.id, positionId: position.id, anchorContentId: anchor.id },
        provenance: mergeUnique(
          character.provenance,
          [...anchor.provenance, ...position.evidence.map(({ sourcePath, sourceLine }) => ({ sourcePath: sourceLine ? `${sourcePath}:${sourceLine}` : sourcePath }))],
          ({ sourcePath }) => sourcePath,
        ),
      });
    }
  }

  const inventoryOwnersByItemId = new Map();
  const storyOwnershipsByItemId = new Map(Object.entries(
    storyLocationRelationCatalog?.initialOwnershipsByItemId ?? {},
  ));
  for (const record of recordsById.values()) {
    if (record.placementKind !== "items") continue;
    const storyOwnerships = storyOwnershipsByItemId.get(record.id.toLocaleLowerCase("en-US")) ?? [];
    const storyOwnership = storyOwnerships.length === 1 ? storyOwnerships[0] : null;
    const ownerId = storyOwnership?.owner.id ?? record.ownerId;
    if (!ownerId || ownerId === EMPTY_GUID) continue;
    const owner = recordsById.get(ownerId);
    recordsById.set(record.id, {
      ...record,
      ownership: {
        kind: "crime-owner",
        ...(owner ? {
          ownerContentId: owner.id,
          ownerTitle: owner.displayName.en || humanizeInternalName(owner.internalName),
        } : storyOwnership ? {
          ownerContentId: storyOwnership.owner.id,
          ownerTitle: humanizeInternalName(storyOwnership.owner.name),
        } : {}),
        unauthorizedInteractionRisk: true,
        ...(storyOwnership ? {
          initiallyOwned: true,
          ownershipCanChange: storyOwnership.canChange,
        } : {}),
        evidence: storyOwnership ? storyLocationEvidence(storyOwnership) : record.provenance,
      },
    });
  }
  for (const owner of recordsById.values()) {
    for (const inventoryItem of owner.inventoryItems ?? []) {
      if (!inventoryItem.objectId || inventoryItem.objectId === EMPTY_GUID) continue;
      inventoryOwnersByItemId.set(inventoryItem.objectId, [
        ...(inventoryOwnersByItemId.get(inventoryItem.objectId) ?? []),
        { owner, inventoryItem },
      ]);
    }
  }
  for (const [itemId, ownerships] of inventoryOwnersByItemId) {
    const item = recordsById.get(itemId);
    if (!item) continue;
    // Story-destination copies keep their loot profile but never place carried
    // items, so every carried item keeps a single marker at its authored owner.
    const selectedOwnerships = ownerships.filter(({ owner }) => owner.position && !owner.storyDestination && matchesSelectedMap(owner));
    const uniqueOwners = [...new Map(selectedOwnerships.map((ownership) => [ownership.owner.id, ownership])).values()];
    if (uniqueOwners.length !== 1) continue;
    const { owner, inventoryItem } = uniqueOwners[0];
    recordsById.set(itemId, {
      ...placementAtAnchor(item, owner),
      itemLocation: {
        kind: "inventory-owner",
        ownerContentId: owner.id,
        ownerKind: owner.placementKind === "characters" ? "character" : "container",
        ownerTitle: owner.displayName.en || humanizeInternalName(owner.internalName),
        droppedOnDeath: inventoryItem.droppedOnDeath,
        pickpocketable: inventoryItem.canBePickpocketed,
        tradeable: inventoryItem.tradeable,
        evidence: owner.provenance,
      },
      provenance: mergeUnique(item.provenance, owner.provenance, ({ sourcePath }) => sourcePath),
    });
  }

  for (const relation of storyLocationRelationCatalog?.initialItemTransfers ?? []) {
    const item = recordsById.get(relation.item.id);
    const target = recordsById.get(relation.target.id);
    if (!item || item.itemLocation || !target?.position || !matchesSelectedMap(target)) continue;
    recordsById.set(relation.item.id, {
      ...placementAtAnchor(item, target),
      itemLocation: {
        kind: "initial-inventory",
        ownerContentId: target.id,
        ownerKind: target.placementKind === "characters" ? "character" : "container",
        ownerTitle: target.displayName.en || humanizeInternalName(target.internalName),
        droppedOnDeath: false,
        pickpocketable: false,
        tradeable: false,
        evidence: storyLocationEvidence(relation),
      },
      provenance: mergeUnique(item.provenance, storyLocationEvidence(relation), ({ sourcePath }) => sourcePath),
    });
  }

  for (const relation of storyLocationRelationCatalog?.itemOrigins ?? []) {
    const item = recordsById.get(relation.item.id);
    const source = recordsById.get(relation.source.id);
    if (!item) continue;
    const originAct = storyAct(relation);
    const sourceMatchesMap = source?.position && matchesSelectedMap(source);
    const sameAuthoredLevel = source?.level === item.level;
    const directAnchors = [...new Map((storyLocationRelationCatalog?.byCharacterId?.[relation.source.id] ?? [])
      .filter((locationRelation) => !originAct || storyAct(locationRelation) === originAct)
      .map((locationRelation) => recordsById.get(locationRelation.anchor.id))
      .filter((anchor) => anchor?.position && matchesSelectedMap(anchor))
      .map((anchor) => [anchor.id, anchor])).values()];
    const resolvedSource = sourceMatchesMap && (source.storyLocation || sameAuthoredLevel)
      ? source
      : directAnchors.length === 1 ? directAnchors[0] : null;
    recordsById.set(relation.item.id, {
      ...(resolvedSource ? placementAtAnchor(item, resolvedSource) : item),
      ...(!resolvedSource && relation.suppressAuthoredPosition && source ? { position: null } : {}),
      itemAcquisition: {
        kind: relation.kind,
        sourceContentId: relation.source.id,
        sourceTitle: (source?.displayName.en || humanizeInternalName(source?.internalName || relation.source.token))
          .replace(/^Player\s+/i, ""),
        dynamic: relation.dynamic,
        resolvedToSource: Boolean(resolvedSource),
        evidence: relation.evidence,
      },
      provenance: mergeUnique(item.provenance, storyLocationEvidence(relation), ({ sourcePath }) => sourcePath),
    });
  }

  const records = [...recordsById.values()]
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
  const recordsByInternalNameAll = records.reduce((index, record) => {
    if (!record.internalName) return index;
    index.set(record.internalName, [
      ...(index.get(record.internalName) ?? []),
      record,
    ]);
    return index;
  }, new Map());
  const recordsByTemplateId = records.reduce((index, record) => {
    if (!record.templateId) return index;
    index.set(record.templateId.toLocaleLowerCase("en-US"), [
      ...(index.get(record.templateId.toLocaleLowerCase("en-US")) ?? []),
      record,
    ]);
    return index;
  }, new Map());
  const recordTitle = (record, fallbackToken = "") => record?.displayName.en
    || humanizeInternalName(record?.internalName || fallbackToken.replace(/_[0-9a-f-]{36}$/i, ""));
  const resolveMechanismRecords = (endpoint) => {
    if (!endpoint) return [];
    const exactRecord = recordsById.get(endpoint.id);
    if (exactRecord) return [exactRecord];
    const internalName = endpoint.token.replace(/_[0-9a-f-]{36}$/i, "");
    return recordsByInternalNameAll.get(internalName) ?? [];
  };
  const resolveDialogueReward = (reward) => {
    const itemRecords = reward.kind === "placed-item"
      ? [recordsById.get(reward.itemId)].filter(Boolean)
      : recordsByTemplateId.get(reward.itemId) ?? [];
    const localizedTitles = Object.fromEntries([...new Set(itemRecords.flatMap((record) => Object.keys(record.displayName ?? {})))]
      .map((language) => [language, itemRecords.map((record) => record.displayName?.[language]).find(Boolean)])
      .filter(([, value]) => value));
    const gameplay = reward.kind === "template" ? findGameplayByItemIdentity({ templateId: reward.itemId })
      : itemRecords[0] ? findGameplay(itemRecords[0]) : null;
    return {
      ...reward,
      id: reward.id,
      kind: reward.kind,
      itemId: reward.itemId,
      itemInternalName: reward.itemInternalName,
      title: localizedTitles.en
        || reward.title
        || humanizeItemRequirementName(gameplay?.id || reward.itemInternalName),
      ...(Object.keys(localizedTitles).length > 0 ? { localizedTitles } : {}),
      amount: reward.amount,
      ...(gameplay ? { gameplay } : {}),
    };
  };
  const resolveDialogItemRequirement = (requirement, dialog) => {
    const itemRecords = recordsByTemplateId.get(requirement.itemTemplateId) ?? [];
    const localizedTitles = Object.fromEntries([...new Set(itemRecords.flatMap((record) => Object.keys(record.displayName ?? {})))]
      .map((language) => {
        const values = itemRecords.map((record) => record.displayName?.[language]).filter(Boolean);
        const counts = Map.groupBy(values, (value) => value);
        const title = [...counts.entries()].sort((left, right) => right[1].length - left[1].length
          || left[0].localeCompare(right[0], language))[0]?.[0];
        return [language, title];
      })
      .filter(([, value]) => value));
    const gameplay = findGameplayByItemIdentity({ templateId: requirement.itemTemplateId });
    const siblingRequirements = dialogItemRequirementCatalog?.byDialogResourceName?.[
      requirement.dialogResourceName.toLocaleLowerCase("en-US")
    ]?.filter((candidate) => candidate.itemTemplateId === requirement.itemTemplateId) ?? [requirement];
    return {
      id: `${requirement.dialogId}:${requirement.itemTemplateId}`,
      dialogId: requirement.dialogId,
      dialogTitle: dialog.title,
      itemTemplateId: requirement.itemTemplateId,
      title: localizedTitles.en
        || humanizeItemRequirementName(gameplay?.id || requirement.itemToken)
        || "Required item",
      ...(Object.keys(localizedTitles).length > 0 ? { localizedTitles } : {}),
      amount: Math.max(...siblingRequirements.map(({ amount }) => amount ?? 1)),
      evidence: siblingRequirements.map(({ evidence }) => evidence),
    };
  };
  const templateRecordScore = (record) => (
    (record.position ? 4 : 0)
    + (record.displayName.en ? 2 : 0)
    - (/(?:after|solved|active|inactive|destroyed|repaired)/i.test(record.internalName) ? 8 : 0)
  );
  const resolveCombinationRecords = (endpoint) => {
    if (endpoint.identityKind !== "template") {
      const record = recordsById.get(endpoint.id);
      return record ? [record] : [];
    }
    const templateRecords = recordsByTemplateId.get(endpoint.id) ?? [];
    const groups = new Map();
    for (const record of templateRecords) {
      const key = record.position
        ? [record.module, record.level, record.position.x.toFixed(2), record.position.y.toFixed(2), record.position.z.toFixed(2)].join(":")
        : record.id;
      const current = groups.get(key);
      if (!current || templateRecordScore(record) > templateRecordScore(current)) groups.set(key, record);
    }
    return [...groups.values()];
  };
  const puzzleCombinationProfiles = new Map();
  for (const combination of puzzleCombinationCatalog?.combinations ?? []) {
    const receptacleRecords = resolveCombinationRecords(combination.receptacle);
    const ingredientRecords = resolveCombinationRecords(combination.ingredient);
    for (const receptacleRecord of receptacleRecords) {
      for (const ingredientRecord of ingredientRecords) {
        if (receptacleRecord.id === ingredientRecord.id) continue;
        const relationshipId = combination.identityKind === "template"
          ? `${combination.id}:${receptacleRecord.id}:${ingredientRecord.id}`
          : combination.id;
        const receptacleProfile = puzzleCombinationProfiles.get(receptacleRecord.id) ?? {
          role: "receptacle",
          related: [],
        };
        receptacleProfile.related.push({
          combinationId: relationshipId,
          contentId: ingredientRecord.id,
          title: recordTitle(ingredientRecord, combination.ingredient.token),
          role: "ingredient",
        });
        puzzleCombinationProfiles.set(receptacleRecord.id, receptacleProfile);
        const ingredientProfile = puzzleCombinationProfiles.get(ingredientRecord.id) ?? {
          role: "ingredient",
          related: [],
        };
        ingredientProfile.related.push({
          combinationId: relationshipId,
          contentId: receptacleRecord.id,
          title: recordTitle(receptacleRecord, combination.receptacle.token),
          role: "receptacle",
        });
        puzzleCombinationProfiles.set(ingredientRecord.id, ingredientProfile);
      }
    }
  }
  const mechanismProfiles = new Map();
  let resolvedMechanismLinkCount = 0;
  for (const link of mechanismLinkCatalog?.links ?? []) {
    const controllerRecord = recordsById.get(link.controller.id);
    const targetRecord = recordsById.get(link.target.id);
    if (!controllerRecord || !targetRecord) continue;
    resolvedMechanismLinkCount += 1;
    const controllerProfile = mechanismProfiles.get(controllerRecord.id) ?? {
      role: "controller",
      controllerKind: link.controllerKind,
      related: [],
    };
    controllerProfile.related.push({
      linkId: link.id,
      contentId: targetRecord.id,
      title: recordTitle(targetRecord, link.target.token),
      role: "target",
      controllerKind: link.controllerKind,
      targetKind: link.targetKind,
      action: link.action,
    });
    mechanismProfiles.set(controllerRecord.id, controllerProfile);
    const targetProfile = mechanismProfiles.get(targetRecord.id) ?? {
      role: "target",
      controllerKind: link.controllerKind,
      related: [],
    };
    targetProfile.related.push({
      linkId: link.id,
      contentId: controllerRecord.id,
      title: recordTitle(controllerRecord, link.controller.token),
      role: "controller",
      controllerKind: link.controllerKind,
      targetKind: link.targetKind,
      action: link.action,
    });
    mechanismProfiles.set(targetRecord.id, targetProfile);
  }
  // Suppressing dialogue presentation must not erase authored interactive
  // objects. Narrator registrations prove an interaction independently of an
  // item's Stats family (a plaque may override its readable root's Stats).
  const narratedObjectIds = new Set((storyInteractionCatalog?.entries ?? [])
    .filter((entry) => entry.triggerPredicates.includes("DB_ItemDialog_NarratorAD")
      && entry.outcomes.some((outcome) => outcome.kind === "starts-dialogue"))
    .map((entry) => entry.objectId));
  const storyInteractionProfiles = new Map((storyInteractionCatalog?.entries ?? []).map((entry) => {
    const nonDialogueOutcomes = entry.outcomes.filter((outcome) => outcome.kind !== "starts-dialogue");
    return [entry.objectId, {
      triggerPredicates: entry.triggerPredicates,
      outcomes: nonDialogueOutcomes.map((outcome) => {
        if (outcome.target) {
          const targetRecord = recordsById.get(outcome.target.id);
          return {
            kind: outcome.kind,
            targetContentId: outcome.target.id,
            targetTitle: recordTitle(targetRecord, outcome.target.token),
          };
        }
        return {
          kind: outcome.kind,
          questId: outcome.questId,
          stateId: outcome.stateId,
        };
      }),
      evidence: entry.evidence,
    }];
  }).filter(([, profile]) => profile.outcomes.length > 0));
  const storyOwnershipZoneProfiles = new Map((storyOwnershipZoneCatalog?.entries ?? []).map((entry) => [
    entry.triggerId,
    {
      levels: entry.levels,
      owners: entry.owners.map((owner) => ({
        contentId: owner.id,
        title: recordTitle(recordsById.get(owner.id), owner.token),
        conditional: owner.conditional,
        fallback: owner.fallback,
        shopOwner: entry.shopOwners.some(({ id }) => id === owner.id),
      })),
      evidence: entry.evidence,
    },
  ]));
  for (const effect of mechanismLinkCatalog?.effects ?? []) {
    for (const record of resolveMechanismRecords(effect.object)) {
      const profile = mechanismProfiles.get(record.id) ?? {
        role: "controller",
        controllerKind: effect.controllerKind,
        related: [],
      };
      profile.effects = profile.effects ?? [];
      profile.effects.push({
        effectId: effect.id,
        controllerKind: effect.controllerKind,
        action: effect.action,
      });
      mechanismProfiles.set(record.id, profile);
    }
  }
  for (const movement of mechanismLinkCatalog?.movements ?? []) {
    const record = recordsById.get(movement.object.id);
    const destinationRecord = recordsById.get(movement.destination.id);
    if (!record || !destinationRecord) continue;
    const profile = mechanismProfiles.get(record.id) ?? {
      role: "moving-object",
      controllerKind: "moving-object",
      related: [],
    };
    profile.movements = profile.movements ?? [];
    profile.movements.push({
      movementId: movement.id,
      action: movement.action,
      destinationContentId: destinationRecord.id,
      destinationTitle: recordTitle(destinationRecord, movement.destination.token),
    });
    mechanismProfiles.set(record.id, profile);
  }
  for (const sequence of mechanismLinkCatalog?.sequences ?? []) {
    const stepRecords = sequence.steps.map(({ object }) => recordsById.get(object.id));
    const resultRecord = recordsById.get(sequence.result.object.id);
    if (!resultRecord || stepRecords.some((record) => !record)) continue;
    const shared = {
      puzzleId: sequence.id,
      title: sequence.title,
      ...(sequence.solution ? { solution: sequence.solution } : {}),
      steps: sequence.steps.map((step, index) => ({
        order: step.order,
        contentId: step.object.id,
        title: step.title ?? recordTitle(stepRecords[index], step.object.token),
        ...(step.clue ? { clue: step.clue } : {}),
      })),
      result: {
        contentId: resultRecord.id,
        title: recordTitle(resultRecord, sequence.result.object.token),
        action: sequence.result.action,
      },
    };
    sequence.steps.forEach((step) => {
      const profile = mechanismProfiles.get(step.object.id);
      if (!profile) return;
      profile.sequence = { ...shared, role: "step", currentStep: step.order };
    });
    const resultProfile = mechanismProfiles.get(resultRecord.id) ?? {
      role: "target",
      controllerKind: "plaque",
      related: [],
    };
    resultProfile.sequence = { ...shared, role: "result" };
    mechanismProfiles.set(resultRecord.id, resultProfile);
  }
  const secretPuzzleProfiles = new Map();
  for (const puzzle of secretPuzzleCatalog?.puzzles ?? []) {
    const targetRecord = recordsById.get(puzzle.target.objectId);
    const stones = puzzle.pairs.map(({ stone }) => recordsById.get(stone.objectId)).filter(Boolean);
    const buttons = puzzle.pairs.map(({ button }) => recordsById.get(button.objectId)).filter(Boolean);
    if (!targetRecord || stones.length !== puzzle.pairs.length || buttons.length !== puzzle.pairs.length) continue;
    const common = {
      id: puzzle.id,
      title: puzzle.title,
      kind: puzzle.kind,
      requiredButtonCount: puzzle.requiredButtonCount,
      stones: stones.map((stone, index) => ({ contentId: stone.id, title: recordTitle(stone, puzzle.pairs[index].stone.token) })),
      buttons: buttons.map((button, index) => ({ contentId: button.id, title: recordTitle(button, puzzle.pairs[index].button.token) })),
      target: { contentId: targetRecord.id, title: recordTitle(targetRecord, puzzle.target.token) },
    };
    for (let index = 0; index < stones.length; index += 1) {
      secretPuzzleProfiles.set(stones[index].id, { ...common, role: "stone", pairIndex: index });
      secretPuzzleProfiles.set(buttons[index].id, { ...common, role: "button", pairIndex: index });
    }
    secretPuzzleProfiles.set(targetRecord.id, { ...common, role: "target" });
  }
  const wyrmwayPuzzleProfiles = new Map();
  if (wyrmwayPuzzleCatalog?.chess) {
    const anchorRecord = recordsById.get(wyrmwayPuzzleCatalog.chess.anchor.objectId);
    if (anchorRecord) wyrmwayPuzzleProfiles.set(anchorRecord.id, {
      kind: "chess",
      role: "anchor",
      id: wyrmwayPuzzleCatalog.chess.id,
      title: wyrmwayPuzzleCatalog.chess.title,
      variants: wyrmwayPuzzleCatalog.chess.variants.map(({ variant, moves }) => ({
        variant,
        moves: moves.map(({ step, from, to }) => ({ step, from, to })),
      })),
    });
  }
  if (wyrmwayPuzzleCatalog?.insight) {
    const anchorRecord = recordsById.get(wyrmwayPuzzleCatalog.insight.anchor.objectId);
    const suspects = wyrmwayPuzzleCatalog.insight.suspects.map((suspect) => {
      const record = recordsById.get(suspect.objectId);
      return record ? {
        contentId: record.id,
        title: recordTitle(record, suspect.token),
        correct: suspect.correct,
      } : null;
    }).filter(Boolean);
    const evidenceBooks = wyrmwayPuzzleCatalog.insight.evidenceBooks.map(({ bird, book }) => {
      const birdRecord = recordsById.get(bird.objectId);
      const bookRecord = recordsById.get(book.objectId);
      return birdRecord && bookRecord ? {
        birdContentId: birdRecord.id,
        birdTitle: recordTitle(birdRecord, bird.token),
        bookContentId: bookRecord.id,
        bookTitle: recordTitle(bookRecord, book.token),
      } : null;
    }).filter(Boolean);
    if (anchorRecord && suspects.length === 3) {
      const common = {
        kind: "insight",
        id: wyrmwayPuzzleCatalog.insight.id,
        title: wyrmwayPuzzleCatalog.insight.title,
        suspects,
        evidenceBooks,
      };
      wyrmwayPuzzleProfiles.set(anchorRecord.id, { ...common, role: "anchor" });
      for (const suspect of suspects) {
        wyrmwayPuzzleProfiles.set(suspect.contentId, { ...common, role: "suspect", currentSuspectId: suspect.contentId });
      }
    }
  }
  if (wyrmwayPuzzleCatalog?.justice) {
    const anchorRecord = recordsById.get(wyrmwayPuzzleCatalog.justice.anchor.objectId);
    const paintings = wyrmwayPuzzleCatalog.justice.paintings.map(({ painting, solvedPainting, fallbackTitle, correct }) => {
      const record = recordsById.get(painting.objectId);
      const solvedRecord = recordsById.get(solvedPainting.objectId);
      return record ? {
        contentId: record.id,
        title: record.displayName?.en || solvedRecord?.displayName?.en || fallbackTitle || recordTitle(record, painting.token),
        correct,
      } : null;
    }).filter(Boolean);
    if (anchorRecord && paintings.length === 3) {
      const common = {
        kind: "justice",
        id: wyrmwayPuzzleCatalog.justice.id,
        title: wyrmwayPuzzleCatalog.justice.title,
        paintings,
      };
      wyrmwayPuzzleProfiles.set(anchorRecord.id, { ...common, role: "anchor" });
      for (const painting of paintings) {
        wyrmwayPuzzleProfiles.set(painting.contentId, { ...common, role: "painting", currentPaintingId: painting.contentId });
      }
    }
  }
  if (wyrmwayPuzzleCatalog?.courage) {
    const anchorRecord = recordsById.get(wyrmwayPuzzleCatalog.courage.anchor.objectId);
    const enemies = wyrmwayPuzzleCatalog.courage.enemies.map(({ phase, enemy }) => {
      const record = recordsById.get(enemy.objectId);
      return record ? {
        contentId: record.id,
        title: recordTitle(record, enemy.token),
        phase,
      } : null;
    }).filter(Boolean);
    if (anchorRecord && enemies.length === 8) {
      wyrmwayPuzzleProfiles.set(anchorRecord.id, {
        kind: "courage",
        role: "anchor",
        id: wyrmwayPuzzleCatalog.courage.id,
        title: wyrmwayPuzzleCatalog.courage.title,
        timer: wyrmwayPuzzleCatalog.courage.timer,
        enemies,
      });
    }
  }
  const crechePuzzleProfiles = new Map();
  if (crechePuzzleCatalog?.statuePuzzle) {
    const statues = crechePuzzleCatalog.statuePuzzle.statues.map(({ statue, role, minRotationY, maxRotationY }) => {
      const record = recordsById.get(statue.objectId);
      return record ? {
        contentId: record.id,
        title: role === "sunrise" ? "Sunrise Statue" : "Sunset Statue",
        role,
        minRotationY,
        maxRotationY,
      } : null;
    }).filter(Boolean);
    const clueBookRecord = recordsById.get(crechePuzzleCatalog.statuePuzzle.clueBook.objectId);
    const resultDoorRecord = recordsById.get(crechePuzzleCatalog.statuePuzzle.resultDoor.objectId);
    if (statues.length === 2 && clueBookRecord && resultDoorRecord) {
      const common = {
        kind: "statues",
        id: crechePuzzleCatalog.statuePuzzle.id,
        title: crechePuzzleCatalog.statuePuzzle.title,
        statues,
        clueBook: { contentId: clueBookRecord.id, title: recordTitle(clueBookRecord, crechePuzzleCatalog.statuePuzzle.clueBook.token) },
        rotationStepDegrees: crechePuzzleCatalog.statuePuzzle.rotationStepDegrees,
        stuckSunsetSolutions: crechePuzzleCatalog.statuePuzzle.stuckSunsetSolutions,
        resultDoor: { contentId: resultDoorRecord.id, title: "Secret Door" },
      };
      for (const statue of statues) crechePuzzleProfiles.set(statue.contentId, { ...common, role: "statue", currentObjectId: statue.contentId });
      crechePuzzleProfiles.set(clueBookRecord.id, { ...common, role: "clue" });
      crechePuzzleProfiles.set(resultDoorRecord.id, { ...common, role: "result" });
    }
  }
  if (crechePuzzleCatalog?.weaponsPuzzle) {
    const pedestals = crechePuzzleCatalog.weaponsPuzzle.pedestals.map((pedestal) => {
      const plaqueRecord = recordsById.get(pedestal.plaque.objectId);
      const weaponRecord = recordsById.get(pedestal.ceremonialWeapon.objectId);
      return plaqueRecord && weaponRecord ? {
        index: pedestal.index,
        plaqueContentId: plaqueRecord.id,
        plaqueTitle: `Dawnmaster Pedestal ${pedestal.index}`,
        weaponType: pedestal.weaponType,
        ceremonialWeaponContentId: weaponRecord.id,
        ceremonialWeaponTitle: recordTitle(weaponRecord, pedestal.ceremonialWeapon.token),
        preSolved: pedestal.preSolved,
      } : null;
    }).filter(Boolean);
    const rewardContainerRecord = recordsById.get(crechePuzzleCatalog.weaponsPuzzle.reward.container.objectId);
    const rewardDoorRecord = recordsById.get(crechePuzzleCatalog.weaponsPuzzle.reward.hiddenDoor.objectId);
    if (pedestals.length === 4 && rewardContainerRecord && rewardDoorRecord) {
      const common = {
        kind: "weapons",
        id: crechePuzzleCatalog.weaponsPuzzle.id,
        title: crechePuzzleCatalog.weaponsPuzzle.title,
        pedestals,
        acceptsGenericWeapons: crechePuzzleCatalog.weaponsPuzzle.acceptsGenericWeapons,
        incorrectWeaponPenalty: crechePuzzleCatalog.weaponsPuzzle.incorrectWeaponPenalty,
        reward: {
          containerContentId: rewardContainerRecord.id,
          containerTitle: "Hidden Reward",
          doorContentId: rewardDoorRecord.id,
          doorTitle: "Hidden Compartment",
        },
      };
      for (const pedestal of pedestals) {
        crechePuzzleProfiles.set(pedestal.plaqueContentId, { ...common, role: "pedestal", currentPedestalIndex: pedestal.index });
        crechePuzzleProfiles.set(pedestal.ceremonialWeaponContentId, { ...common, role: "ceremonial-weapon", currentPedestalIndex: pedestal.index });
      }
      crechePuzzleProfiles.set(rewardContainerRecord.id, { ...common, role: "reward" });
      crechePuzzleProfiles.set(rewardDoorRecord.id, { ...common, role: "result" });
    }
  }
  const arcaneTowerTransportProfiles = new Map();
  if (arcaneTowerTransportCatalog) {
    const routes = arcaneTowerTransportCatalog.routes.map(({ button, atFloor, toFloor, destination, hidden }) => {
      const buttonRecord = recordsById.get(button.objectId);
      const destinationRecord = recordsById.get(destination.objectId);
      return buttonRecord && destinationRecord ? {
        buttonContentId: buttonRecord.id,
        buttonTitle: `Lift Button ${atFloor} → ${toFloor}`,
        atFloor,
        toFloor,
        destinationContentId: destinationRecord.id,
        destinationTitle: `Level ${toFloor} Arrival`,
        hidden,
      } : null;
    }).filter(Boolean);
    const generatorRecord = recordsById.get(arcaneTowerTransportCatalog.generator.objectId);
    const ringRecord = recordsById.get(arcaneTowerTransportCatalog.secretRing.objectId);
    if (routes.length === 12 && generatorRecord && ringRecord) {
      const common = {
        id: arcaneTowerTransportCatalog.id,
        title: arcaneTowerTransportCatalog.title,
        powerIngredient: arcaneTowerTransportCatalog.powerIngredient,
        blockedArcanaDc: arcaneTowerTransportCatalog.blockedArcanaDc,
        generator: { contentId: generatorRecord.id, title: recordTitle(generatorRecord, arcaneTowerTransportCatalog.generator.token) },
        secretRing: { contentId: ringRecord.id, title: arcaneTowerTransportCatalog.secretRingTitle || recordTitle(ringRecord, arcaneTowerTransportCatalog.secretRing.token) },
        routes,
      };
      for (const route of routes) {
        arcaneTowerTransportProfiles.set(route.buttonContentId, { ...common, role: "button", currentButtonId: route.buttonContentId });
      }
      for (const floor of arcaneTowerTransportCatalog.floors) {
        const destinationRecord = recordsById.get(floor.destination.objectId);
        if (destinationRecord) arcaneTowerTransportProfiles.set(destinationRecord.id, { ...common, role: "destination", currentFloor: floor.floor });
      }
      arcaneTowerTransportProfiles.set(generatorRecord.id, { ...common, role: "generator" });
      arcaneTowerTransportProfiles.set(ringRecord.id, { ...common, role: "secret-ring" });
    }
  }
  const sharEntrancePuzzleProfiles = new Map();
  if (sharEntrancePuzzleCatalog) {
    const centralRecord = recordsById.get(sharEntrancePuzzleCatalog.centralSwitch.objectId);
    const churchDoorRecord = recordsById.get(sharEntrancePuzzleCatalog.results.removesArcaneLockFrom.objectId);
    const westDoorRecord = recordsById.get(sharEntrancePuzzleCatalog.results.unlocksAndOpens.objectId);
    const braziers = sharEntrancePuzzleCatalog.braziers.map(({ brazier, corner }) => {
      const record = recordsById.get(brazier.objectId);
      return record ? { record, corner } : null;
    }).filter(Boolean);
    if (centralRecord && churchDoorRecord && westDoorRecord && braziers.length === 8) {
      const common = {
        id: sharEntrancePuzzleCatalog.id,
        title: sharEntrancePuzzleCatalog.title,
        braziers: sharEntrancePuzzleCatalog.stats.braziers,
        corners: sharEntrancePuzzleCatalog.stats.corners,
        lightDetectors: sharEntrancePuzzleCatalog.stats.lightDetectors,
        barrierRings: sharEntrancePuzzleCatalog.stats.barrierRings,
        hazards: sharEntrancePuzzleCatalog.hazards,
        centralSwitch: { contentId: centralRecord.id, title: "Central Ring Switch" },
        results: [
          { contentId: churchDoorRecord.id, title: recordTitle(churchDoorRecord, sharEntrancePuzzleCatalog.results.removesArcaneLockFrom.token), effect: "removes-arcane-lock" },
          { contentId: westDoorRecord.id, title: recordTitle(westDoorRecord, sharEntrancePuzzleCatalog.results.unlocksAndOpens.token), effect: "unlocks-and-opens" },
        ],
      };
      sharEntrancePuzzleProfiles.set(centralRecord.id, { ...common, role: "central-switch" });
      for (const { record, corner } of braziers) {
        sharEntrancePuzzleProfiles.set(record.id, { ...common, role: "brazier", corner });
      }
      sharEntrancePuzzleProfiles.set(churchDoorRecord.id, { ...common, role: "result-door" });
      sharEntrancePuzzleProfiles.set(westDoorRecord.id, { ...common, role: "result-door" });
    }
  }
  const balthazarSecretRoomProfiles = new Map();
  if (balthazarSecretRoomCatalog) {
    const books = balthazarSecretRoomCatalog.books.map(({ book, effect }) => {
      const record = recordsById.get(book.objectId);
      return record ? { contentId: record.id, title: recordTitle(record, book.token), effect } : null;
    }).filter(Boolean);
    const heartAltarRecord = recordsById.get(balthazarSecretRoomCatalog.heartAltar.objectId);
    const secretDoorRecord = recordsById.get(balthazarSecretRoomCatalog.secretDoor.objectId);
    const secretResearchRecord = recordsById.get(balthazarSecretRoomCatalog.secretResearch.objectId);
    if (books.length === 4 && heartAltarRecord && secretDoorRecord && secretResearchRecord) {
      const common = {
        id: balthazarSecretRoomCatalog.id,
        title: balthazarSecretRoomCatalog.title,
        books,
        heartAltar: { contentId: heartAltarRecord.id, title: "Heart Altar" },
        acceptsAnyBodyPart: balthazarSecretRoomCatalog.acceptsAnyBodyPart,
        secretDoor: { contentId: secretDoorRecord.id, title: "Secret Bookcase Door" },
        secretResearch: { contentId: secretResearchRecord.id, title: recordTitle(secretResearchRecord, balthazarSecretRoomCatalog.secretResearch.token) },
      };
      for (const book of books) balthazarSecretRoomProfiles.set(book.contentId, { ...common, role: "book", currentBookId: book.contentId });
      balthazarSecretRoomProfiles.set(heartAltarRecord.id, { ...common, role: "altar" });
      balthazarSecretRoomProfiles.set(secretDoorRecord.id, { ...common, role: "door" });
      balthazarSecretRoomProfiles.set(secretResearchRecord.id, { ...common, role: "research" });
    }
  }
  const minscSluicePuzzleProfiles = new Map();
  if (minscSluicePuzzleCatalog) {
    const valves = minscSluicePuzzleCatalog.valves.map((entry) => {
      const valveRecord = recordsById.get(entry.valve.objectId);
      const indicatorRecord = recordsById.get(entry.indicator.objectId);
      if (!valveRecord || !indicatorRecord) return null;
      return {
        kind: entry.kind,
        valveContentId: valveRecord.id,
        valveTitle: recordTitle(valveRecord, entry.valve.token),
        indicatorContentId: indicatorRecord.id,
        indicatorTitle: entry.kind === "water" ? "Water Level Gauge" : "Temperature Gauge",
        incrementSeconds: entry.incrementTimer.durationSeconds,
        stages: entry.stages.map(({ stage, durationSeconds }) => ({ stage, durationSeconds })),
      };
    }).filter(Boolean);
    const gates = minscSluicePuzzleCatalog.gates.map(({ gate }) => {
      const record = recordsById.get(gate.objectId);
      return record ? { contentId: record.id, title: recordTitle(record, gate.token) } : null;
    }).filter(Boolean);
    const forceValves = minscSluicePuzzleCatalog.forceValves.map(({ valve }) => {
      const record = recordsById.get(valve.objectId);
      return record ? { contentId: record.id, title: recordTitle(record, valve.token) } : null;
    }).filter(Boolean);
    const releaseValveRecord = recordsById.get(minscSluicePuzzleCatalog.releaseValve.objectId);
    const disabledValveRecords = minscSluicePuzzleCatalog.disabledValves.map((valve) => recordsById.get(valve.objectId)).filter(Boolean);
    if (valves.length === 2 && gates.length === 2 && forceValves.length === 2 && releaseValveRecord && disabledValveRecords.length === 1) {
      const common = {
        id: minscSluicePuzzleCatalog.id,
        title: minscSluicePuzzleCatalog.title,
        solutionStage: minscSluicePuzzleCatalog.solutionStage,
        valves,
        gates,
        forceValves,
        forceCheck: minscSluicePuzzleCatalog.forceCheck,
        releaseValve: { contentId: releaseValveRecord.id, title: recordTitle(releaseValveRecord, minscSluicePuzzleCatalog.releaseValve.token) },
        disabledValves: disabledValveRecords.map((record, index) => ({
          contentId: record.id,
          title: recordTitle(record, minscSluicePuzzleCatalog.disabledValves[index].token),
        })),
        elementalAdjustment: minscSluicePuzzleCatalog.elementalAdjustment,
        overload: minscSluicePuzzleCatalog.overload,
      };
      for (const valve of valves) {
        minscSluicePuzzleProfiles.set(valve.valveContentId, { ...common, role: "valve", currentValveKind: valve.kind });
        minscSluicePuzzleProfiles.set(valve.indicatorContentId, { ...common, role: "indicator", currentValveKind: valve.kind });
      }
      for (const gate of gates) minscSluicePuzzleProfiles.set(gate.contentId, { ...common, role: "gate" });
      for (const valve of forceValves) minscSluicePuzzleProfiles.set(valve.contentId, { ...common, role: "force-valve" });
      minscSluicePuzzleProfiles.set(releaseValveRecord.id, { ...common, role: "release-valve" });
      for (const valve of disabledValveRecords) minscSluicePuzzleProfiles.set(valve.id, { ...common, role: "disabled-valve" });
    }
  }
  const inventoryItemProfile = createInventoryItemProfiler({
    objectForId: (id) => {
      const item = recordsById.get(id);
      return item ? { ...item, statsId: item.stats } : undefined;
    },
    templateForId: (id) => rootTemplateCatalog?.templates?.[id],
    statForId: (id) => gameplayCatalog?.entries?.[id],
    fallbackTitle: (id) => localizedGameplayTitle(id) || humanizeInternalName(id),
  });
  const findDeathLoot = (record) => {
    const guaranteedDrops = (record.inventoryItems ?? [])
      .filter(({ droppedOnDeath }) => droppedOnDeath)
      .map((drop) => {
        return {
          ...inventoryItemProfile(drop),
          amount: drop.amount,
          ...(drop.inventoryCondition ? { inventoryCondition: drop.inventoryCondition } : {}),
          canBePickpocketed: drop.canBePickpocketed,
          guaranteedOnDeath: true,
        };
      });
    const treasureTables = [...new Set(record.treasureTables ?? [])];
    if (guaranteedDrops.length === 0 && treasureTables.length === 0) return null;
    return {
      guaranteedDrops,
      treasureTables,
      randomLootPools: treasureTables.map(mapTreasurePool),
    };
  };
  const equipmentInput = arguments_.has("equipment-item-catalog")
    ? readVerifiedEquipmentItemCatalog(path.resolve(arguments_.get("equipment-item-catalog")), path.resolve(import.meta.dirname, "..")) : null;
  const equipmentProfiler = equipmentInput ? createEquipmentLootProfiler(equipmentInput) : null;
  const nativeEquipment = equipmentInput ? createNativeCharacterEquipmentResolver({ projectRoot: path.resolve(import.meta.dirname, ".."),
    placementRoots: [placementsRoot, ...supplementaryPlacementRoots], templates: rootTemplateCatalog.templates,
    members: partyMemberCatalog?.members ?? [] }) : null;
  const findContainerLoot = (record) => {
    if (record.placementKind !== "items"
      || ((record.inventoryItems?.length ?? 0) === 0 && (record.inventoryTables?.length ?? 0) === 0)) return null;
    const items = record.inventoryItems.map((item) => {
      return {
        ...inventoryItemProfile(item),
        amount: Number(item.amount) || 1,
        tradeable: item.tradeable,
        ...(item.inventoryCondition ? { inventoryCondition: item.inventoryCondition } : {}),
        difficulties: item.difficulties,
      };
    });
    return {
      items: [...items.reduce((groups, item) => {
        const key = JSON.stringify([item.itemName, item.objectId, item.templateId, item.statsId,
          item.difficulties, item.tradeable, item.inventoryCondition]);
        const current = groups.get(key);
        groups.set(key, current ? { ...current, amount: current.amount + item.amount } : item);
        return groups;
      }, new Map()).values()],
      randomLootPools: [...new Set(record.inventoryTables ?? [])].map(mapTreasurePool),
    };
  };
  const adamantineRecipes = (adamantineForgeCatalog?.recipes ?? []).map((recipe) => {
    const gameplay = findGameplayByItemIdentity({ templateId: recipe.resultTemplateId });
    return {
      id: recipe.id,
      title: recipe.title,
      statId: recipe.statId,
      resultTemplateId: recipe.resultTemplateId,
      moldTemplateId: recipe.moldTemplateId,
      ...(gameplay ? { gameplay } : {}),
    };
  });
  const findAdamantineForge = (record) => {
    if (!adamantineForgeCatalog) return null;
    const forgeObjectIds = new Set([
      adamantineForgeCatalog.forge?.objectId,
      adamantineForgeCatalog.moldChamber?.objectId,
      adamantineForgeCatalog.forgeAnchor?.objectId,
      adamantineForgeCatalog.mapAnchor?.objectId,
    ].filter(Boolean));
    if (forgeObjectIds.has(record.id)) return { role: "forge", recipes: adamantineRecipes };
    const moldRecipe = adamantineRecipes.find(({ moldTemplateId }) => moldTemplateId === record.templateId);
    if (moldRecipe) return { role: "mold", recipes: [moldRecipe] };
    if (record.stats === adamantineForgeCatalog.mithralOre?.statsId
      || adamantineForgeCatalog.mithralOre?.veins?.some(({ objectId }) => objectId === record.id)) {
      return { role: "ore", recipes: [] };
    }
    return null;
  };
  const projectedCandidates = records
    .map((record) => {
      const override = candidatePositionOverrides.get(record.id.toLocaleLowerCase("en-US"));
      return override ? {
        ...record,
        authoredPosition: record.position,
        position: override,
        curatedPosition: true,
      } : record;
    })
    .filter((record) => record.position)
    .filter((record) => !excludedObjectIds.has(record.id.toLocaleLowerCase("en-US")))
    .filter((record) => forcedObjectIds.has(record.id.toLocaleLowerCase("en-US"))
      || ((minimumHeight === null || record.position.y >= minimumHeight)
        && (maximumHeight === null || record.position.y <= maximumHeight)))
    .filter((record) => selectedLevels.size === 0 && !levelPattern
      ? true
      : selectedLevels.has(record.level) || levelPattern?.test(record.level))
    .filter((record) => {
      if (!floorSelection) return true;
      const portal = findNavigationPortal(record);
      return matchesFloor(portal?.sourcePosition ?? record.position);
    })
    .filter((record) => !includeNamePattern || includeNamePattern.test([
      record.internalName,
      record.stats,
      record.type,
    ].filter(Boolean).join(" ")))
    .filter((record) => !excludeNamePattern || !excludeNamePattern.test([
      record.internalName,
      record.stats,
      record.type,
    ].filter(Boolean).join(" ")))
    .filter((record) => {
      if (isWithinReference(record.position, coordinateReference)) return true;
      // A door's model pivot can sit just outside the raster while its own
      // navigation endpoint is inside. Keep it for the existing silhouette
      // tolerance check; do not move its authored world position or bypass
      // the reviewed anchoring/rejection rules below.
      const portal = findNavigationPortal(record);
      return portal && isWithinReference(portal.sourcePosition, coordinateReference);
    })
    .filter((record) => !record.partyHoldingSpot)
    .map((record) => {
      const gameplay = findGameplay(record);
      const partyMember = findPartyMember(record);
      const speakWithDead = findCorpseDialogue(record);
      const quest = findQuest(record);
      const worldChecks = findWorldChecks(record);
      const inspirations = findInspirations(record);
      const authoredDeathLoot = record.placementKind === "characters" ? findDeathLoot(record) : null;
      const equipment = equipmentProfiler && record.placementKind === "characters"
        ? equipmentProfiler({ ...record, partyMember, deathLoot: authoredDeathLoot }, nativeEquipment.resolve({ ...record, partyMember })) : null;
      const equipped = applyEquipmentLootProfile({ ...record, deathLoot: authoredDeathLoot }, equipment);
      const deathLoot = equipped.deathLoot;
      const containerLoot = findContainerLoot(record);
      const puzzleCombinations = puzzleCombinationProfiles.get(record.id);
      const readableImpact = findReadableImpact(record);
      const itemStoryImpact = findItemStoryImpact(record);
      const itemCategory = findItemCategory(record);
      const alchemyCraftItem = record.placementKind === "items" && !record.itemLocation
        && gameplayChain(gameplay).some((id) => /^(?:_Alchemy(?:_|$)|ALCH_(?:Ingredient|Extract)(?:_|$))/i.test(id));
      const readableFilterCategory = inferReadableFilterCategory(record, itemCategory, Boolean(
        record.flags.storyItem
        || readableImpact
        || itemStoryImpact?.highValue
        || record.recipeIds.length > 0,
      ));
      const painting = isDisplayablePainting(record);
      const diggableSecret = diggableSecretCatalog?.byObjectId?.[record.id];
      const buriedChestRecord = diggableSecret?.buriedChest
        ? recordsById.get(diggableSecret.buriedChest.objectId)
        : null;
      const buriedChestLoot = buriedChestRecord ? findContainerLoot(buriedChestRecord) : null;
      const mechanism = mechanismProfiles.get(record.id);
      const adamantineForge = findAdamantineForge(record);
      const secretPuzzle = secretPuzzleProfiles.get(record.id);
      const wyrmwayPuzzle = wyrmwayPuzzleProfiles.get(record.id);
      const crechePuzzle = crechePuzzleProfiles.get(record.id);
      const arcaneTowerTransport = arcaneTowerTransportProfiles.get(record.id);
      const sharEntrancePuzzle = sharEntrancePuzzleProfiles.get(record.id);
      const balthazarSecretRoom = balthazarSecretRoomProfiles.get(record.id);
      const minscSluicePuzzle = minscSluicePuzzleProfiles.get(record.id);
      const storySecretDoor = storySecretDoorCatalog?.byObjectId?.[record.id];
      const storyInteraction = storyInteractionProfiles.get(record.id);
      const storyOwnershipZone = storyOwnershipZoneProfiles.get(record.id);
      const directTrapDifficulty = /^\d+$/.test(record.disarmDifficultyClassId)
        ? Number(record.disarmDifficultyClassId)
        : null;
      const trapDifficulty = isUsableDifficultyId(record.disarmDifficultyClassId)
        && directTrapDifficulty === null
        ? difficultyClasses.get(record.disarmDifficultyClassId)
        : null;
      const trap = record.flags.isTrap || directTrapDifficulty !== null || trapDifficulty ? {
        type: inferTrapType(record),
        authoredTrapFlag: record.flags.isTrap,
        ...(isUsableDifficultyId(record.disarmDifficultyClassId) && directTrapDifficulty === null
          ? { difficultyClassId: record.disarmDifficultyClassId }
          : {}),
        ...(trapDifficulty?.name ? { difficultyClassName: trapDifficulty.name } : {}),
        ...(directTrapDifficulty !== null
          ? { difficultyClass: directTrapDifficulty }
          : trapDifficulty?.value !== undefined ? { difficultyClass: trapDifficulty.value } : {}),
      } : null;
      const storyRisks = findStoryRisks(record);
      const permanentBonuses = findPermanentBonuses(record);
      const rescuePlan = findRescuePlan(record);
      const navigationPortal = findNavigationPortal(record, recordsById);
      const curatedTitles = candidateTitleOverrides.get(record.id.toLocaleLowerCase("en-US"));
      const crecheTitleOverride = crechePuzzle?.kind === "statues"
        ? crechePuzzle.role === "statue"
          ? crechePuzzle.statues.find(({ contentId }) => contentId === record.id)?.title
          : crechePuzzle.role === "clue" ? "Lathander Statue Clue" : "Lathander Secret Door"
        : crechePuzzle?.kind === "weapons"
          ? crechePuzzle.role === "pedestal"
            ? crechePuzzle.pedestals.find(({ index }) => index === crechePuzzle.currentPedestalIndex)?.plaqueTitle
            : crechePuzzle.role === "reward" ? "Dawnmaster's Crest Reward"
              : crechePuzzle.role === "result" ? "Hidden Dawnmaster Compartment" : null
          : null;
      const arcaneTowerTitleOverride = arcaneTowerTransport?.role === "button"
        ? arcaneTowerTransport.routes.find(({ buttonContentId }) => buttonContentId === record.id)?.buttonTitle
        : arcaneTowerTransport?.role === "destination" ? `Arcane Lift Level ${arcaneTowerTransport.currentFloor}`
          : arcaneTowerTransport?.role === "generator" ? "Arcane Tower Generator"
            : arcaneTowerTransport?.role === "secret-ring" ? arcaneTowerTransport.secretRing.title : null;
      const sharEntranceTitleOverride = sharEntrancePuzzle?.role === "central-switch" ? "Central Ring Switch" : null;
      const balthazarTitleOverride = balthazarSecretRoom?.role === "altar" ? "Heart Altar"
        : balthazarSecretRoom?.role === "door" ? "Secret Bookcase Door" : null;
      const minscTitleOverride = minscSluicePuzzle?.role === "indicator"
        ? minscSluicePuzzle.currentValveKind === "water" ? "Water Level Gauge" : "Temperature Gauge"
        : minscSluicePuzzle?.role === "gate" ? minscSluicePuzzle.gates.find(({ contentId }) => contentId === record.id)?.title
          : minscSluicePuzzle?.role === "force-valve" ? minscSluicePuzzle.forceValves.find(({ contentId }) => contentId === record.id)?.title
            : minscSluicePuzzle?.role === "release-valve" ? minscSluicePuzzle.releaseValve.title
              : minscSluicePuzzle?.role === "disabled-valve" ? minscSluicePuzzle.disabledValves.find(({ contentId }) => contentId === record.id)?.title : null;
      const enriched = {
        ...record,
        ...(curatedTitles ? { displayName: curatedTitles, curatedTitle: true } : {}),
        ...(!curatedTitles && crecheTitleOverride ? {
          displayName: { ...record.displayName, en: crecheTitleOverride },
          curatedTitle: true,
        } : {}),
        ...(!curatedTitles && !crecheTitleOverride && arcaneTowerTitleOverride ? {
          displayName: { ...record.displayName, en: arcaneTowerTitleOverride },
          curatedTitle: true,
        } : {}),
        ...(!curatedTitles && !crecheTitleOverride && !arcaneTowerTitleOverride && sharEntranceTitleOverride ? {
          displayName: { ...record.displayName, en: sharEntranceTitleOverride },
          curatedTitle: true,
        } : {}),
        ...(!curatedTitles && !crecheTitleOverride && !arcaneTowerTitleOverride && !sharEntranceTitleOverride && balthazarTitleOverride ? {
          displayName: { ...record.displayName, en: balthazarTitleOverride },
          curatedTitle: true,
        } : {}),
        ...(!curatedTitles && !crecheTitleOverride && !arcaneTowerTitleOverride && !sharEntranceTitleOverride && !balthazarTitleOverride && minscTitleOverride ? {
          displayName: { ...record.displayName, en: minscTitleOverride },
          curatedTitle: true,
        } : {}),
        ...(gameplay ? { gameplay } : {}),
        ...(speakWithDead ? { speakWithDead } : {}),
        ...(quest ? { quest } : {}),
        ...(worldChecks ? { worldChecks } : {}),
        ...(inspirations ? { inspirations } : {}),
        ...(deathLoot ? { deathLoot } : {}),
        ...(equipped.authoredEquipment ? { authoredEquipment: equipped.authoredEquipment } : {}),
        ...(containerLoot ? { containerLoot } : {}),
        ...(puzzleCombinations ? { puzzleCombinations } : {}),
        ...(readableImpact ? { readableImpact } : {}),
        ...(itemStoryImpact ? { itemStoryImpact } : {}),
        ...(readableFilterCategory ? { readableFilterCategory } : {}),
        ...(painting ? { painting: true } : {}),
        ...(diggableSecret ? {
          diggableSecret: {
            kind: diggableSecret.kind,
            ...(diggableSecret.mapMarkerId ? { mapMarkerId: diggableSecret.mapMarkerId } : {}),
            revealedByMap: Boolean(diggableSecret.showFlagId),
            ...(diggableSecret.buriedChest ? {
              buriedChest: {
                contentId: diggableSecret.buriedChest.objectId,
                title: buriedChestRecord
                  ? recordTitle(buriedChestRecord, diggableSecret.buriedChest.token)
                  : humanizeInternalName(diggableSecret.buriedChest.token),
                ...(buriedChestLoot ? { loot: buriedChestLoot } : {}),
              },
            } : {}),
          },
        } : {}),
        ...(mechanism ? { mechanism } : {}),
        ...(storyInteraction ? { storyInteraction } : {}),
        ...(storyOwnershipZone ? { storyOwnershipZone } : {}),
        ...(adamantineForge ? { adamantineForge } : {}),
        ...(secretPuzzle ? { secretPuzzle } : {}),
        ...(wyrmwayPuzzle ? { wyrmwayPuzzle } : {}),
        ...(crechePuzzle ? { crechePuzzle } : {}),
        ...(arcaneTowerTransport ? { arcaneTowerTransport } : {}),
        ...(sharEntrancePuzzle ? { sharEntrancePuzzle } : {}),
        ...(balthazarSecretRoom ? { balthazarSecretRoom } : {}),
        ...(minscSluicePuzzle ? { minscSluicePuzzle } : {}),
        ...(trap ? { trap } : {}),
        ...(record.flags.secretDoor || storySecretDoor ? {
          hiddenPassage: {
            authoredSecretDoor: record.flags.secretDoor,
            storyRegistered: Boolean(storySecretDoor),
          },
        } : {}),
        ...(record.recipeIds.length > 0 ? {
          recipeUnlock: {
            recipes: record.recipeIds.map((id) => ({ id, title: humanizeRecipeId(id) })),
          },
        } : {}),
        ...(storyRisks ? { storyRisks } : {}),
        ...(permanentBonuses ? { permanentBonuses } : {}),
        ...(rescuePlan ? { rescuePlan } : {}),
        ...(partyMember ? { partyMember } : {}),
        ...(navigationPortal ? { navigationPortal } : {}),
        ...(record.placementKind === "characters" && gameplay ? { creatureFamily: findCreatureFamily(gameplay) } : {}),
        ...(record.placementKind === "characters" && hostileFactions.has(record.faction) ? { factionHostile: true } : {}),
      };
      const navigationKind = navigationPortal
        ? isVerticalNavigationPortal(navigationPortal)
          ? "vertical-connection"
          : "transition"
        : record.navigationDestination?.kind;
      const titledEnriched = navigationKind && (!enriched.displayName.en || /^(?:Object|Trigger|Marker)$/i.test(enriched.displayName.en)) ? {
        ...enriched,
        displayName: {
          ...enriched.displayName,
          en: navigationKind === "vertical-connection" ? "Vertical Passage" : "Passage",
        },
      } : enriched;
      const inferredKind = inferCandidateKind(titledEnriched);
      const transportMechanism = mechanism?.related.some(({ action }) => action.startsWith("moves-elevator"))
        || mechanism?.effects?.some(({ action }) => action.startsWith("moves-elevator"));
      const characterWorldProxy = record.placementKind === "characters"
        && gameplay?.combat
        && Object.keys(gameplay.combat.abilities ?? {}).length !== 6;
      return {
        ...titledEnriched,
        candidateKind: (record.waypoint ? "waypoint" : null)
          ?? record.navigationDestination?.kind
          ?? (navigationPortal
            ? isVerticalNavigationPortal(navigationPortal)
              ? "vertical-connection"
              : "transition"
            : null)
          ?? candidateKindOverrides.get(record.id.toLocaleLowerCase("en-US"))
          ?? record.reviewedPresentation?.kind
          ?? (partyMember?.currentPositionId && !(record.flags.isBoss && partyMember.keepBossMarker) ? "party-member" : null)
          ?? (characterWorldProxy ? "interactable" : null)
          ?? (inferredKind === "corpse" ? "corpse" : null)
          ?? (record.flags.secretDoor || storySecretDoor ? "secret" : null)
          ?? (diggableSecret ? "secret" : null)
          ?? (mechanism?.sequence?.role === "result" ? "secret"
            : mechanism?.role === "controller" ? transportMechanism ? "vertical-connection" : "puzzle"
              : mechanism?.role === "target" ? transportMechanism ? "vertical-connection" : "transition"
                : mechanism?.movements?.some(({ action }) => action === "deploys-shortcut-ladder") ? "vertical-connection"
                  : mechanism?.movements?.some(({ action }) => action === "rolls-along-damaging-path" || action === "traces-fire-surface-then-explodes") ? "trap"
                    : mechanism?.movements?.some(({ action }) => action === "opens-secret-passage" || action === "opens-closes-secret-passage" || action === "reveals-hidden-safe") ? "secret"
                      : null)
          ?? (storyInteraction ? "story-interaction" : null)
          ?? (storyOwnershipZone ? "ownership-zone" : null)
          ?? (adamantineForge?.role === "forge" ? "puzzle" : adamantineForge ? "key-item" : null)
          ?? (secretPuzzle?.role === "target" ? "secret" : secretPuzzle ? "puzzle" : null)
          ?? (wyrmwayPuzzle ? "puzzle" : null)
          ?? (crechePuzzle?.role === "ceremonial-weapon" ? "key-item" : crechePuzzle?.role === "result" ? "secret" : crechePuzzle ? "puzzle" : null)
          ?? (arcaneTowerTransport?.role === "secret-ring" ? "key-item"
            : arcaneTowerTransport?.role === "generator" ? "puzzle"
              : arcaneTowerTransport ? "vertical-connection" : null)
          ?? (sharEntrancePuzzle?.role === "result-door" ? "transition" : sharEntrancePuzzle ? "puzzle" : null)
          ?? (balthazarSecretRoom?.role === "door" ? "secret" : balthazarSecretRoom?.role === "research" ? "valuable-item" : balthazarSecretRoom ? "puzzle" : null)
          ?? (minscSluicePuzzle?.role === "gate" ? "transition" : minscSluicePuzzle ? "puzzle" : null)
          ?? (record.recipeIds.length > 0 ? "valuable-item" : null)
          ?? (readableImpact?.questUpdates.length > 0 ? "quest" : null)
          ?? (itemStoryImpact?.questUpdates.length > 0 ? "quest" : itemStoryImpact?.highValue ? "key-item" : null)
          ?? (readableImpact ? "valuable-item" : null)
          ?? (record.itemLocation?.kind === "initial-inventory" ? "key-item" : null)
          ?? (puzzleCombinations?.role === "receptacle" ? "puzzle" : puzzleCombinations ? "key-item" : null)
          // Carried copies keep their valuable-item primary category while
          // the readable/painting facets still make them discoverable.
          ?? (readableFilterCategory && !record.itemLocation ? "item-books" : null)
          ?? (painting && !record.itemLocation ? "item-paintings" : null)
          ?? (alchemyCraftItem ? "item-alchemy" : null)
          ?? (inferredKind === "npc" || inferredKind === "enemy" ? null : inferredKind)
          ?? (rescuePlan?.role === "escape" ? "transition" : rescuePlan ? "npc" : null)
          ?? (quest ? "quest" : inspirations ? "inspiration" : (storyRisks ? "missable" : permanentBonuses ? "permanent-upgrade" : null))
          // A plain NPC classification is the last resort so that story
          // categories keep their marker for characters tied to quests.
          ?? inferredKind
          ?? (worldChecks ? worldChecks.categories[0] ?? "interactable" : null)
          // Narrator registration admits otherwise unclassified objects; it
          // must not replace a specific quest, inspiration or check category.
          ?? (record.placementKind === "items" && record.displayName.en && narratedObjectIds.has(record.id) ? "interactable" : null),
      };
    })
    .filter((record) => record.candidateKind)
    // A valuable item that no character carries is loot lying in the world, or
    // a piece of the world itself.
    .map((record) => record.candidateKind === "valuable-item" && !record.itemLocation
      ? { ...record, candidateKind: classifyWorldItem(record) }
      : record)
    .filter((record) => {
      const passageArtifact = !record.navigationPortal
        && !record.navigationDestination
        && !record.mechanism
        && (record.candidateKind === "transition" || record.candidateKind === "vertical-connection")
        && NON_GAMEPLAY_MARKER_PATTERN.test(record.internalName);
      return !passageArtifact && (
        record.inspirations
        || record.mechanism
        || record.storyInteraction
        || record.storyOwnershipZone
        || record.readableImpact
        || record.itemStoryImpact?.highValue
        || record.itemLocation?.kind === "initial-inventory"
        || isUsefulCandidate(record)
      );
    })
    .filter((record) => record.displayName.en
      || record.worldChecks
      || record.puzzleCombinations
      || record.recipeUnlock
      || record.readableImpact
      || record.itemStoryImpact?.highValue
      || record.itemLocation?.kind === "initial-inventory"
      || record.diggableSecret
      || record.mechanism
      || record.storyInteraction
      || record.storyOwnershipZone
      || record.adamantineForge
      || record.secretPuzzle
      || record.wyrmwayPuzzle
      || record.crechePuzzle
      || record.arcaneTowerTransport
      || record.sharEntrancePuzzle
      || record.balthazarSecretRoom
      || record.minscSluicePuzzle
      || record.candidateKind === "boss"
      || record.candidateKind === "waypoint"
      || record.candidateKind === "transition"
      || record.candidateKind === "vertical-connection"
      || record.candidateKind === "secret"
      || record.candidateKind === "puzzle"
      || record.candidateKind === "encounter"
      || record.candidateKind === "party-member"
      || record.candidateKind === "corpse"
      || record.candidateKind === "missable"
      || record.candidateKind === "inspiration"
      || record.candidateKind === "chest"
      || record.candidateKind === "loot-container"
      || record.candidateKind === "trap"
      || record.candidateKind === "quest")
    .map((record) => {
      const mapPosition = projectCoordinate(record.position, coordinateReference);
      return {
        ...record,
        ...(mapPosition ? { mapPosition: { x: roundCoordinate(mapPosition.x), y: roundCoordinate(mapPosition.y) } } : {}),
        confidence: {
          position: "extracted",
          identity: record.curatedTitle ? "curated-exact-id" : record.displayName.en ? "localized-source" : "internal-name",
          trackerCalibration: "unverified",
        },
      };
    });

  const mapOverviewPath = arguments_.get("map-overview");
  const silhouetteTolerance = readOptionalNumber(arguments_, "silhouette-tolerance") ?? 24;
  const silhouetteSnapTolerance = readOptionalNumber(arguments_, "silhouette-snap-tolerance") ?? 64;
  const technicalSourcePattern = arguments_.has("technical-source-level-pattern")
    ? new RegExp(arguments_.get("technical-source-level-pattern"), "i")
    : null;
  const excludedSourceLevels = JSON.parse(arguments_.get("excluded-source-levels") ?? "{}");
  const reviewedObjectExclusions = JSON.parse(arguments_.get("reviewed-object-exclusions") ?? "{}");
  const reviewedSilhouetteAdjustments = JSON.parse(arguments_.get("reviewed-silhouette-adjustments") ?? "{}");
  const sourceExclusionReason = (candidate) => {
    const sourceLevel = candidate.authoredLevel ?? candidate.level;
    return reviewedObjectExclusions[candidate.id]
      ?? excludedSourceLevels[sourceLevel]
      ?? (technicalSourcePattern?.test(sourceLevel) ? "Cinematic/staging source level, not a playable map placement." : null);
  };
  if (silhouetteSnapTolerance < silhouetteTolerance) {
    throw new Error("--silhouette-snap-tolerance cannot be smaller than --silhouette-tolerance.");
  }
  let mapSilhouette = null;
  if (mapOverviewPath) {
    const { data, info } = await sharp(path.resolve(mapOverviewPath))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    mapSilhouette = { data, width: info.width, height: info.height, channels: info.channels };
  }
  const nearestVisibleMapPosition = (mapPosition) => {
    if (!mapSilhouette || !mapPosition || !coordinateReference) return { distance: 0, mapPosition };
    const imageWidth = coordinateReference.imageBounds.width;
    const imageHeight = coordinateReference.imageBounds.height;
    const centerX = Math.round((mapPosition.x - coordinateReference.imageBounds.x) / imageWidth * (mapSilhouette.width - 1));
    const centerY = Math.round((mapPosition.y - coordinateReference.imageBounds.y) / imageHeight * (mapSilhouette.height - 1));
    const visibleResult = (x, y, distance) => ({
      distance,
      mapPosition: {
        x: roundCoordinate(coordinateReference.imageBounds.x + x / (mapSilhouette.width - 1) * imageWidth),
        y: roundCoordinate(coordinateReference.imageBounds.y + y / (mapSilhouette.height - 1) * imageHeight),
      },
    });
    for (let radius = 0; radius <= silhouetteSnapTolerance; radius += 1) {
      for (let deltaY = -radius; deltaY <= radius; deltaY += 1) {
        for (const deltaX of radius === 0 ? [0] : [-radius, radius]) {
          const x = centerX + deltaX;
          const y = centerY + deltaY;
          if (x < 0 || y < 0 || x >= mapSilhouette.width || y >= mapSilhouette.height) continue;
          if (mapSilhouette.data[(y * mapSilhouette.width + x) * mapSilhouette.channels + 3] > 16) {
            return visibleResult(x, y, radius);
          }
        }
      }
      for (let deltaX = -radius + 1; deltaX < radius; deltaX += 1) {
        for (const deltaY of [-radius, radius]) {
          const x = centerX + deltaX;
          const y = centerY + deltaY;
          if (x < 0 || y < 0 || x >= mapSilhouette.width || y >= mapSilhouette.height) continue;
          if (mapSilhouette.data[(y * mapSilhouette.width + x) * mapSilhouette.channels + 3] > 16) {
            return visibleResult(x, y, radius);
          }
        }
      }
    }
    return null;
  };
  const nativeNavigationEntrance = (candidate) => {
    const portal = candidate.navigationPortal;
    if (!mapSilhouette || !coordinateReference || !portal || portal.actionBinding
      || portal.id.toLocaleLowerCase("en-US") !== candidate.id.toLocaleLowerCase("en-US")
      || portal.module !== candidate.module || portal.level !== candidate.level
      || portal.instanceId !== `${candidate.module}/${candidate.level}/${candidate.id.toLocaleLowerCase("en-US")}`
      || portal.sourceCoordinateSpace !== "world-region" || portal.sourceTransformId !== null
      || portal.sourceWorldLevel !== candidate.level || worldDistance(candidate.position, portal.sourcePosition) >= 10
      || !isWithinReference(portal.sourcePosition, coordinateReference)
      || (floorSelection && !matchesFloor(portal.sourcePosition))) return null;
    const mapPosition = projectCoordinate(portal.sourcePosition, coordinateReference);
    const visible = nearestVisibleMapPosition(mapPosition);
    if (!visible || visible.distance !== 0) return null;
    const image = coordinateReference.imageBounds;
    const pixelDistance = Math.ceil(Math.max(
      Math.abs(mapPosition.x - candidate.mapPosition.x) / image.width * (mapSilhouette.width - 1),
      Math.abs(mapPosition.y - candidate.mapPosition.y) / image.height * (mapSilhouette.height - 1),
    ));
    return {
      distance: pixelDistance,
      mapPosition: { x: roundCoordinate(mapPosition.x), y: roundCoordinate(mapPosition.y) },
      adjustment: {
        kind: "native-navigation-entrance",
        distance: pixelDistance,
        worldDistance: roundCoordinate(worldDistance(candidate.position, portal.sourcePosition)),
        original: candidate.mapPosition,
        sourcePosition: portal.sourcePosition,
        portalInstanceId: portal.instanceId,
        portalProvenance: portal.provenance,
        reviewReason: "The object's exact native navigation entrance is visible; only the icon anchor changes, not the authored world position.",
      },
    };
  };
  const silhouetteResults = projectedCandidates.map((candidate) => {
    const nearest = nearestVisibleMapPosition(candidate.mapPosition);
    // A visible authored pivot needs no adjustment. For transparent pivots,
    // prefer an exact, scene-bound native entrance over a nearest wall pixel.
    return { candidate, nearest: nearest?.distance === 0 ? nearest : nativeNavigationEntrance(candidate) ?? nearest,
      exclusionReason: sourceExclusionReason(candidate) };
  }).map((result) => ({
    ...result,
    nearest: result.nearest?.distance > silhouetteTolerance && !result.nearest.adjustment
      && !reviewedSilhouetteAdjustments[result.candidate.id]
      ? null
      : result.nearest,
  }));
  const silhouetteRejectedCandidates = silhouetteResults
    .filter(({ nearest, exclusionReason }) => !nearest || exclusionReason)
    .map(({ candidate, exclusionReason }) => ({ ...candidate, ...(exclusionReason ? { exclusionReason } : {}) }));
  let candidates = silhouetteResults
    .filter(({ nearest, exclusionReason }) => nearest && !exclusionReason)
    .map(({ candidate, nearest }) => nearest.distance === 0 ? candidate : {
      ...candidate,
      mapPosition: nearest.mapPosition,
      mapPositionAdjustment: nearest.adjustment ?? {
        kind: "nearest-visible-pixel",
        distance: nearest.distance,
        original: candidate.mapPosition,
        reviewReason: reviewedSilhouetteAdjustments[candidate.id]
          ?? "Within the fixed raster-edge tolerance; only the icon anchor changes, not the world position.",
      },
    });

  if (mapMetadata) {
    candidates = await refineNativeRasterAnchors(candidates, mapMetadata, path.resolve(arguments_.get("map-metadata")));
  }

  if (arguments_.has("debug-object-id")) {
    const debugObjectId = arguments_.get("debug-object-id");
    const debugRecord = recordsById.get(debugObjectId);
    const debugName = debugRecord ? [debugRecord.internalName, debugRecord.stats, debugRecord.type]
      .filter(Boolean).join(" ") : "";
    console.log(JSON.stringify({
      debugObjectId,
      record: debugRecord,
      mechanismProfile: mechanismProfiles.get(debugObjectId),
      candidate: candidates.find(({ id }) => id === debugObjectId),
      suppressedForDynamicLocation: Boolean(debugRecord && !debugRecord.position),
      filters: debugRecord?.position ? {
        height: (minimumHeight === null || debugRecord.position.y >= minimumHeight)
          && (maximumHeight === null || debugRecord.position.y <= maximumHeight),
        level: selectedLevels.size === 0 && !levelPattern
          ? true
          : selectedLevels.has(debugRecord.level) || levelPattern?.test(debugRecord.level),
        includedName: !includeNamePattern || includeNamePattern.test(debugName),
        excludedName: Boolean(excludeNamePattern?.test(debugName)),
        withinReference: isWithinReference(debugRecord.position, coordinateReference),
      } : null,
    }, null, 2));
  }

  const getCandidateTitle = (candidate) => candidate.displayName.en
    || candidate.quest?.primaryMarkerTitle
    || candidate.quest?.quests[0]?.localizedTitles?.en
    || candidate.inspirations?.events[0]?.localizedTitles?.en
    || candidate.worldChecks?.primaryTitle
    || candidate.storyRisks?.primaryTitle
    || ((candidate.candidateKind === "chest" || candidate.candidateKind === "loot-container")
      ? humanizeLootContainerName(candidate.internalName)
      : humanizeInternalName(candidate.internalName));
  const accessRecordsByKey = new Map();
  for (const record of records) {
    const role = inferAccessRole(record);
    if (!role || !isUsableKeyId(record.accessKeyId)) continue;
    const entries = accessRecordsByKey.get(record.accessKeyId) ?? { keys: [], locks: [] };
    entries[role === "key" ? "keys" : "locks"].push(record);
    accessRecordsByKey.set(record.accessKeyId, entries);
  }
  const accessProfiles = new Map();
  for (const candidate of candidates) {
    const role = inferAccessRole(candidate);
    if (!role) continue;
    const difficulty = difficultyClasses.get(candidate.lockDifficultyClassId);
    const relatedRecords = isUsableKeyId(candidate.accessKeyId)
      ? accessRecordsByKey.get(candidate.accessKeyId)?.[role === "key" ? "locks" : "keys"] ?? []
      : [];
    accessProfiles.set(candidate.id, {
      role,
      keyId: isUsableKeyId(candidate.accessKeyId) ? candidate.accessKeyId : "NoKey",
      locked: role === "lock",
      ...(candidate.lockDifficultyClassId ? { difficultyClassId: candidate.lockDifficultyClassId } : {}),
      ...(difficulty?.name ? { difficultyClassName: difficulty.name } : {}),
      ...(difficulty?.value !== undefined ? { difficultyClass: difficulty.value } : {}),
      related: relatedRecords.map((related) => ({
        contentId: related.id,
        title: getCandidateTitle(related),
        role: role === "key" ? "lock" : "key",
      })),
    });
  }
  const accessRelationships = candidates.flatMap((candidate) => {
    const access = accessProfiles.get(candidate.id);
    if (access?.role !== "key") return [];
    return access.related.map((related) => ({
      id: `unlocks:${candidate.id}:${related.contentId}`,
      fromId: candidate.id,
      toId: related.contentId,
      kind: "unlocks",
    }));
  });
  const puzzleCombinationRelationships = candidates.flatMap((candidate) => {
    if (candidate.puzzleCombinations?.role !== "ingredient") return [];
    return candidate.puzzleCombinations.related.map((related) => ({
      id: related.combinationId,
      fromId: candidate.id,
      toId: related.contentId,
      kind: "inserts-into",
    }));
  });
  const mechanismRelationships = candidates.flatMap((candidate) => {
    if (candidate.mechanism?.role !== "controller") return [];
    return candidate.mechanism.related.map((related) => ({
      id: related.linkId,
      fromId: candidate.id,
      toId: related.contentId,
      kind: "controls",
      confidence: "story-db-exact",
    }));
  });
  const secretPuzzleRelationships = candidates.flatMap((candidate) => {
    const profile = candidate.secretPuzzle;
    if (!profile) return [];
    if (profile.role === "stone") return [{
      id: `reveals:${candidate.id}:${profile.buttons[profile.pairIndex].contentId}`,
      fromId: candidate.id,
      toId: profile.buttons[profile.pairIndex].contentId,
      kind: "reveals",
      confidence: "story-db-exact",
    }];
    if (profile.role === "button") return [{
      id: `contributes-to-opening:${candidate.id}:${profile.target.contentId}`,
      fromId: candidate.id,
      toId: profile.target.contentId,
      kind: "contributes-to-opening",
      confidence: "story-db-exact",
    }];
    return [];
  });
  const crechePuzzleRelationships = candidates.flatMap((candidate) => {
    const profile = candidate.crechePuzzle;
    if (!profile) return [];
    if (profile.kind === "statues" && profile.role === "statue") return [{
      id: `contributes-to-opening:${candidate.id}:${profile.resultDoor.contentId}`,
      fromId: candidate.id,
      toId: profile.resultDoor.contentId,
      kind: "contributes-to-opening",
      confidence: "story-db-exact",
    }];
    if (profile.kind === "weapons" && profile.role === "ceremonial-weapon") {
      const pedestal = profile.pedestals.find(({ index }) => index === profile.currentPedestalIndex);
      return pedestal ? [{
        id: `inserts-into:${candidate.id}:${pedestal.plaqueContentId}`,
        fromId: candidate.id,
        toId: pedestal.plaqueContentId,
        kind: "inserts-into",
        confidence: "story-db-exact",
      }] : [];
    }
    return [];
  });
  const arcaneTowerTransportRelationships = candidates.flatMap((candidate) => {
    const profile = candidate.arcaneTowerTransport;
    if (profile?.role !== "button") return [];
    const route = profile.routes.find(({ buttonContentId }) => buttonContentId === candidate.id);
    return route ? [{
      id: `teleports-to:${candidate.id}:${route.destinationContentId}`,
      fromId: candidate.id,
      toId: route.destinationContentId,
      kind: "teleports-to",
      confidence: "story-db-exact",
    }] : [];
  });
  const sharEntrancePuzzleRelationships = candidates.flatMap((candidate) => {
    const profile = candidate.sharEntrancePuzzle;
    if (profile?.role !== "central-switch") return [];
    return profile.results.map((result) => ({
      id: `controls:${candidate.id}:${result.contentId}`,
      fromId: candidate.id,
      toId: result.contentId,
      kind: "controls",
      confidence: "story-db-exact",
    }));
  });
  const balthazarSecretRoomRelationships = candidates.flatMap((candidate) => {
    const profile = candidate.balthazarSecretRoom;
    if (!profile) return [];
    if (profile.role === "book") {
      const current = profile.books.find(({ contentId }) => contentId === candidate.id);
      return current?.effect === "reveals-heart-altar" ? [{
        id: `reveals:${candidate.id}:${profile.heartAltar.contentId}`,
        fromId: candidate.id,
        toId: profile.heartAltar.contentId,
        kind: "reveals",
        confidence: "story-db-exact",
      }] : [];
    }
    if (profile.role === "altar") return [{
      id: `controls:${candidate.id}:${profile.secretDoor.contentId}`,
      fromId: candidate.id,
      toId: profile.secretDoor.contentId,
      kind: "controls",
      confidence: "story-db-exact",
    }];
    if (profile.role === "door") return [{
      id: `reveals:${candidate.id}:${profile.secretResearch.contentId}`,
      fromId: candidate.id,
      toId: profile.secretResearch.contentId,
      kind: "reveals",
      confidence: "story-db-exact",
    }];
    return [];
  });
  const minscSluicePuzzleRelationships = candidates.flatMap((candidate) => {
    const profile = candidate.minscSluicePuzzle;
    if (!profile) return [];
    if (profile.role === "valve") {
      const valve = profile.valves.find(({ valveContentId }) => valveContentId === candidate.id);
      if (!valve) return [];
      return [{
        id: `controls:${candidate.id}:${valve.indicatorContentId}`,
        fromId: candidate.id,
        toId: valve.indicatorContentId,
        kind: "controls",
        confidence: "story-db-exact",
      }, ...profile.gates.map((gate) => ({
        id: `contributes-to-opening:${candidate.id}:${gate.contentId}`,
        fromId: candidate.id,
        toId: gate.contentId,
        kind: "contributes-to-opening",
        confidence: "story-db-exact",
      }))];
    }
    if (profile.role === "force-valve") return profile.gates.map((gate) => ({
      id: `controls:${candidate.id}:${gate.contentId}`,
      fromId: candidate.id,
      toId: gate.contentId,
      kind: "controls",
      confidence: "story-db-exact",
    }));
    if (profile.role === "release-valve") return profile.valves.map((valve) => ({
      id: `resets:${candidate.id}:${valve.valveContentId}`,
      fromId: candidate.id,
      toId: valve.valveContentId,
      kind: "resets",
      confidence: "story-db-exact",
    }));
    return [];
  });

  const catalog = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    stats: {
      files: files.length,
      rawObjects: rawObjectCount,
      uniqueObjects: records.length,
      localizedObjects: records.filter((record) => record.displayName.en).length,
      candidates: candidates.length,
      silhouetteRejectedCandidates: silhouetteRejectedCandidates.length,
    },
    ...(omitRecords ? { recordsOmitted: true } : { records }),
    candidates,
    silhouetteRejectedCandidates: silhouetteRejectedCandidates.map((candidate) => ({
      id: candidate.id,
      title: getCandidateTitle(candidate),
      level: candidate.level,
      ...(candidate.authoredLevel ? { authoredLevel: candidate.authoredLevel } : {}),
      module: candidate.module,
      ...(candidate.exclusionReason ? { exclusionReason: candidate.exclusionReason } : {}),
      worldPosition: candidate.position,
      mapPosition: candidate.mapPosition,
    })),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileWithRetry(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
  if (rejectionsOutputPath) {
    fs.mkdirSync(path.dirname(rejectionsOutputPath), { recursive: true });
    writeFileWithRetry(rejectionsOutputPath, `${JSON.stringify({
      schemaVersion: 1,
      sourceBuild: mapMetadata?.sourceBuild ?? null,
      mapId: currentMapId,
      tolerance: silhouetteTolerance,
      snapTolerance: silhouetteSnapTolerance,
      adjustedCandidates: candidates.filter(({ mapPositionAdjustment }) => mapPositionAdjustment).map((candidate) => ({
        id: candidate.id,
        title: getCandidateTitle(candidate),
        adjustment: candidate.mapPositionAdjustment,
      })),
      rejectedCandidates: catalog.silhouetteRejectedCandidates,
    }, null, 2)}\n`);
  }

  if (publicOutputPath) {
    const publicCatalog = {
      schemaVersion: 1,
      sourceBuild: mapMetadata?.sourceBuild ?? null,
      generatedAt: catalog.generatedAt,
      trackerCalibration: "unverified",
      candidates,
    };
    fs.mkdirSync(path.dirname(publicOutputPath), { recursive: true });
    writeFileWithRetry(publicOutputPath, `${JSON.stringify(publicCatalog, null, 2)}\n`);
  }
  if (locationsOutputPath || contentOutputPath) {
    const sourceBuild = mapMetadata?.sourceBuild ?? null;
    const locations = candidates.map((candidate) => {
      const title = getCandidateTitle(candidate);
      const quest = candidate.quest ?? findQuest(candidate);
      const worldChecks = candidate.worldChecks ?? findWorldChecks(candidate);
      const inspirations = candidate.inspirations ?? findInspirations(candidate);
      const deathLoot = candidate.deathLoot ?? findDeathLoot(candidate);
      const storyRisks = candidate.storyRisks ?? findStoryRisks(candidate);
      const permanentBonuses = candidate.permanentBonuses ?? findPermanentBonuses(candidate);
      const rescuePlan = candidate.rescuePlan ?? findRescuePlan(candidate);
      const access = accessProfiles.get(candidate.id);
      const gameplay = candidate.gameplay ?? findGameplay(candidate);
      const uniqueEquipmentClasses = findUniqueEquipmentClasses(candidate, gameplay, deathLoot);
      for (const equipmentClass of uniqueEquipmentClassesByAcquisitionLocationId.get(candidate.id) ?? []) {
        uniqueEquipmentClasses.push(equipmentClass);
      }
      const categoryFacets = [...new Set([
        ...(quest ? ["quest"] : []),
        ...uniqueEquipmentClasses.map((equipmentClass) => `unique-${equipmentClass}`),
        ...(candidate.partyMember && candidate.candidateKind !== "party-member" ? ["party-member"] : []),
        ...(candidate.speakWithDead ? ["speak-with-dead"] : []),
        ...(worldChecks?.categories ?? []),
        ...(inspirations ? ["inspiration"] : []),
        ...(storyRisks ? ["missable"] : []),
        ...(permanentBonuses ? ["permanent-upgrade"] : []),
        ...(rescuePlan ? ["missable"] : []),
        ...(candidate.trap ? ["trap"] : []),
        ...(candidate.hiddenPassage ? ["hidden-passage", "secret-door"] : []),
        ...(candidate.recipeUnlock ? ["recipe", "recipe-unlock"] : []),
        ...(candidate.readableFilterCategory ? [candidate.readableFilterCategory] : []),
        ...(candidate.painting ? ["item-paintings"] : []),
        ...(candidate.readableImpact ? [
          "readable",
          ...(candidate.readableImpact.questUpdates.length > 0 ? ["quest-impact"] : []),
          ...(candidate.readableImpact.flags.some(({ kind }) => kind === "map-reveal") ? ["map-reveal"] : []),
        ] : []),
        ...(candidate.itemStoryImpact ? [
          "story-item",
          ...(candidate.itemStoryImpact.carrying.length > 0 ? ["carrying-impact"] : []),
          ...(candidate.itemStoryImpact.handIns.length > 0 ? ["hand-in-item"] : []),
          ...(candidate.itemStoryImpact.questUpdates.length > 0 ? ["quest-impact"] : []),
        ] : []),
        ...(candidate.itemLocation ? [
          "carried-item",
          ...(candidate.itemLocation.pickpocketable ? ["pickpocketable"] : []),
          ...(candidate.itemLocation.droppedOnDeath ? ["death-drop"] : []),
        ] : []),
        ...(candidate.ownership ? ["owned", "crime-risk"] : []),
        ...(candidate.diggableSecret ? ["diggable-secret", "buried-treasure"] : []),
        ...(candidate.mechanism ? ["mechanism", candidate.mechanism.controllerKind] : []),
        ...(candidate.adamantineForge ? ["adamantine-forge", `forge-${candidate.adamantineForge.role}`] : []),
        ...(candidate.secretPuzzle ? ["secret-puzzle", "puzzle-sequence"] : []),
        ...(candidate.wyrmwayPuzzle ? ["wyrmway-puzzle", candidate.wyrmwayPuzzle.kind] : []),
        ...(candidate.candidateKind !== "chest" && isChestRecord(candidate) ? ["chest"] : []),
        ...(candidate.containerLoot && !isChestRecord(candidate) ? ["loot-container"] : []),
        ...(candidate.puzzleCombinations ? ["puzzle"] : []),
      ])];
      return applySceneInventorySearch({
        id: candidate.id,
        contentId: candidate.id,
        name: title,
        category: publicCategoryByCandidateKind[candidate.candidateKind],
        ...(categoryFacets.length > 0 ? { categoryFacets } : {}),
        label: labelByCandidateKind[candidate.candidateKind],
        subtype: candidate.candidateKind,
        regionId: candidate.level,
        region: mapMetadata?.displayName ?? "",
        x: candidate.mapPosition.x,
        y: candidate.mapPosition.y,
        searchTerms: [
          candidate.displayName.tr,
          candidate.description.en,
          candidate.description.tr,
          candidate.internalName,
          candidate.stats,
          candidate.level,
          candidate.waypoint?.id,
          candidate.waypoint?.group,
          ...Object.values(candidate.waypoint?.localizedNames ?? {}),
          ...(quest?.quests ?? []).flatMap((questEntry) => [
            ...Object.values(questEntry.localizedTitles ?? {}),
            ...questEntry.objectives.flatMap((objective) => [
              ...Object.values(objective.localizedDescriptions ?? {}),
              ...Object.values(objective.localizedMarkerTitles ?? {}),
              ...objective.steps.flatMap((step) => Object.values(step.localizedDescriptions ?? {})),
            ]),
          ]),
          ...(worldChecks?.checks ?? []).flatMap((check) => [
            check.title,
            check.checkId,
            check.skill,
            check.difficultyClassName,
            check.difficultyClass !== undefined ? `DC ${check.difficultyClass}` : "",
          ]),
          ...(inspirations?.events ?? []).flatMap((event) => [
            ...Object.values(event.localizedTitles ?? {}),
            ...Object.values(event.localizedDescriptions ?? {}),
            ...Object.values(event.background?.localizedNames ?? {}),
            ...(event.characters ?? []).flatMap(({ localizedNames }) => Object.values(localizedNames ?? {})),
            event.internalName,
          ]),
          ...(deathLoot?.guaranteedDrops ?? []).flatMap((drop) => [drop.title, drop.itemName, drop.rarity]),
          ...(candidate.containerLoot?.items ?? []).flatMap((item) => [item.title, item.itemName, item.rarity, ...item.difficulties]),
          ...(candidate.containerLoot?.randomLootPools ?? []).flatMap((pool) => [pool.tableId, ...pool.stockCategories, ...pool.namedStock]),
          ...(candidate.partyMember ? [
            ...Object.values(candidate.partyMember.localizedNames ?? {}),
            ...Object.values(candidate.partyMember.race?.localizedNames ?? {}),
            ...Object.values(candidate.partyMember.subRace?.localizedNames ?? {}),
            ...Object.values(candidate.partyMember.class?.localizedNames ?? {}),
            ...Object.values(candidate.partyMember.subClass?.localizedNames ?? {}),
            ...candidate.partyMember.quests.flatMap((questEntry) => Object.values(questEntry.localizedTitles ?? {})),
          ] : []),
          ...(candidate.speakWithDead?.questions ?? []).flatMap((question) => Object.values(question.localizedText ?? {})),
          candidate.diggableSecret?.buriedChest?.title,
          ...(candidate.diggableSecret?.buriedChest?.loot?.items ?? []).flatMap((item) => [item.title, item.itemName, item.rarity]),
          ...(candidate.diggableSecret?.buriedChest?.loot?.randomLootPools ?? []).flatMap((pool) => [pool.tableId, ...pool.stockCategories, ...pool.namedStock]),
          ...(deathLoot?.treasureTables ?? []),
          ...(storyRisks?.risks ?? []).flatMap((risk) => [
            risk.id,
            risk.title,
            risk.type,
            ...(risk.affectedLevelIds ?? []),
          ]),
          ...(permanentBonuses?.interactions ?? []).flatMap((interaction) => [
            interaction.id,
            interaction.title,
            ...interaction.boons.flatMap((boon) => [boon.ability, `+${boon.amount}`, boon.passiveId]),
            ...interaction.checks.flatMap((check) => [check.skill, check.difficultyClass !== undefined ? `DC ${check.difficultyClass}` : ""]),
          ]),
          ...(rescuePlan ? [
            rescuePlan.planId,
            rescuePlan.title,
            rescuePlan.currentHostage?.title,
            ...Object.entries(rescuePlan.turnLimits).map(([difficulty, turns]) => `${difficulty} ${turns} turns`),
          ] : []),
          access?.keyId,
          access?.difficultyClassName,
          access?.difficultyClass !== undefined ? `DC ${access.difficultyClass}` : "",
          ...(access?.related ?? []).map((related) => related.title),
          candidate.trap?.type,
          candidate.trap?.difficultyClassName,
          candidate.trap?.difficultyClass !== undefined ? `DC ${candidate.trap.difficultyClass}` : "",
          candidate.hiddenPassage ? "hidden passage secret door concealed entrance" : "",
          ...(candidate.recipeUnlock?.recipes ?? []).flatMap((recipe) => [recipe.id, recipe.title]),
          ...(candidate.readableImpact?.flags ?? []).flatMap((impact) => [impact.title, impact.flagId, impact.kind]),
          ...(candidate.readableImpact?.questUpdates ?? []).flatMap((impact) => [
            impact.questId,
            impact.stateId,
            ...Object.values(impact.localizedQuestTitles ?? {}),
            ...Object.values(impact.localizedStateDescriptions ?? {}),
          ]),
          ...(candidate.itemStoryImpact?.carrying ?? []).flatMap((impact) => [impact.title, impact.flagId]),
          ...(candidate.itemStoryImpact?.handIns ?? []).flatMap((impact) => [impact.title, impact.flagId, "hand in", "turn in"]),
          ...(candidate.itemStoryImpact?.questUpdates ?? []).flatMap((impact) => [
            impact.trigger,
            impact.questId,
            impact.stateId,
            ...Object.values(impact.localizedQuestTitles ?? {}),
            ...Object.values(impact.localizedStateDescriptions ?? {}),
          ]),
          candidate.itemStoryImpact?.acquisition?.sourceTitle ?? "",
          candidate.itemLocation?.ownerTitle ?? "",
          candidate.itemLocation?.pickpocketable ? "pickpocket steal" : "",
          candidate.itemLocation?.droppedOnDeath ? "dropped on death" : "",
          candidate.ownership?.ownerTitle ?? "",
          candidate.ownership ? "owned crime unauthorized interaction" : "",
          candidate.diggableSecret ? "diggable buried treasure secret mound shovel" : "",
          ...(candidate.mechanism?.related ?? []).map((related) => related.title),
          ...(candidate.storyInteraction?.outcomes ?? []).flatMap((outcome) => [
            outcome.targetTitle,
            outcome.dialogTitle,
            outcome.questId,
            outcome.stateId,
            ...(outcome.localizedLines ?? []).flatMap((line) => Object.values(line)),
          ]),
          ...(candidate.storyOwnershipZone?.owners ?? []).flatMap((owner) => [owner.title, owner.shopOwner ? "shop trader" : "owned theft crime"]),
          ...(candidate.adamantineForge?.recipes ?? []).flatMap((recipe) => [
            recipe.title,
            recipe.statId,
            recipe.gameplay?.rarity,
            recipe.gameplay?.armorType,
            recipe.gameplay?.weaponType,
          ]),
          candidate.adamantineForge ? "adamantine forge mithral ore mold crafting" : "",
          candidate.secretPuzzle?.title,
          ...(candidate.secretPuzzle?.stones ?? []).map(({ title }) => title),
          ...(candidate.secretPuzzle?.buttons ?? []).map(({ title }) => title),
          candidate.secretPuzzle?.target?.title,
          candidate.wyrmwayPuzzle?.title,
          ...(candidate.wyrmwayPuzzle?.suspects ?? []).map(({ title }) => title),
          ...(candidate.wyrmwayPuzzle?.evidenceBooks ?? []).flatMap(({ birdTitle, bookTitle }) => [birdTitle, bookTitle]),
          ...(candidate.wyrmwayPuzzle?.variants ?? []).flatMap(({ moves }) => moves.flatMap(({ from, to }) => [from.notation, to.notation])),
          ...(candidate.wyrmwayPuzzle?.paintings ?? []).map(({ title }) => title),
          ...(candidate.wyrmwayPuzzle?.enemies ?? []).map(({ title }) => title),
          candidate.crechePuzzle?.title,
          ...(candidate.crechePuzzle?.statues ?? []).map(({ title }) => title),
          ...(candidate.crechePuzzle?.pedestals ?? []).flatMap(({ plaqueTitle, weaponType, ceremonialWeaponTitle }) => [plaqueTitle, weaponType, ceremonialWeaponTitle]),
          candidate.arcaneTowerTransport?.title,
          candidate.arcaneTowerTransport?.powerIngredient,
          candidate.arcaneTowerTransport?.secretRing?.title,
          ...(candidate.arcaneTowerTransport?.routes ?? []).flatMap(({ buttonTitle, destinationTitle }) => [buttonTitle, destinationTitle]),
          candidate.sharEntrancePuzzle?.title,
          ...(candidate.sharEntrancePuzzle?.results ?? []).map(({ title }) => title),
          candidate.balthazarSecretRoom?.title,
          ...(candidate.balthazarSecretRoom?.books ?? []).map(({ title }) => title),
          candidate.balthazarSecretRoom?.secretResearch?.title,
          candidate.minscSluicePuzzle?.title,
          ...(candidate.minscSluicePuzzle?.valves ?? []).flatMap(({ valveTitle, indicatorTitle }) => [valveTitle, indicatorTitle]),
          ...(candidate.minscSluicePuzzle?.gates ?? []).map(({ title }) => title),
          ...(candidate.minscSluicePuzzle?.forceValves ?? []).map(({ title }) => title),
          candidate.minscSluicePuzzle?.forceCheck?.skill,
          candidate.minscSluicePuzzle?.forceCheck?.difficultyClass !== undefined ? `DC ${candidate.minscSluicePuzzle.forceCheck.difficultyClass}` : "",
          ...(candidate.puzzleCombinations?.related ?? []).map((related) => related.title),
          candidate.navigationPortal?.sourceRegionId,
          candidate.navigationPortal?.targetRegionId,
          ...(uniqueEquipmentSearchTermsByAcquisitionLocationId.get(candidate.id) ?? []),
        ].filter(Boolean),
      }, candidate.sceneContent);
    });
    const entities = candidates.map((candidate) => {
      const title = getCandidateTitle(candidate);
      const gameplay = candidate.gameplay ?? findGameplay(candidate);
      const publicGameplay = candidate.reviewedPresentation?.omitGameplay ? undefined : gameplay?.combat
        && Object.keys(gameplay.combat.abilities ?? {}).length !== 6
        ? { ...gameplay, combat: undefined }
        : gameplay;
      const quest = candidate.quest ?? findQuest(candidate);
      const worldChecks = candidate.worldChecks ?? findWorldChecks(candidate);
      const inspirations = candidate.inspirations ?? findInspirations(candidate);
      const deathLoot = candidate.deathLoot ?? findDeathLoot(candidate);
      const storyRisks = candidate.storyRisks ?? findStoryRisks(candidate);
      const permanentBonuses = candidate.permanentBonuses ?? findPermanentBonuses(candidate);
      const rescuePlan = candidate.rescuePlan ?? findRescuePlan(candidate);
      const access = accessProfiles.get(candidate.id);
      const tradeTables = [...new Set(candidate.tradeTreasures ?? [])];
      const stockProfiles = tradeTables
        .map((tableId) => treasureCatalog?.tables?.[tableId])
        .filter(Boolean);
      const vendor = candidate.sceneVendor ? buildSceneVendorProfile(candidate.sceneVendor, treasureCatalog, localizedGameplayTitle)
        : candidate.candidateKind === "vendor" && tradeTables.length > 0 ? {
        tradeTables,
        stockCategories: [],
        namedStock: [...new Set(stockProfiles.flatMap((profile) => localizedTreasureStock(profile)))],
      } : null;
      const tradeInventory = !vendor && candidate.type === "character"
        ? buildNativeTradeInventory(tradeTables, treasureCatalog, localizedGameplayTitle) : null;
      return applySceneContentProfile({
        id: candidate.id,
        kind: candidate.candidateKind,
        title,
        localizedTitles: Object.fromEntries(Object.entries(candidate.displayName).filter(([, value]) => value)),
        localizedDescriptions: Object.fromEntries(Object.entries(candidate.description).filter(([, value]) => value)),
        internalName: candidate.internalName || undefined,
        statsId: candidate.stats || undefined,
        templateId: candidate.templateId || undefined,
        iconId: candidate.icon || undefined,
        sourceLevel: candidate.level,
        worldPosition: candidate.position,
        tags: [
          candidate.candidateKind,
          candidate.placementKind,
          candidate.level,
          gameplay?.rarity ? `rarity:${gameplay.rarity.toLocaleLowerCase("en-US")}` : "",
          gameplay?.slot ? `slot:${gameplay.slot.toLocaleLowerCase("en-US")}` : "",
        ].filter(Boolean),
        ...(publicGameplay ? { gameplay: publicGameplay } : {}),
        ...(vendor ? { vendor } : {}),
        ...(tradeInventory ? { tradeInventory } : {}),
        ...(quest ? { quest } : {}),
        ...(worldChecks ? { worldChecks } : {}),
        ...(inspirations ? { inspirations } : {}),
        ...(deathLoot ? { deathLoot } : {}),
        ...(candidate.authoredEquipment ? { authoredEquipment: candidate.authoredEquipment } : {}),
        ...(storyRisks ? { storyRisks } : {}),
        ...(permanentBonuses ? { permanentBonuses } : {}),
        ...(rescuePlan ? { rescuePlan } : {}),
        ...(candidate.partyMember ? { partyMember: candidate.partyMember } : {}),
        ...(candidate.speakWithDead ? { speakWithDead: candidate.speakWithDead } : {}),
        ...(access ? { access } : {}),
        ...(candidate.trap ? { trap: candidate.trap } : {}),
        ...(candidate.hiddenPassage ? { hiddenPassage: candidate.hiddenPassage } : {}),
        ...(candidate.recipeUnlock ? { recipeUnlock: candidate.recipeUnlock } : {}),
        ...(candidate.readableImpact ? { readableImpact: candidate.readableImpact } : {}),
        ...(candidate.itemStoryImpact ? { itemStoryImpact: candidate.itemStoryImpact } : {}),
        ...(candidate.itemLocation ? { itemLocation: candidate.itemLocation } : {}),
        ...(candidate.storyDestination ? { storyDestination: candidate.storyDestination } : {}),
        ...(candidate.ownership ? { ownership: candidate.ownership } : {}),
        ...(candidate.diggableSecret ? { diggableSecret: candidate.diggableSecret } : {}),
        ...(candidate.mechanism ? { mechanism: candidate.mechanism } : {}),
        ...(candidate.storyInteraction ? { storyInteraction: candidate.storyInteraction } : {}),
        ...(candidate.storyOwnershipZone ? { storyOwnershipZone: candidate.storyOwnershipZone } : {}),
        ...(candidate.adamantineForge ? { adamantineForge: candidate.adamantineForge } : {}),
        ...(candidate.secretPuzzle ? { secretPuzzle: candidate.secretPuzzle } : {}),
        ...(candidate.wyrmwayPuzzle ? { wyrmwayPuzzle: candidate.wyrmwayPuzzle } : {}),
        ...(candidate.crechePuzzle ? { crechePuzzle: candidate.crechePuzzle } : {}),
        ...(candidate.arcaneTowerTransport ? { arcaneTowerTransport: candidate.arcaneTowerTransport } : {}),
        ...(candidate.sharEntrancePuzzle ? { sharEntrancePuzzle: candidate.sharEntrancePuzzle } : {}),
        ...(candidate.balthazarSecretRoom ? { balthazarSecretRoom: candidate.balthazarSecretRoom } : {}),
        ...(candidate.minscSluicePuzzle ? { minscSluicePuzzle: candidate.minscSluicePuzzle } : {}),
        ...(candidate.containerLoot ? { containerLoot: candidate.containerLoot } : {}),
        ...(candidate.puzzleCombinations ? { puzzleCombinations: candidate.puzzleCombinations } : {}),
        ...(candidate.navigationPortal ? { navigationPortal: candidate.navigationPortal } : {}),
        ...(candidate.navigationDestination ? { navigationDestination: candidate.navigationDestination } : {}),
        ...(candidate.waypoint ? { waypoint: candidate.waypoint } : {}),
        spoilerBlocks: candidate.description.en ? [{
          id: `${candidate.id}:game-description`,
          level: candidate.flags.storyItem ? "full" : "guide",
          title: "",
          body: candidate.description.en,
        }] : [],
        provenance: [
          ...candidate.provenance.map((provenance) => ({ ...provenance, sourceBuild })),
          ...(worldChecks?.checks ?? []).map((check) => ({
            sourcePath: `${check.provenance}:${check.sourceLine}`,
            sourceBuild,
          })),
          ...(storyRisks?.risks ?? []).flatMap((risk) => risk.evidence.map((evidence) => ({
            sourcePath: `${evidence.provenance}:${evidence.sourceLine}`,
            sourceBuild,
          }))),
          ...(permanentBonuses?.interactions ?? []).flatMap((interaction) => interaction.evidence.map((evidence) => ({
            sourcePath: `${evidence.provenance}:${evidence.sourceLine}`,
            sourceBuild,
          }))),
          ...(candidate.readableImpact?.flags ?? []).flatMap((impact) => impact.evidence.map((evidence) => ({
            sourcePath: `${evidence.sourcePath}:${evidence.sourceLine}`,
            sourceBuild,
          }))),
          ...(candidate.readableImpact?.questUpdates ?? []).flatMap((impact) => impact.evidence.map((evidence) => ({
            sourcePath: `${evidence.sourcePath}:${evidence.sourceLine}`,
            sourceBuild,
          }))),
          ...(candidate.itemStoryImpact?.carrying ?? []).flatMap((impact) => impact.evidence.map((evidence) => ({
            sourcePath: `${evidence.sourcePath}:${evidence.sourceLine}`,
            sourceBuild,
          }))),
          ...(candidate.itemStoryImpact?.handIns ?? []).flatMap((impact) => impact.evidence.map((evidence) => ({
            sourcePath: `${evidence.sourcePath}:${evidence.sourceLine}`,
            sourceBuild,
          }))),
          ...(candidate.itemStoryImpact?.questUpdates ?? []).flatMap((impact) => impact.evidence.map((evidence) => ({
            sourcePath: `${evidence.sourcePath}:${evidence.sourceLine}`,
            sourceBuild,
          }))),
          ...(candidate.itemStoryImpact?.acquisition?.evidence ?? []).map((evidence) => ({
            sourcePath: `${evidence.sourcePath}:${evidence.sourceLine}`,
            sourceBuild,
          })),
          ...(rescuePlan?.evidence ?? []).map((evidence) => ({
            sourcePath: `${evidence.provenance}:${evidence.sourceLine}`,
            sourceBuild,
          })),
          ...(candidate.partyMember?.evidence ?? []).map((evidence) => ({
            sourcePath: evidence.sourceLine ? `${evidence.sourcePath}:${evidence.sourceLine}` : evidence.sourcePath,
            sourceBuild,
          })),
        ],
        confidence: candidate.confidence,
      }, candidate.sceneContent);
    });
    if (locationsOutputPath) {
      fs.mkdirSync(path.dirname(locationsOutputPath), { recursive: true });
      writeFileWithRetry(locationsOutputPath, `${JSON.stringify({
        schemaVersion: 1,
        sourceBuild,
        locations,
      }, null, 2)}\n`);
    }
    if (contentOutputPath) {
      fs.mkdirSync(path.dirname(contentOutputPath), { recursive: true });
      writeFileWithRetry(contentOutputPath, `${JSON.stringify({
        schemaVersion: 1,
        sourceBuild,
        entities,
      relationships: [...accessRelationships, ...puzzleCombinationRelationships, ...mechanismRelationships, ...secretPuzzleRelationships, ...crechePuzzleRelationships, ...arcaneTowerTransportRelationships, ...sharEntrancePuzzleRelationships, ...balthazarSecretRoomRelationships, ...minscSluicePuzzleRelationships],
      }, null, 2)}\n`);
    }
  }
  console.log(`Placement catalog: ${records.length} unique objects, ${catalog.stats.localizedObjects} localized, ${candidates.length} candidates, ${resolvedMechanismLinkCount}/${mechanismLinkCatalog?.links?.length ?? 0} mechanism links resolved.`);
};

try {
  await main();
} catch (error) {
  console.error("Placement catalog build failed:", error);
  process.exitCode = 1;
}
