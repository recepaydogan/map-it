import type { ReferenceLink } from "../reference/reference-types";

export interface IntelStat { key: string; name: string; value: number; percent: boolean; description: string }
export interface MapPoint { mapId: string; mapName: string; x: number; y: number; conditional?: boolean }
export interface UpgradeStep {
  level: number; probability: number; correction: number; penalty: number | null;
  gold: number; currency: string; materials: (ReferenceLink & { quantity: number; level: number })[]; costsComplete: boolean;
}
export interface UpgradeData { version: 1; groups: Record<string, UpgradeStep[]> }
export interface SkillRoll { class: string; skill: ReferenceLink; base: number; maximum: number; weight: number }
export interface SkillRollData { version: 1; items: Record<string, string>; pools: Record<string, SkillRoll[]> }
export interface TitleIntel {
  faction: string; passive: IntelStat[]; equipped: IntelStat[]; items: ReferenceLink[]; sources: ReferenceLink[]; visible: boolean; dated: boolean;
  artwork?: { background?: string; icon?: string };
}
export interface TitleData { version: 1; entries: Record<string, TitleIntel> }
export interface CompanionData { version: 1; entries: Record<string, {
  required: number; soul: ReferenceLink; available: boolean; sources: { npc: ReferenceLink; points: MapPoint[] }[];
}> }
export interface CollectionData { version: 1; objectives: { target: ReferenceLink; faction: string; count: number; items: string[]; rewards: ReferenceLink[] }[] }
export interface CombatData { version: 1; entries: Record<string, { berserkSeconds: number | null; groggySeconds: number | null }> }
export interface SpecialItemDetailsData {
  version: 1;
  extendableWeapons: string[];
  kisks: Record<string, { maxMembers: number; maxResurrections: number; durationSeconds: number }>;
  hiddenRecipes: string[];
}
export interface SkinData { version: 1; skins: { id: string; name: string; items: ReferenceLink[] }[] }
export interface ScheduleData { version: 1; schedules: { id: string; name: string; kind: "boss" | "rift"; targets: ReferenceLink[]; days: number[]; minutes: number[]; points: MapPoint[]; spawnerName: string; cycleMinutes?: number; entityId?: string; riftId?: string }[] }
