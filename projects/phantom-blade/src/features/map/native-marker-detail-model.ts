import type { NativeWikiEntry } from "../reference/use-native-wiki";
import { hasPlayerFacingValue, isPlayerFacingField, visibleNativeFacts } from "../reference/native-wiki-presentation";
import { isNativeUpgradeSection } from "../reference/native-wiki-upgrade-fields";
import { nativeMarkerContentPolicy } from "./native-marker-content-policy";

export const nativeMarkerDescriptions = (entry: NativeWikiEntry) => {
  const weapon = ["weapons", "phantom-edges"].includes(entry.group);
  const descriptions = weapon && entry.descriptions.some(row => row.label === "EquipDescription")
    ? entry.descriptions.filter(row => row.label === "EquipDescription") : entry.descriptions;
  return descriptions.filter(row => !(row.label === "Subhead" && row.text === entry.name));
};

export const nativeMarkerDetailModel = (entry: NativeWikiEntry, markerCategory?: string) => {
  const policy = nativeMarkerContentPolicy(entry, markerCategory);
  const weapon = ["weapons", "phantom-edges"].includes(entry.group);
  const facts = policy.showProperties ? Object.fromEntries(Object.entries(visibleNativeFacts(entry.facts)).filter(([key]) =>
    !["native_enemy_type", "native_boss_flag"].includes(key) && !(weapon && ["WeaponType", "ShaChiWeaponType"].includes(key)))) : {};
  const sections = entry.sections.filter(section => isPlayerFacingField(section.label) && hasPlayerFacingValue(section.value));
  const upgrades = sections.filter(isNativeUpgradeSection);
  const statSections = sections.filter(section => ["ReincarnationUIAttributeDatas", "SnapSoulUIAttributeDatas"].includes(section.label));
  const hasWeaponStats = weapon && entry.sections.some(section => section.label === "UIAttributeDatas"
    && Array.isArray(section.value) && section.value.some(row => typeof row?.GEDescription === "string" && typeof row.DefaultValue === "number"));
  return { facts, upgrades, statSections, weapon, inlineProperties: policy.inlineProperties, hasProperties: Boolean(Object.keys(facts).length || Object.keys(entry.attributes ?? {}).length || hasWeaponStats || statSections.length) };
};
