export interface MarkerItemIntel {
  armor?: number | null
  armorPerLevel?: number | null
  attackForce?: number | null
  amountMax?: number
  amountMin?: number
  backstabBonus?: number | null
  blockPower?: number | null
  blockPowerPerLevel?: number | null
  bossOfferingUse?: { bossName: string; count: number } | null
  chance?: number
  count?: number
  craftedBy?: MarkerItemRecipeIntel[]
  damages?: Record<string, number>
  damagesPerLevel?: Record<string, number>
  deflectionForce?: number | null
  deflectionForcePerLevel?: number | null
  description: string
  displayable?: boolean
  dropSources?: MarkerItemDropSourceIntel[]
  eitrRegenModifier?: number | null
  equipEffect?: { name: string; description: string } | null
  equipmentDamageModifiers?: Array<{ type: string; modifier: number }>
  food?: number | null
  foodDurationSeconds?: number | null
  foodEitr?: number | null
  foodRegen?: number | null
  foodStamina?: number | null
  icon: string | null
  maxDurability?: number | null
  maxQuality?: number | null
  maxStack?: number | null
  movementModifier?: number | null
  name: string
  onePerPlayer?: boolean
  prefabName: string
  price?: number
  primaryAttackEitr?: number | null
  primaryAttackStamina?: number | null
  questItem?: boolean
  repairable?: boolean
  requiredGlobalKey?: string
  secondaryAttackEitr?: number | null
  secondaryAttackStamina?: number | null
  setEffect?: { name: string; description: string } | null
  setName?: string | null
  setSize?: number | null
  specialUse?: string | null
  stack?: number
  teleportable?: boolean | null
  timedBlockBonus?: number | null
  toolTier?: number | null
  type?: string
  usedInRecipes?: MarkerItemRecipeUseIntel[]
  useDurability?: boolean
  value?: number | null
  weight?: number | null
  durabilityPerLevel?: number | null
  forsakenPowerBoss?: string | null
}

export interface MarkerItemReferenceIntel {
  icon: string | null
  name: string
  prefabName: string
}

export interface MarkerItemRecipeResourceIntel extends MarkerItemReferenceIntel {
  amount: number
  /** Extra cost per quality level; see `calculate-upgrades.ts`. */
  amountPerLevel?: number
}

export interface MarkerItemRecipeIntel {
  /** Stable recipe identity, shared with the planner catalog. */
  recipeId?: string
  outputAmount: number
  resources: MarkerItemRecipeResourceIntel[]
  stationLevel: number
  stationPrefab: string
}

export interface MarkerItemRecipeUseIntel extends MarkerItemReferenceIntel {
  amount: number
  outputAmount: number
  stationPrefab: string
}

export interface MarkerItemDropSourceIntel {
  amountMax: number
  amountMin: number
  boss: boolean
  chance: number
  name: string
  onePerPlayer: boolean
  prefabName: string
}

export interface CharacterIntel {
  alertRange: number | null
  boss: boolean
  canSwim: boolean
  damageModifiers: Record<string, number>
  drops: MarkerItemIntel[]
  /** Rewards across verified death/spawn transitions; drops remains phase-specific. */
  encounterDrops?: MarkerItemIntel[]
  equipment: string[]
  faction: string
  health: number | null
  name: string
  portrait: string | null
  prefabName: string
  runSpeed: number | null
  staggerWhenBlocked: boolean
  viewRange: number | null
  walkSpeed: number | null
}

export interface BossPowerIntel {
  cooldownSeconds: number | null
  description: string
  durationSeconds: number | null
  name: string
}

export interface MarkerIntelligence {
  schemaVersion: number
  bossOfferings: Record<string, MarkerItemIntel>
  bossPowers: Record<string, BossPowerIntel>
  characters: Record<string, CharacterIntel>
  items: Record<string, MarkerItemIntel>
  traders: Record<string, TraderIntel>
}

export interface TraderIntel {
  services?: Array<{ id: string; name: string; description: string; price: number; requiredGlobalKey: string }>
  items: MarkerItemIntel[]
  name: string
  prefabName: string
}
