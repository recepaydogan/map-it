export interface RaceClass {
  id: string;
  name: string;
  icon?: string;
  newCombination: boolean;
}

export interface RacialAbility {
  name: string;
  kind: "active" | "passive";
  effect: string;
  fullEffect?: string;
  databaseEffect?: string;
  sourceConflict?: boolean;
  icon?: string;
  confirmed: boolean;
  spellId?: number;
}

export interface RaceExclusiveAbility {
  name: string;
  classId: string;
  className: string;
  level: number;
  ranks?: number;
  new: boolean;
  description: string;
  valuesUnavailable: boolean;
  icon?: string;
}

export interface RaceEntry {
  id: string;
  name: string;
  faction: "alliance" | "horde" | "both";
  classCount: number;
  racialCount: number;
  newRace: boolean;
  description: string;
  icon: string;
  classes: RaceClass[];
  racials: RacialAbility[];
  removedRacials: string[];
  exclusiveAbilities: RaceExclusiveAbility[];
  regions: { name: string; sourcePath: string }[];
  factionRules: Record<string, "alliance" | "horde">;
  factionConflicts: string[];
  sourceUrl: string;
}

export interface RaceCatalog {
  version: 1;
  source: string;
  sourceBuild: string;
  races: RaceEntry[];
}
