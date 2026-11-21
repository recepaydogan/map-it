export interface ClassRace {
  id: string;
  name: string;
  icon?: string;
  newCombination: boolean;
}

export interface ClassTalent {
  name: string;
  description: string;
  icon?: string;
}

export interface ClassTree {
  name: string;
  icon?: string;
  new: ClassTalent[];
  changed: string[];
  removed: string[];
}

export interface ClassAbility {
  name: string;
  level?: number;
  passive: boolean;
  specialization: string;
  description: string;
  icon?: string;
}

export interface TrainedAbility {
  name: string;
  levels: number[];
  allRanksCopper: number;
  icon?: string;
}

export interface ClassRelatedSet {
  id: string;
  name: string;
  new: boolean;
  pieces: number;
  level: number;
}

export interface ClassRelatedItem {
  id: string;
  name: string;
  slot: string;
  level: number;
  icon?: string;
}

export interface ClassTrainer {
  id: string;
  name: string;
  location: string;
}

export interface GameClass {
  id: string;
  name: string;
  icon?: string;
  races: { alliance: ClassRace[]; horde: ClassRace[] };
  trees: ClassTree[];
  talentChanges: { new: number; changed: number; removed: number };
  abilities: { new: ClassAbility[]; reworked: string[] };
  trainedAbilities: TrainedAbility[];
  related: {
    sets: { count: number; preview: ClassRelatedSet[] };
    exclusiveItems: { count: number; preview: ClassRelatedItem[] };
    trainers: { count: number; preview: ClassTrainer[] };
  };
}

export interface ClassCatalog {
  version: 1;
  source?: string;
  sourceBuild: string;
  classes: GameClass[];
}
