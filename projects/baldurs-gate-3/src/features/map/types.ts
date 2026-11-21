/** A named area of the map: the "jump to" targets and the labels drawn over the world. */
export interface MapRegion {
  id: string;
  name: string;
  x: number;
  y: number;
}

/** A point of interest shipped with the map data. */
export interface MapLocation {
  id: string;
  name: string;
  /** One of the ids in map-config.ts `MAP_CATEGORIES`. */
  category: string;
  /** Secondary filter facets; the primary category still controls marker appearance. */
  categoryFacets?: string[];
  /** Short kind label shown under the name ("Gas station", "Boss arena"). */
  label: string;
  /** Free-form sub-kind, searchable but never displayed on its own. */
  subtype: string;
  regionId: string;
  region: string;
  x: number;
  y: number;
  /** Optional longer text shown in the details panel. */
  description?: string;
  /** Stable content entity referenced by this placement. */
  contentId?: string;
  /** Search-only terms supplied by generated game data. */
  searchTerms?: string[];
  /** Present in the global search index; omitted from a map's local payload. */
  mapId?: string;
  mapName?: string;
  /** Present in the global index when the linked entity carries item/build facets. */
  gameplay?: MapSearchGameplayFacets;
  /** Original submap coordinate when this point is projected into a composite atlas. */
  sourceCoordinate?: MapCoordinate;
}

export interface MapSearchIndexLocation extends MapLocation {
  mapId: string;
  mapName: string;
}

export interface MapSearchGameplayFacets {
  rarity?: string;
  slot?: string;
  armorType?: string;
  weaponType?: string;
  proficiency?: string;
  unique?: boolean;
}

export interface MapSearchIndex {
  schemaVersion: number;
  sourceBuilds: string[];
  maps: {
    id: string;
    name: string;
    locationCount: number;
    bounds: MapMetadata["bounds"];
  }[];
  locations: MapSearchIndexLocation[];
  relationships: MapSearchRelationshipGroup[];
  connections: MapSearchConnection[];
}

export interface MapSearchConnection {
  id: string;
  evidence: "reciprocal-navigation-portal" | "navigation-portal-target";
  confidence: "verified";
  endpoints: [
    { mapId: string; locationId: string },
    { mapId: string; locationId: string },
  ];
  sourcePortalIds: [string, string];
  sourceToTargetDistance: number;
  targetToSourceDistance: number;
}

export interface MapSearchRelationshipGroup {
  id: string;
  kind: "exact-name-match";
  confidence: "uncertain";
  name: string;
  category: string;
  appearances: { mapId: string; locationId: string }[];
}

export type MapSpoilerLevel = "hint" | "guide" | "full";

export interface MapSpoilerBlock {
  id: string;
  level: MapSpoilerLevel;
  title: string;
  body: string;
}

export interface MapContentProvenance {
  sourcePath: string;
  sourceBuild?: string;
}

export interface MapGameplayMetadata {
  id: string;
  type?: string;
  parent?: string;
  rootTemplate?: string;
  rarity?: string;
  slot?: string;
  armorClass?: string;
  armorType?: string;
  weaponType?: string;
  damage?: string;
  damageType?: string;
  proficiency?: string;
  unique?: boolean;
  weight?: string;
  value?: string;
  boosts?: string[];
  passives?: string[];
  requirements?: string[];
  combat?: MapCharacterCombatProfile;
  provenance?: string;
}

export interface MapAccessLink {
  contentId: string;
  title: string;
  role: "key" | "lock";
}

export interface MapAccessProfile {
  role: "key" | "lock";
  keyId: string;
  locked: boolean;
  difficultyClassId?: string;
  difficultyClassName?: string;
  difficultyClass?: number;
  related: MapAccessLink[];
}

export interface MapPuzzleCombinationProfile {
  role: "receptacle" | "ingredient";
  related: Array<{
    combinationId: string;
    contentId: string;
    title: string;
    role: "receptacle" | "ingredient";
  }>;
}

export interface MapNavigationPortalProfile {
  id: string;
  instanceId: string;
  module: string;
  level: string;
  sourceRegionId: string;
  targetRegionId: string;
  sourcePosition: { x: number; y: number; z: number };
  targetPosition: { x: number; y: number; z: number };
}

export interface MapNavigationDestinationProfile {
  portalId: string;
  instanceId: string;
  module: string;
  level: string;
  kind: "vertical-connection" | "transition";
  sourcePosition: { x: number; y: number; z: number };
  targetPosition: { x: number; y: number; z: number };
}

export interface MapInspirationEvent {
  id: string;
  internalName: string;
  act?: string;
  inspirationPoints: number;
  rewardLevel: number;
  localizedTitles: Record<string, string>;
  localizedDescriptions: Record<string, string>;
  background?: {
    id: string;
    passives?: string;
    localizedNames: Record<string, string>;
    localizedDescriptions: Record<string, string>;
  };
  characters?: Array<{
    id: string;
    localizedNames: Record<string, string>;
  }>;
  placementEvidence?: {
    kind: "direct-object" | "story-rule" | "quest-stats";
    objectId?: string;
    level?: string;
    placementKind?: string;
    internalName?: string;
    localizedNames?: Record<string, string>;
    triggerStatement?: string;
    sourcePath?: string;
    sourceLine?: number;
    questId?: string;
  };
}

export interface MapInspirationProfile {
  eventCount: number;
  events: MapInspirationEvent[];
}

export interface MapRandomLootPool {
  tableId: string;
  stockCategories: string[];
  namedStock: string[];
  possibleLoot?: Array<{
    id: string;
    kind: "item" | "category";
    title: string;
    initialChance?: number;
    statsId?: string;
  }>;
}

export interface MapLootAvailability {
  id: string;
  /** Overrides death acquisition only; other inventory methods stay separate. */
  deathDropsUnavailable?: true;
  localizedConditions: Record<string, string>;
  evidence: Array<{ sourcePath: string; sourceLine: number; statement: string }>;
}

export interface MapSceneEquipmentChange {
  mode: "replace-equipped-slots" | "give-equipment-set" | "copy-equipped";
  /** Copy source's runtime equipment, not its bag or guaranteed obtainable loot. */
  sourceCharacterContentId?: string;
  definitionId: string;
  removedSlots: string[];
  localizedConditions: Record<string, string>;
  evidence: MapLootAvailability["evidence"];
  unresolvedEntries?: Array<{
    statsId: string;
    reason: "equipment-definition-reference-not-resolved-item";
    evidence: MapLootAvailability["evidence"];
  }>;
  items: Array<{
    itemId: string;
    templateId: string;
    statsId: string;
    title: string;
    localizedNames: Record<string, string>;
    amount: number;
    evidence: MapLootAvailability["evidence"];
  }>;
}

export interface MapSceneItemTransfer {
  id: string;
  mode: "move-existing-item";
  objectId: string;
  destinationContentId: string;
  localizedConditions: Record<string, string>;
  evidence: MapLootAvailability["evidence"];
  item: MapSceneEquipmentChange["items"][number];
}

export interface MapSceneContext {
  id: string;
  localizedDescriptions: Record<string, string>;
  evidence: MapLootAvailability["evidence"];
  authoredTitles?: Record<string, string>;
  /** Original source encounter only; never used as current-scene combat data. */
  authoredCombat?: MapCharacterCombatProfile;
  /** Original inventory before scene conditions; not guaranteed current loot. */
  authoredLoot?: MapDeathLootProfile;
  /** Source trade pool before a scene inventory transfer; not current stock. */
  authoredTradeInventory?: MapNativeTradeInventory;
  equipmentChange?: MapSceneEquipmentChange;
  /** Existing physical objects moved by a scene, not new copies or loot rights. */
  itemTransfers?: MapSceneItemTransfer[];
  authoredIconId?: string;
  appearance?: {
    /** Project identity only when native stat-transformation semantics are unresolved. */
    projection?: "identity-only";
    authoredStatsId?: string;
    templateId: string;
    iconId: string;
    statsId: string;
    ruleId: string;
    sourcePath: string;
    ruleSourcePath: string;
  };
  inventoryChange?: {
    mode: "transfer-and-equip";
    destinationContentId: string;
    transferOptions: {
      moveEquippedArmor: boolean;
      moveEquippedWeapons: boolean;
      clearOriginalOwner: boolean;
      moveVanityClothing: boolean;
    };
    preservesStoryItems: true;
    contractSource: string;
    localizedConditions: Record<string, string>;
    evidence: MapLootAvailability["evidence"];
    branches: Array<{
      id: string;
      reviewOnly?: true;
      requiredGlobalFlags: Array<{ flagId: string; value: 0 | 1 }>;
      localizedConditions: Record<string, string>;
      items: Array<{
        itemId: string;
        templateId: string;
        statsId: string;
        title: string;
        localizedNames: Record<string, string>;
        amount: number;
        evidence: MapLootAvailability["evidence"];
      }>;
    }>;
  };
}

export interface MapDeathLootProfile {
  /** Applies to the entire authored profile, including initially fixed drops. */
  availability?: MapLootAvailability;
  guaranteedDrops: Array<{
    itemName: string;
    objectId?: string;
    templateId?: string;
    title: string;
    amount: number;
    canBePickpocketed: boolean;
    guaranteedOnDeath: true;
    inventoryCondition?: import("../../lib/inventory-quantity.mjs").InventoryCondition;
    equipmentSource?: {
      definitionId: string;
      itemId: string;
      sourcePath: string;
      groups: Array<{ groupIndex: number; sourceLine: number }>;
    };
    statsId?: string;
    rarity?: string;
    slot?: string;
    unique?: boolean;
  }>;
  treasureTables: string[];
  randomLootPools: MapRandomLootPool[];
}

export interface MapTrapProfile {
  type: "tripwire" | "pressure-plate" | "proximity-mine" | "vent" | "trapped-container" | "rune" | "trap";
  authoredTrapFlag: boolean;
  difficultyClassId?: string;
  difficultyClassName?: string;
  difficultyClass?: number;
}

export interface MapHiddenPassageProfile {
  authoredSecretDoor: boolean;
  storyRegistered: boolean;
}

export interface MapRecipeUnlockProfile {
  recipes: Array<{ id: string; title: string }>;
}

export interface MapReadableImpactProfile {
  exactObjectMatch: boolean;
  templateMatch: boolean;
  flags: Array<{
    id: string;
    kind: "knowledge" | "map-reveal";
    flagId: string;
    title: string;
    evidence: Array<{ sourcePath: string; sourceLine: number; statement: string }>;
  }>;
  questUpdates: Array<{
    id: string;
    questId: string;
    stateId: string;
    localizedQuestTitles: Record<string, string>;
    localizedStateDescriptions: Record<string, string>;
    evidence: Array<{ sourcePath: string; sourceLine: number; statement: string }>;
  }>;
}

export interface MapItemStoryImpactProfile {
  exactObjectMatch: boolean;
  templateMatch: boolean;
  highValue: boolean;
  acquisition?: {
    kind: "head-removal";
    sourceContentId: string;
    sourceTitle: string;
    dynamic: boolean;
    resolvedToSource: boolean;
    evidence: Array<{ sourcePath: string; sourceLine: number; statement: string }>;
  };
  carrying: Array<{
    flagId: string;
    title: string;
    evidence: Array<{ sourcePath: string; sourceLine: number; statement: string }>;
  }>;
  handIns: Array<{
    flagId: string;
    title: string;
    evidence: Array<{ sourcePath: string; sourceLine: number; statement: string }>;
  }>;
  questUpdates: Array<{
    id: string;
    trigger: "carrying" | "hand-in";
    questId: string;
    stateId: string;
    conditional: boolean;
    localizedQuestTitles: Record<string, string>;
    localizedStateDescriptions: Record<string, string>;
    evidence: Array<{ sourcePath: string; sourceLine: number; statement: string }>;
  }>;
}

export interface MapItemLocationProfile {
  kind: "inventory-owner" | "initial-inventory";
  ownerContentId: string;
  ownerKind: "character" | "container";
  ownerTitle: string;
  droppedOnDeath: boolean;
  pickpocketable: boolean;
  tradeable: boolean;
  evidence: Array<{ sourcePath: string }>;
}

export interface MapOwnershipProfile {
  kind: "crime-owner";
  ownerContentId?: string;
  ownerTitle?: string;
  unauthorizedInteractionRisk: boolean;
  initiallyOwned?: boolean;
  ownershipCanChange?: boolean;
  evidence: Array<{ sourcePath: string }>;
}

export interface MapDiggableSecretProfile {
  kind: "buried-mound" | "sewer-dig-spot";
  mapMarkerId?: string;
  revealedByMap: boolean;
  buriedChest?: {
    contentId: string;
    title: string;
    loot?: MapContainerLootProfile;
  };
}

export interface MapMechanismProfile {
  role: "controller" | "target" | "moving-object";
  controllerKind: "lever" | "button" | "trial-object" | "plaque" | "moving-object";
  related: Array<{
    linkId: string;
    contentId: string;
    title: string;
    role: "controller" | "target";
    controllerKind: "lever" | "button" | "trial-object" | "plaque";
    targetKind: "door" | "cage" | "gate" | "secret-door" | "elevator-stop";
    action:
      | "opens-closes"
      | "unlocks-opens-once"
      | "opens-secret-door"
      | "trial-unlocks-door"
      | "sequence-opens-secret-passage"
      | "moves-elevator-down"
      | "moves-elevator-up";
  }>;
  effects?: Array<{
    effectId: string;
    controllerKind: "lever";
    action:
      | "moves-platform-horizontally"
      | "moves-platform-vertically"
      | "moves-elevator-down"
      | "moves-elevator-up"
      | "moves-elevator"
      | "makes-captives-hostile"
      | "kills-captives"
      | "frees-captives"
      | "activates-transformation-pod";
  }>;
  movements?: Array<{
    movementId: string;
    action:
      | "deploys-shortcut-ladder"
      | "traces-fire-surface-then-explodes"
      | "rolls-along-damaging-path"
      | "reveals-hidden-safe"
      | "opens-secret-passage"
      | "opens-closes-secret-passage";
    destinationContentId: string;
    destinationTitle: string;
  }>;
  sequence?: {
    puzzleId: string;
    title: string;
    solution?: string;
    role: "step" | "result";
    currentStep?: number;
    steps: Array<{
      order: number;
      contentId: string;
      title: string;
      clue?: string;
    }>;
    result: {
      contentId: string;
      title: string;
      action: "opens-secret-passage";
    };
  };
}

export type MapStoryInteractionOutcome =
  | {
      kind: "opens" | "unlocks" | "closes" | "locks" | "enables-interaction" | "disables-interaction" | "reveals";
      targetContentId: string;
      targetTitle: string;
    }
  | {
      kind: "quest-update";
      questId: string;
      stateId: string;
    };

export interface MapStoryInteractionProfile {
  triggerPredicates: string[];
  outcomes: MapStoryInteractionOutcome[];
  evidence: Array<{ sourcePath: string; sourceLine: number; statement: string }>;
}

export interface MapStoryOwnershipZoneProfile {
  levels: string[];
  owners: Array<{
    contentId: string;
    title: string;
    conditional: boolean;
    fallback: boolean;
    shopOwner: boolean;
  }>;
  evidence: Array<{ sourcePath: string; sourceLine: number; statement: string }>;
}

export interface MapAdamantineForgeProfile {
  role: "forge" | "mold" | "ore";
  recipes: Array<{
    id: string;
    title: string;
    statId: string;
    resultTemplateId: string;
    moldTemplateId: string;
    gameplay?: MapGameplayMetadata;
  }>;
}

export interface MapSecretPuzzleProfile {
  id: string;
  title: string;
  kind: "reveal-two-buttons";
  role: "stone" | "button" | "target";
  pairIndex?: number;
  requiredButtonCount: number;
  stones: Array<{ contentId: string; title: string }>;
  buttons: Array<{ contentId: string; title: string }>;
  target: { contentId: string; title: string };
}

export type MapWyrmwayPuzzleProfile =
  | MapWyrmwayChessProfile
  | MapWyrmwayInsightProfile
  | MapWyrmwayJusticeProfile
  | MapWyrmwayCourageProfile;

export interface MapWyrmwayChessProfile {
  kind: "chess";
  role: "anchor";
  id: string;
  title: string;
  variants: Array<{
    variant: number;
    moves: Array<{
      step: number;
      from: { objectId: string; token: string; notation: string };
      to: { objectId: string; token: string; notation: string };
    }>;
  }>;
}

export interface MapWyrmwayInsightProfile {
  kind: "insight";
  role: "anchor" | "suspect";
  id: string;
  title: string;
  currentSuspectId?: string;
  suspects: Array<{ contentId: string; title: string; correct: boolean }>;
  evidenceBooks: Array<{
    birdContentId: string;
    birdTitle: string;
    bookContentId: string;
    bookTitle: string;
  }>;
}

export interface MapWyrmwayJusticeProfile {
  kind: "justice";
  role: "anchor" | "painting";
  id: string;
  title: string;
  currentPaintingId?: string;
  paintings: Array<{ contentId: string; title: string; correct: boolean }>;
}

export interface MapWyrmwayCourageProfile {
  kind: "courage";
  role: "anchor";
  id: string;
  title: string;
  timer: number;
  enemies: Array<{ contentId: string; title: string; phase: number }>;
}

export type MapCrechePuzzleProfile = MapCrecheStatuePuzzleProfile | MapCrecheWeaponsPuzzleProfile;

export interface MapCrecheStatuePuzzleProfile {
  kind: "statues";
  role: "statue" | "clue" | "result";
  currentObjectId?: string;
  id: string;
  title: string;
  statues: Array<{
    contentId: string;
    title: string;
    role: "sunrise" | "sunset";
    minRotationY: number;
    maxRotationY: number;
  }>;
  clueBook: { contentId: string; title: string };
  rotationStepDegrees: number;
  stuckSunsetSolutions: { surfaces: string[]; minimumDamage: number; athleticsDc: number };
  resultDoor: { contentId: string; title: string };
}

export interface MapCrecheWeaponsPuzzleProfile {
  kind: "weapons";
  role: "pedestal" | "ceremonial-weapon" | "reward" | "result";
  currentPedestalIndex?: number;
  id: string;
  title: string;
  pedestals: Array<{
    index: number;
    plaqueContentId: string;
    plaqueTitle: string;
    weaponType: string;
    ceremonialWeaponContentId: string;
    ceremonialWeaponTitle: string;
    preSolved: boolean;
  }>;
  acceptsGenericWeapons: boolean;
  incorrectWeaponPenalty: { damage: number; damageType: string; knockdownDuration: number };
  reward: { containerContentId: string; containerTitle: string; doorContentId: string; doorTitle: string };
}

export interface MapArcaneTowerTransportProfile {
  role: "button" | "destination" | "generator" | "secret-ring";
  currentButtonId?: string;
  currentFloor?: number;
  id: string;
  title: string;
  powerIngredient: string;
  blockedArcanaDc: number;
  generator: { contentId: string; title: string };
  secretRing: { contentId: string; title: string };
  routes: Array<{
    buttonContentId: string;
    buttonTitle: string;
    atFloor: number;
    toFloor: number;
    destinationContentId: string;
    destinationTitle: string;
    hidden: boolean;
  }>;
}

export interface MapSharEntrancePuzzleProfile {
  role: "brazier" | "central-switch" | "result-door";
  corner?: "NE" | "NW" | "SE" | "SW";
  id: string;
  title: string;
  braziers: number;
  corners: number;
  lightDetectors: number;
  barrierRings: number;
  hazards: { ringPushbackDelayMs: number; fireFloodTimer: number; fireTrapPoints: unknown[] };
  centralSwitch: { contentId: string; title: string };
  results: Array<{
    contentId: string;
    title: string;
    effect: "removes-arcane-lock" | "unlocks-and-opens";
  }>;
}

export interface MapBalthazarSecretRoomProfile {
  role: "book" | "altar" | "door" | "research";
  currentBookId?: string;
  id: string;
  title: string;
  books: Array<{
    contentId: string;
    title: string;
    effect: "reveals-heart-altar" | "spike-trap" | "decoy";
  }>;
  heartAltar: { contentId: string; title: string };
  acceptsAnyBodyPart: boolean;
  secretDoor: { contentId: string; title: string };
  secretResearch: { contentId: string; title: string };
}

export interface MapMinscSluicePuzzleProfile {
  role: "valve" | "indicator" | "gate" | "force-valve" | "release-valve" | "disabled-valve";
  currentValveKind?: "water" | "temperature";
  id: string;
  title: string;
  solutionStage: number;
  valves: Array<{
    kind: "water" | "temperature";
    valveContentId: string;
    valveTitle: string;
    indicatorContentId: string;
    indicatorTitle: string;
    incrementSeconds: number;
    stages: Array<{ stage: number; durationSeconds: number }>;
  }>;
  gates: Array<{ contentId: string; title: string }>;
  forceValves: Array<{ contentId: string; title: string }>;
  forceCheck: {
    skill: string;
    difficultyClassId: string;
    difficultyClassName: string;
    difficultyClass: number;
  };
  releaseValve: { contentId: string; title: string };
  disabledValves: Array<{ contentId: string; title: string }>;
  elementalAdjustment: {
    targetValveId: string;
    heatDamageType: string;
    coolDamageType: string;
    heatDurationSeconds: number;
    coolDurationSeconds: number;
  };
  overload: {
    stage: number;
    durationSeconds: number;
    releaseToStage: number;
    waterHazard: string;
    temperatureHazard: string;
  };
}

export interface MapContainerLootProfile {
  items: Array<{
    itemName: string;
    objectId?: string;
    templateId?: string;
    title: string;
    amount: number;
    tradeable: boolean;
    difficulties: string[];
    inventoryCondition?: import("../../lib/inventory-quantity.mjs").InventoryCondition;
    statsId?: string;
    rarity?: string;
    slot?: string;
    unique?: boolean;
  }>;
  randomLootPools: MapRandomLootPool[];
}

export interface MapCharacterCombatProfile {
  vitality?: string;
  baseArmor?: string;
  abilities?: Partial<Record<MapAbility, string>>;
  spellCastingAbility?: string;
  movement?: string;
  darkvisionRange?: string;
  resistances?: MapCharacterResistance[];
  statusImmunities?: string[];
  passives?: string[];
}

export type MapAbility = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";

export interface MapCharacterResistance {
  type: string;
  value: string;
}

export interface MapQuestProfile {
  questCount: number;
  objectiveCount: number;
  journalStepCount: number;
  primaryMarkerTitle?: string;
  quests: MapQuestEntry[];
}

export interface MapQuestEntry {
  id: string;
  guid?: string;
  categoryId?: string;
  parentQuestId?: string;
  localizedTitles?: Record<string, string>;
  objectives: MapQuestObjective[];
}

export interface MapQuestObjective {
  id: string;
  guid?: string;
  localizedDescriptions?: Record<string, string>;
  priority: number;
  markerIds: string[];
  markerLevel?: string;
  markerTargetType?: string;
  localizedMarkerTitles?: Record<string, string>;
  steps: MapQuestJournalStep[];
}

export interface MapQuestJournalStep {
  id: string;
  guid: string;
  localizedDescriptions?: Record<string, string>;
  dialogFlagId?: string;
  statTriggerId?: string;
  experienceReward?: MapQuestExperienceReward;
  areaLevel?: MapQuestAreaLevel;
  levelOverride?: number;
  questRewardLevel?: number;
  conditionalRules?: MapQuestConditionalRule[];
}

export interface MapQuestConditionalRule {
  id: string;
  trigger: MapQuestStoryFlag;
  condition: MapQuestStoryFlag;
  expected: boolean;
  provenance: string;
}

export interface MapQuestStoryFlag {
  id: string;
  internalName: string;
  title: string;
}

export interface MapQuestExperienceReward {
  id: string;
  name: string;
  rewardType: number;
  levelSource: number;
  module: string;
  provenance: string;
}

export interface MapQuestAreaLevel {
  id: string;
  name: string;
  entityLevel: number;
  treasureLevel: number;
  parentId?: string;
  module: string;
  provenance: string;
}

export interface MapWorldCheckProfile {
  checkCount: number;
  knowledgeCheckCount: number;
  skillCheckCount: number;
  savingThrowCount: number;
  ambushCount: number;
  skills: string[];
  categories: Array<"secret" | "puzzle" | "encounter">;
  primaryTitle?: string;
  checks: MapWorldCheckEntry[];
}

export interface MapWorldCheckEntry {
  id: string;
  type: "knowledge-check" | "skill-check" | "saving-throw" | "ambush";
  category: "secret" | "puzzle" | "encounter";
  targetObjectId: string;
  title: string;
  checkId?: string;
  skill?: string;
  difficultyClassId?: string;
  difficultyClassName?: string;
  difficultyClass?: number;
  dialogId?: string;
  successFlagId?: string;
  ambushTriggerObjectId?: string;
  detectionTriggerObjectId?: string;
  ambusherCount?: number;
  ambushers?: Array<{
    contentId: string;
    title: string;
    localizedTitles?: Record<string, string>;
    provenance: string;
    sourceLine: number;
  }>;
  module: string;
  provenance: string;
  sourceLine: number;
}

export interface MapStoryRiskProfile {
  riskCount: number;
  types: Array<"rest-deadline" | "point-of-no-return">;
  primaryTitle?: string;
  risks: MapStoryRiskEntry[];
}

export interface MapStoryRiskEntry {
  id: string;
  targetObjectId: string;
  type: "rest-deadline" | "point-of-no-return";
  title: string;
  severity: "critical";
  affectedLevelIds?: string[];
  evidence: Array<{
    provenance: string;
    sourceLine: number;
    statement: string;
  }>;
}

export interface MapPermanentBonusProfile {
  interactionCount: number;
  primaryTitle?: string;
  interactions: MapPermanentBonusInteraction[];
}

export interface MapPermanentBonusInteraction {
  id: string;
  targetObjectId: string;
  title: string;
  dialogParticipantId: string;
  dialogId: string;
  dialogTitle: string;
  prayerMemoryRollBonus: number;
  boons: Array<{
    ability: MapAbility;
    amount: number;
    maximum: number;
    raw: string;
    passiveId: string;
    stateId: string;
    flagId: string;
    provenance: string;
    sourceLine: number;
    statsProvenance: string;
  }>;
  sacrifices: Array<{
    ability: MapAbility;
    statusId: string;
    stateId: string;
    flagId: string;
    provenance: string;
    sourceLine: number;
  }>;
  checks: Array<{
    id: string;
    skill?: string;
    ability?: string;
    difficultyClass?: number;
    localizedText?: Record<string, string>;
  }>;
  forbiddenKnowledge: {
    tagId: string;
    passiveId: string;
    spellId: string;
  };
  evidence: Array<{
    provenance: string;
    sourceLine: number;
    statement: string;
    occurrence?: number;
  }>;
}

export interface MapRescuePlanHostage {
  id: string;
  characterId: string;
  targetObjectId: string;
  title: string;
  group: number;
  conditional: boolean;
  presenceFlagId?: string;
  internalName: string;
  worldPosition: { x: number; y: number; z: number };
}

export interface MapRescuePlanProfile {
  planId: string;
  title: string;
  role: "hostage" | "escape";
  turnLimits: { easy: number; medium: number; hard: number };
  floodTurn: number;
  floodPositionCount: number;
  fixedHostageCount: number;
  conditionalHostageCount: number;
  totalPossibleHostages: number;
  escapeTargetId: string;
  currentHostage?: MapRescuePlanHostage;
  hostages: MapRescuePlanHostage[];
  evidence: Array<{
    provenance: string;
    sourceLine: number;
    statement: string;
    occurrence?: number;
  }>;
}

export interface MapWaypointProfile {
  id: string;
  group: "Act1" | "Act1b" | "Act2" | "Act3" | "Act3b" | string;
  shrineId: string;
  triggerId: string;
  localizedNames: Record<string, string>;
  triggerPosition: { x: number; y: number; z: number };
  activationDistance: number;
}

/** Content identity is separate from placements so one entity can appear on several maps. */
export interface MapPartyMemberDefinition {
  id: string;
  internalName?: string;
  localizedNames: Record<string, string>;
}

export interface MapPartyMemberPosition {
  id: string;
  kind: "authored" | "story";
  contentId: string;
  level: string;
  localizedConditions?: Record<string, string>;
}

/** A recruitable origin: who they are and every place the story puts them. */
export interface MapPartyMemberProfile {
  memberId: string;
  originId: string;
  localizedNames: Record<string, string>;
  localizedDescriptions?: Record<string, string>;
  race?: MapPartyMemberDefinition | null;
  subRace?: MapPartyMemberDefinition | null;
  class?: MapPartyMemberDefinition | null;
  subClass?: MapPartyMemberDefinition | null;
  quests: Array<{ id: string; guid?: string; localizedTitles?: Record<string, string> }>;
  /** Missing on a story-destination copy that is not one of the curated positions. */
  currentPositionId?: string;
  positions: MapPartyMemberPosition[];
  evidence: Array<{ sourcePath: string; sourceLine?: number; statement?: string }>;
}

export interface MapTradeStockProfile {
  tradeTables: string[];
  stockCategories: string[];
  namedStock: string[];
  conditionalStock?: Array<{
    id: string;
    tradeTables: string[];
    stockIds: string[];
    namedStock: string[];
    localizedConditions: Record<string, string>;
  }>;
}

export interface MapNativeTradeInventory extends MapTradeStockProfile {
  sourceKind: "native-trade-pool";
  availability: "unverified";
  scope: "authored-placement";
  stockIds: string[];
  unresolvedTradeTables?: string[];
  unresolvedStockIds?: string[];
}

export interface MapContentEntity {
  id: string;
  kind: string;
  title: string;
  localizedTitles?: Record<string, string>;
  localizedDescriptions?: Record<string, string>;
  internalName?: string;
  statsId?: string;
  templateId?: string;
  iconId?: string;
  sourceLevel?: string;
  worldPosition?: { x: number; y: number; z: number };
  gameplay?: MapGameplayMetadata;
  access?: MapAccessProfile;
  navigationPortal?: MapNavigationPortalProfile;
  navigationDestination?: MapNavigationDestinationProfile;
  inspirations?: MapInspirationProfile;
  deathLoot?: MapDeathLootProfile;
  sceneContext?: MapSceneContext;
  authoredEquipment?: {
    characterContentId: string;
    definitionId: string;
    inventoryReferences: Array<{ sourcePath: string; objectId: string; index: number; itemName: string; templateId: string; itemObjectId: string; droppedOnDeath?: boolean }>;
    fields: Record<string, { value?: string | boolean; sourcePath: string; objectId: string; field: string }
      | { conflict: Array<{ value?: string | boolean; sourcePath: string; objectId: string; field: string }> }>;
    scene: "authored-placement" | "requires-scene-review";
    reviewReason?: string;
    groups: Array<{
      sourcePath: string;
      sourceLine: number;
      entries: Array<{ statsId: string; sourceLine: number; itemId?: string; rootTemplateId?: string; candidateItemIds?: string[]; status: string }>;
    }>;
  };
  trap?: MapTrapProfile;
  hiddenPassage?: MapHiddenPassageProfile;
  recipeUnlock?: MapRecipeUnlockProfile;
  readableImpact?: MapReadableImpactProfile;
  itemStoryImpact?: MapItemStoryImpactProfile;
  itemLocation?: MapItemLocationProfile;
  ownership?: MapOwnershipProfile;
  diggableSecret?: MapDiggableSecretProfile;
  mechanism?: MapMechanismProfile;
  storyInteraction?: MapStoryInteractionProfile;
  storyOwnershipZone?: MapStoryOwnershipZoneProfile;
  adamantineForge?: MapAdamantineForgeProfile;
  secretPuzzle?: MapSecretPuzzleProfile;
  wyrmwayPuzzle?: MapWyrmwayPuzzleProfile;
  crechePuzzle?: MapCrechePuzzleProfile;
  arcaneTowerTransport?: MapArcaneTowerTransportProfile;
  sharEntrancePuzzle?: MapSharEntrancePuzzleProfile;
  balthazarSecretRoom?: MapBalthazarSecretRoomProfile;
  minscSluicePuzzle?: MapMinscSluicePuzzleProfile;
  containerLoot?: MapContainerLootProfile;
  puzzleCombinations?: MapPuzzleCombinationProfile;
  vendor?: MapTradeStockProfile;
  /** Possible native stock only; does not establish that trading is available. */
  tradeInventory?: MapNativeTradeInventory;
  quest?: MapQuestProfile;
  worldChecks?: MapWorldCheckProfile;
  storyRisks?: MapStoryRiskProfile;
  permanentBonuses?: MapPermanentBonusProfile;
  rescuePlan?: MapRescuePlanProfile;
  partyMember?: MapPartyMemberProfile;
  waypoint?: MapWaypointProfile;
  tags: string[];
  spoilerBlocks: MapSpoilerBlock[];
  provenance: MapContentProvenance[];
  confidence: {
    identity: string;
    position: string;
    trackerCalibration: string;
  };
}

export interface MapContentRelationship {
  id: string;
  fromId: string;
  toId: string;
  kind: string;
  spoilerLevel?: MapSpoilerLevel;
}

export interface MapContentCatalog {
  schemaVersion: number;
  sourceBuild?: string;
  entities: Record<string, MapContentEntity>;
  relationships: MapContentRelationship[];
}

export type UserMarkerColor = "sage" | "amber" | "red" | "blue" | "violet";
export type UserMarkerIcon = "pin" | "home" | "flag" | "vehicle" | "supplies" | "danger";
export type UserMarkerGroup = "general" | "base" | "resources" | "travel" | "danger";
export type UserMarkerStyleChange = Partial<Pick<UserMapMarker, "color" | "icon">>;

/** A marker the player placed themselves. */
export interface UserMapMarker {
  id: string;
  name: string;
  category: "custom";
  label: string;
  subtype: "custom";
  regionId: "personal";
  region: string;
  x: number;
  y: number;
  color?: UserMarkerColor;
  icon?: UserMarkerIcon;
  group?: UserMarkerGroup;
  mapId?: string;
  /** Original submap coordinate when this marker is projected into a composite atlas. */
  sourceCoordinate?: MapCoordinate;
}

export type MapPoint = MapLocation | UserMapMarker;

export const isUserMapMarker = (point: MapPoint): point is UserMapMarker =>
  point.category === "custom" && point.subtype === "custom" && point.regionId === "personal";

/** Where a map's tile pyramid lives and how a tile path is spelled. */
export interface MapTileSource {
  basePath: string;
  /** Pattern with `{level}`, `{x}` and `{y}` placeholders, relative to basePath. */
  tilePattern: string;
}

/** Reversible mapping between source-world coordinates and the raster canvas. */
export interface MapCoordinateReference {
  worldBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  imageBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  flipY: boolean;
}

/**
 * The `metadata.json` of one map, plus the runtime fields the loader fills in
 * (`id`, `tileSource`). Level 0 tiles are the most detailed; level N tiles
 * each contain `tileSize` image pixels. Image resolution may differ from the
 * stable logical bounds used by markers and saved views.
 */
export interface MapMetadata {
  id: string;
  displayName: string;
  description?: string;
  schemaVersion: number;
  generatedAt?: string;
  attribution?: string;
  sourceBuild?: string;
  coordinateReference?: MapCoordinateReference;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  tileSize: number;
  tileImageSize?: { width: number; height: number };
  detailLevels: number[];
  regions: MapRegion[];
  locations: MapLocation[];
  content: MapContentCatalog;
  tileSource: MapTileSource;
}

export interface MapView {
  centerX: number;
  centerY: number;
  zoom: number;
}

export interface MapCoordinate {
  x: number;
  y: number;
}
