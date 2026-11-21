import type { ReferenceLink, ReferenceLocation } from "./reference-types";

export interface CollectiblePoint {
  id: string;
  aliases: string[];
  name: string;
  terrain: "ground" | "air" | "water";
  x: number;
  y: number;
  world: { X: number; Y: number; Z: number };
  quantity: number;
}
export interface CollectibleRegion {
  id: string;
  mapId: string;
  name: string;
  points: CollectiblePoint[];
}
export interface CollectibleStat { id: string; name: string; value: number | null }
export interface CollectibleLevel { level: number; items: ReferenceLink[]; stats: CollectibleStat[] }
export interface CollectibleTrack extends ReferenceLink {
  faction: string;
  locations: (ReferenceLocation & { x: number; y: number })[];
  levels: CollectibleLevel[];
}
export interface CollectibleProgression {
  item: ReferenceLink;
  regions: CollectibleRegion[];
  tracks: CollectibleTrack[];
  exchanges: { id: string; level: number; trackId: string; cost: number; result: ReferenceLink; characterLimit: number }[];
}
export interface CollectibleProgressionData {
  version: 1;
  items: Record<string, CollectibleProgression>;
  references: Record<string, string>;
}
