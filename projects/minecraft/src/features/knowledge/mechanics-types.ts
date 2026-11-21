export const KNOWLEDGE_SUBJECT_KINDS = ["item", "entity", "block", "poi", "biome", "loot", "trade", "enchantment", "advancement"] as const;
export type KnowledgeSubjectKind = typeof KNOWLEDGE_SUBJECT_KINDS[number];

export const KNOWLEDGE_MECHANIC_KINDS = ["drop", "loot", "trade", "barter", "interaction", "equipment", "taming",
  "breeding", "feeding", "breaking", "harvesting", "use", "enchanting", "generation", "progression"] as const;
export type KnowledgeMechanicKind = typeof KNOWLEDGE_MECHANIC_KINDS[number];

export interface LocalizedKnowledgeCopy { name: string; description?: string }
export type LocalizedKnowledgeText = Readonly<Record<string, Readonly<LocalizedKnowledgeCopy>>>;
export type LocalizedKnowledgeNote = Readonly<Record<string, string>>;

export interface KnowledgeSubjectRef {
  kind: KnowledgeSubjectKind;
  id: string;
  count?: Readonly<{ min: number; max: number }>;
  chance?: number;
  note?: LocalizedKnowledgeNote;
  spawn?: Readonly<{ category: string; weight: number; group: Readonly<{ min: number; max: number }> }>;
  drop?: Readonly<{ baseChance?: number; lootingFirstChance?: number; lootingChanceStep?: number;
    requiresPlayerKill?: boolean; lootingAffectsCount?: boolean; smeltsWhenBurning?: boolean; otherConditions?: boolean }>;
}

export interface KnowledgeSubjectRecord {
  kind: KnowledgeSubjectKind;
  id: string;
  text: LocalizedKnowledgeText;
  artwork?: string;
  image?: Readonly<Pick<KnowledgeSubjectRef, "kind" | "id">>;
}

export interface KnowledgeMechanicRecord {
  id: string;
  kind: KnowledgeMechanicKind;
  subject: Readonly<Pick<KnowledgeSubjectRef, "kind" | "id">>;
  text: LocalizedKnowledgeText;
  requirements: readonly KnowledgeSubjectRef[];
  inputs: readonly KnowledgeSubjectRef[];
  outputs: readonly KnowledgeSubjectRef[];
  related: readonly KnowledgeSubjectRef[];
  trade?: Readonly<{ level?: number; maxUses?: number; experience?: number }>;
  enchantment?: Readonly<{
    maxLevel: number;
    weight: number;
    anvilCost: number;
    slots: readonly string[];
    effects: readonly string[];
  }>;
  provenance: Readonly<{ path: string; revision: string; sha256: string; url: string }>;
}

export interface MechanicsCatalogIdentity {
  edition: string;
  version: string;
  revision: string;
  title: string;
  url: string;
}

export interface ValidatedMechanicsCatalog {
  source: Readonly<MechanicsCatalogIdentity>;
  subjects: readonly KnowledgeSubjectRecord[];
  mechanics: readonly KnowledgeMechanicRecord[];
  index: Readonly<Record<string, readonly string[]>>;
}

export const knowledgeSubjectKey = (subject: Pick<KnowledgeSubjectRef, "kind" | "id">) => `${subject.kind}:${subject.id}`;
