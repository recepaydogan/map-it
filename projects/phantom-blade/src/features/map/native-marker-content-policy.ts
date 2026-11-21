import type { NativeWikiEntry } from "../reference/use-native-wiki";

const itemGroups:Record<string,{field:string;group:string}> = {
  WeaponItemDatas:{field:"WeaponID",group:"weapons"},ShaChiWeaponItemDatas:{field:"WeaponID",group:"phantom-edges"},
  AccessoryItemDatas:{field:"AccessoryID",group:"accessories"},MedicineItemDatas:{field:"MedicineID",group:"medicines"},
  MemoryFlowerData:{field:"ItemID",group:"inventory"},YaoShiItemData:{field:"ItemID",group:"inventory"},
};

export function nativeMarkerItemReference(entry: NativeWikiEntry) {
  const definition = itemGroups[entry.group];
  const native = (entry.native as {native?:Record<string,unknown>} | null)?.native;
  const id = definition && native?.[definition.field];
  return typeof id === "string" && id !== "" && id !== "None" ? {nativeId:id,group:definition.group} : undefined;
}

/** Marker categories distinguish ordinary creatures from boss entries sharing the creature catalog. */
export function nativeMarkerContentPolicy(entry: NativeWikiEntry, markerCategory?: string) {
  const creature = markerCategory ? markerCategory === "native-creatures" : entry.category === "creatures" && !entry.boss;
  const boss = markerCategory ? markerCategory === "native-bosses" : Boolean(entry.boss || entry.category === "world-bosses");
  const container = markerCategory === "native-loot-containers" || entry.group === "SceneContainer" || Boolean(entry.containerAnchors?.length);
  return {
    showDescription: !creature && !boss,
    showAppearanceConditions: !boss,
    inlineProperties: boss,
    showLocations: false,
    showProperties: !container,
    showLinkedItemDetails: entry.category === "discoveries" && Boolean(nativeMarkerItemReference(entry)),
    showBellGuide: entry.group === "BellDatas",
  };
}
