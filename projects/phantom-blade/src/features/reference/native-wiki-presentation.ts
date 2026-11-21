import i18n from "../../i18n";
import { formatGameName, isInternalGameName } from "../../lib/game-display-text";
import { getGameText } from "../../i18n/game-text";
import en from "../../i18n/locales/en.json";

export const nativeEntryName = (entry: { name: string; id?: string; category?: string; unnamed?: boolean }): string => {
  // An unresolved NPC has a known type, but no verified personal name.
  // Never present the old generic "Character" placeholder as its identity.
  if (entry.category === "npcs" && (entry.unnamed || isInternalGameName(entry.name)
    || entry.name === en.wiki.spawnGroups.npcs || entry.name === "Character")) return String(i18n.t("wiki.spawnGroups.npcs"));
  if (!entry.unnamed && !isInternalGameName(entry.name)) {
    if (entry.name.toLowerCase() === en.wiki.containerObject.toLowerCase()) return String(i18n.t("wiki.containerObject"));
    const generic = Object.entries(en.wiki.markerNames).find(([, name]) => name.toLowerCase() === entry.name.toLowerCase());
    if (generic) return String(i18n.t(`wiki.markerNames.${generic[0]}`));
    if (entry.name.startsWith("Loot: ")) return String(i18n.t("wiki.lootMarkerTitle", { item: formatGameName(getGameText(i18n.language, entry.name.slice(6))) }));
    return formatGameName(getGameText(i18n.language, entry.name, entry.id ? `Wiki:${entry.id}:/name` : undefined));
  }
  return i18n.t(`wiki.unnamedEntries.${entry.category ?? "discoveries"}`, { defaultValue: i18n.t("wiki.unnamedEntry") });
};
export const hasUnrevealedName = (entry: { name: string; unnamed?: boolean }): boolean =>
  Boolean(entry.unnamed || isInternalGameName(entry.name));

const sourceFields = new Set([
  "SequentialIndex", "InventoryDisplayOrder", "ItemSoundType", "SoundType",
  "bShowUIOnSubsequentGet", "bShowTipsOnFirstGet", "bHatUseSkinComponent", "bDefaultHatHidden",
  "bReloadBuffAfterSnapSoul", "native_map_id", "location_status", "reachability", "status",
  "SaveGuidString", "SoftClassPtr", "GEClass", "GEDataClass", "AssetPathName", "SubPathString", "Class",
  "NodeGuids", "FlowAssetName", "MobDomainName", "DialogueGroupIDs", "BrokenBlockerTag", "UsedInSequences",
  "WeaponTitle", "IconTexture", "HighPrecisionTexture", "localization_key", "Namespace", "KeyHash", "NativeClass",
  "ObjectName", "ObjectPath", "Path", "ResolvedOwner", "CustomCurve", "AttributeOwner", "TagName",
  "InitialTags", "Character Name", "actor_config", "bell", "ItemName", "AppearanceName", "WeaponName", "AccessoryName",
  "DuplicatePetalDustLootID", "SnapSoulTextID", "GETag", "GEValue", "GELevel", "native_boss_flag", "native_enemy_type",
  "bNeedInJHSY", "source", "source_pointer", "sourcePointer", "evidence_file", "sha256", "build", "record",
  "ItemLevel", "Item Level", "LootLevel",
]);
/** These foreign keys are useful only as resolved item or region names. */
export const isNativeItemReferenceField = (field: string): boolean =>
  /^(?:ItemID|SellItemID|WeaponID|AccessoryID|MedicineID|IntegrationItemID|Outfit\w+Item|Key)$/.test(field);
export const isNativeMapReferenceField = (field: string): boolean => /^(?:OwnMapID|TargetMapID|MapID)$/.test(field);
export const isPlayerFacingField = (field: string): boolean => !sourceFields.has(field)
  && !/(?:Guid|PathName|SoftClass|Blueprint|Texture|SoundType|Mesh|Groom|ClothData|HatHidden|Tag)/.test(field)
  && (!/(?:ID|Id|IDs|Ids|_id|_ids)$/.test(field) || isNativeItemReferenceField(field) || isNativeMapReferenceField(field));
export const isTechnicalNativeValue = (value: string): boolean => isInternalGameName(value)
  || /^(?:Default:|\/(?:Game|Script|PBZ)[^ ]*|[A-Za-z]:[\\/]|[A-Za-z_][\w-]*\.[\w.-]+$)/.test(value);
export const hasPlayerFacingValue = (value: unknown, field = ""): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return Boolean(value.trim()) && !/^(?:None|Default:|E\w+::None)$/.test(value)
    && (!isTechnicalNativeValue(value) || isNativeItemReferenceField(field) || isNativeMapReferenceField(field));
  if (Array.isArray(value)) return value.some(child => hasPlayerFacingValue(child, field));
  if (typeof value === "object") return Object.entries(value).some(([key, child]) => isPlayerFacingField(key) && hasPlayerFacingValue(child, key));
  return true;
};
export const visibleNativeFacts = (facts: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(facts).filter(([key, value]) => !["ItemID", "ShortIntroduction"].includes(key) && isPlayerFacingField(key) && hasPlayerFacingValue(value, key)
    && !(key === "IntegrationItemNum" && value === 0)
    && !(key === "bIsWhiteFlower" && value === false)
    && !(key === "BuyPrice" && facts.bCanBuy === false)
    && !(key === "SellPrice" && facts.bCanSell === false)));
