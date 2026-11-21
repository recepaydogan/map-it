export interface ReferenceRewardRate {
  kind: "direct" | "pool";
  percent: number;
  poolPercent?: number;
  poolCount?: number;
  poolId?: string;
  quantityMin: number;
  quantityMax: number;
  faction?: string;
  enhancementLevel?: number;
  contextKey?: string;
  levelMin?: number;
  levelMax?: number;
}

export interface ReferenceLink {
  contentGroup?: string;
  challengeLevel?: number;
  unresolvedName?: boolean;
  id: string;
  name: string;
  category: string;
  icon?: string;
  quantity?: number;
  quantityMax?: number;
  note?: string;
  rewardRates?: ReferenceRewardRate[];
  skillDetails?: ReferenceFact[];
}

export interface ReferenceFact {
  label: string;
  value: string | number | boolean;
}

export interface SkillDamageRecord {
  description?: string;
  spec?: string;
  effects: { id: string; levels: [number, number, number, number, number][] }[];
  damageRanges?: ([string, string] | null)[];
  healing?: { id: string; levels: [number, number, number][] }[];
}

export interface ReferenceRow {
  name: string;
  facts?: ReferenceFact[];
  links?: ReferenceLink[];
  description?: string;
  location?: ReferenceLocation;
  locationIcon?: string;
}

export interface ReferenceSection {
  title: string;
  markerIds?: string[];
  text?: string;
  summary?: { key: string; values: Record<string, number> };
  summaryNotice?: string;
  facts?: ReferenceFact[];
  links?: ReferenceLink[];
  rows?: ReferenceRow[];
  tierCards?: {
    countLabel: string;
    valueLabel: string;
    tiers: { count: number; value: string; link: ReferenceLink }[];
  };
  showRewardRates?: boolean;
  imprintResults?: { name: string; chance: number; results: { grade: string; value: number; isPercent: boolean; chance: number }[] }[];
}

export interface ReferenceLocation {
  mapId: string;
  markerId: string;
  name: string;
  referenceId?: string;
}

export interface ReferenceSummary {
  worldBoss?: { mapId: number; region: string; level?: number; spawnType?: string; berserkEnabled?: boolean; schedule?: { id: string; kind: string; time: string; cycle: number; days: number[] } }[];
  adventure?: AdventureSummary;
  travel?: TravelSummary;
  activity?: { kind: "event" | "challenge"; familyId: string; listed?: boolean; level?: number; region?: string; faction?: string; tier?: number; bossLevel?: number; order?: number; enabled?: boolean };
  chunk: string;
  unnamed?: boolean;
  id: string;
  category: string;
  name: string;
  subtitle?: string;
  icon?: string;
  group?: string;
}

export interface AdventureSummary {
  familyId: string;
  kind: string;
  faction: string;
  level: number;
  region?: string;
  difficulty?: string;
  tier?: number;
  partySize?: number;
  entranceAssociation?: "family";
  listed: boolean;
}

export interface TravelSummary {
  kind: "teleport" | "npc" | "rift" | "portal";
  faction: string;
  regions: string[];
  hasMarker: boolean;
  destinationName?: string;
}

export interface DungeonObject {
  id: string;
  name: string;
  description?: string;
  purposes?: { key?: string; text?: string }[];
  requiredMastery?: number;
  items?: ReferenceLink[];
}

export interface DungeonMechanic {
  creatureId: string;
  name: string;
  origin: "encounter" | "skill";
  stats: { name: string; percent: number }[];
  maxStacks: number;
  triggers: { kind: "defeatGroup"; names: string[] }[];
}

export interface CombatCondition { key: string; name?: string }
export interface CombatAbility {
  name: string;
  icon?: string;
  effects: string[];
  description?: string;
  conditional?: { conditions: CombatCondition[]; effects: string[] }[];
}

export interface BossPanelFacts {
  skillIcon?: string;
  scriptedHpPercent?: number[];
  scriptedHpActions?: {
    percent: number;
    summons?: { id: string; count: number }[];
    startsWave?: boolean;
  }[];
  dungeonRole?: "middle" | "final";
  fieldEvent?: { title: string; description: string };
}

export interface BossPanelData {
  version: 1;
  entries: Record<string, BossPanelFacts>;
}

export interface ReferenceEntry extends ReferenceSummary {
  portalRequirements?: {
    RequireType: string;
    RequireValues: unknown[];
    RequireCount: number;
    bIsOptionalRequirement: boolean;
    InteractConditionList: unknown[];
  };
  fieldEvent?: { activityId: string };
  guildHall?: { rentalCost: number; rentalDays: number; extensionWindowDays: number; legionLevel: number };
  instanceLayer?: {
    questAccess: ReferenceLink[];
  };
  interiorMaps?: { mapId: string; insetId: string; nameKey: string }[];
  relatedInteriorMaps?: { mapId: string; insetId: string; nameKey: string }[];
  eventArea?: { mapId: string; regionId: string; nameKey: string };
  chestGuide?: {
    steps: { label: string; optional: boolean }[];
    completionObjectIds: string[];
  };
  rewardObject?: {
    dungeonContexts?: { dungeonId: string; mapId: string; markerIds: string[] }[];
    access?: {
      requirement: "none";
      interactionSeconds: number;
      rewardOnce: boolean;
      eventLinked: boolean;
    };
    keyOnly: boolean;
    keys: ReferenceLink[];
    hiddenOnWorldMap: boolean;
    hiddenOnMiniMap: boolean;
    terrain: string;
    modes: { kind: "normal" | "key"; source: string; items: ReferenceLink[] }[];
    achievements: ReferenceLink[];
  };
  combatGuide?: { abilities: CombatAbility[]; defenses?: DungeonMechanic[] };
  dungeonContexts?: ReferenceLink[];
  dungeonBosses?: { status: "identified" | "unconfirmed"; source: "spawns" | "rewards" | "encounters" | "challenge-table" | "none" };
  dungeonEncounter?: { kinds: string[]; objectives: string[]; eventCount: number };
  dungeonContents?: { enemies: ReferenceLink[]; characters: ReferenceLink[]; resources: DungeonObject[]; objects: DungeonObject[] };
  dungeonBossMechanics?: DungeonMechanic[];
  questRequirements?: { label: string; value?: string; link?: ReferenceLink }[];
  unresolvedRequirements?: boolean;
  arrival?: {
    worldMapId: number;
    mapId?: string;
    mapName?: string;
    status: "resolved" | "region-only" | "map-unavailable";
    points: { actor: string; x?: number; y?: number; world: { X: number; Y: number; Z: number }; source: string }[];
  };
  description?: string;
  facts: ReferenceFact[];
  sections: ReferenceSection[];
  locations: ReferenceLocation[];
  source: string;
  board?: ReferenceNode[];
}

export interface ReferenceNode {
  id: string;
  row: number;
  column: number;
  name: string;
  cost: number;
  level: number;
  grade: string;
  automatic: boolean;
  bonuses?: ReferenceFact[];
  facts: ReferenceFact[];
  links: ReferenceLink[];
}

export interface ReferenceIndex {
  version: 1;
  categories: { id: string; count: number }[];
  entries: ReferenceSummary[];
}

export interface ReferenceTarget {
  quantity?: number;
  quantityMax?: number;
  rewardRates?: ReferenceRewardRate[];
  enhancementLevel?: number;
  category: string;
  group?: string;
  id: string;
  name?: string;
  dungeonId?: string;
  creatureVariants?: ReferenceLink[];
}
export type OpenReference = (target: ReferenceTarget) => void;

export interface ReferenceNavigationProps {
  backLabel?: string;
  onBack?: () => void;
  onCurrentChange?: OpenReference;
}
