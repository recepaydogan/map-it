import type { NativeAcquisition, NativeWikiEntry } from "../reference/use-native-wiki";
import { nativeMarkerItemReference } from "./native-marker-content-policy";

/** A pickup's inventory definition is its content, not an extra reward granted by that item. */
export function nativeMarkerExternalRewards(entry: NativeWikiEntry, rows: NativeAcquisition[]): NativeAcquisition[] {
  const ownItem = nativeMarkerItemReference(entry);
  return ownItem ? rows.filter(row => row.native_item_id?.toLowerCase() !== ownItem.nativeId.toLowerCase()) : rows;
}

export function nativeMarkerRewardsForPoint(entry: NativeWikiEntry, markerId: string): NativeAcquisition[] {
  const containers = new Set(entry.containerAnchors?.filter(anchor => anchor.id === markerId || anchor.map_record_ids?.includes(markerId)).map(anchor => anchor.id));
  return nativeMarkerExternalRewards(entry, [
    ...(entry.markerRewards ?? []),
    ...(entry.sceneAcquisition?.filter(row => row.containerId && containers.has(row.containerId)) ?? []),
    ...(entry.combatRewards?.filter(row => row.spawn_ids?.includes(markerId)) ?? []),
    ...(entry.flowRewards?.filter(row => row.spawn_ids?.includes(markerId)) ?? []),
  ]);
}
