import { gameKnowledgeEntityArtwork, GAME_KNOWLEDGE_ENTITY_ALIASES, GAME_KNOWLEDGE_MECHANIC_ARTWORK,
  GAME_KNOWLEDGE_RECIPE_ARTWORK, GAME_KNOWLEDGE_SUBJECTS, GAME_KNOWLEDGE_TRADE_ARTWORK,
  GAME_GUIDE_ITEM_ALIASES, GAME_GUIDE_ITEM_ENTITY_ALIASES, GAME_GUIDE_EFFECT_NAME_KEYS, GAME_GUIDE_BIOME_ICON_ITEMS,
  GAME_KNOWLEDGE_TAG_ARTWORK, GAME_STRUCTURE_TYPES, GAME_GUIDE_BIOME_NAME_KEYS,
  GAME_GUIDE_ITEM_NAME_OVERRIDE_IDS } from "../../game-config.ts";
import type { InspectorSubject } from "../inspector/inspector-controller.ts";
import { normalizeGuideSubject } from "./game-guide-categories.ts";
import { createConfiguredKnowledgeSubjectDisplay, fallbackKnowledgeSubjectDisplay } from "./knowledge-subject-display.ts";
import artwork from "./guide-artwork.json" with { type: "json" };
import inventory from "./guide-inventory.json" with { type: "json" };
import i18n from "../../i18n/index.ts";
import { gameLanguageName } from "./game-language-dictionary.ts";
import { gameKnowledgeCanonicalItemId } from "./game-guide-item-identity.ts";
import { GAME_GUIDE_BREWING } from "../../game-config.ts";
import { GAME_GUIDE_BIOME_FAMILIES } from "../../game-config.ts";

export { gameKnowledgeCanonicalItemId, gameKnowledgeRecipeSubjectKind } from "./game-guide-item-identity.ts";

/** Minecraft identities remain configuration-owned; consumers receive the generic display contract. */
const configured = createConfiguredKnowledgeSubjectDisplay(
  [...GAME_KNOWLEDGE_SUBJECTS, ...GAME_KNOWLEDGE_MECHANIC_ARTWORK, ...GAME_KNOWLEDGE_RECIPE_ARTWORK,
    ...GAME_KNOWLEDGE_TAG_ARTWORK],
  fallbackKnowledgeSubjectDisplay,
);

export const gameKnowledgeSubjectDisplay: typeof configured = (kind, id) => {
  const original = configured(kind, id), [namespace, path] = id.split(":"), [item, variant] = (path ?? "").split("/");
  const language = i18n.language ?? i18n.resolvedLanguage ?? "en";
  const nameFor = (key: string) => gameLanguageName(language, key);
  const images: Readonly<Record<string, string>> = artwork;
  const aliasedId = gameKnowledgeCanonicalItemId(id);
  const aliasedPath = aliasedId.includes(":") ? aliasedId.slice(aliasedId.indexOf(":") + 1) : aliasedId;
  const potion = GAME_GUIDE_BREWING.containers.some(container => container === item) && variant;
  const effect = GAME_GUIDE_BREWING.variantAliases[variant] ?? variant;
  const name = potion && (kind === "item" || kind === "block")
    ? nameFor(`item.${namespace}.${item}.effect.${effect.replace(/^(long|strong)_/, "")}`)
    : kind === "enchantment" ? nameFor(`enchantment.${namespace}.${path}`)
    : kind === "effect" ? nameFor(`effect.${namespace}.${path}`)
      ?? (GAME_GUIDE_EFFECT_NAME_KEYS[path] ? i18n.t(GAME_GUIDE_EFFECT_NAME_KEYS[path]) : undefined)
    : kind === "biome" ? (GAME_GUIDE_BIOME_NAME_KEYS[path] ? i18n.t(GAME_GUIDE_BIOME_NAME_KEYS[path]) : undefined)
      ?? nameFor(`biome.${namespace}.${path}`)
    : kind === "entity" ? (GAME_KNOWLEDGE_ENTITY_ALIASES[id]
      ? nameFor(`entity.${GAME_KNOWLEDGE_ENTITY_ALIASES[id].replace(":", ".")}`) : undefined)
      ?? nameFor(`entity.${namespace}.${path}`)
    : kind === "item" || kind === "block"
      ? (GAME_GUIDE_ITEM_NAME_OVERRIDE_IDS.has(path) ? i18n.t(`inspector.itemGuide.nameOverrides.${path}`) : undefined)
        ?? nameFor(`item.${namespace}.${path}`) ?? nameFor(`block.${namespace}.${path}`)
        ?? nameFor(`item.${namespace}.${aliasedPath}`) ?? nameFor(`block.${namespace}.${aliasedPath}`)
      : undefined;
  const entityImage = kind === "entity" ? gameKnowledgeEntityArtwork(id) : undefined;
  const biomeFamily = kind === "biome" ? GAME_GUIDE_BIOME_FAMILIES.find(group =>
    (group.biomeIds as readonly string[]).includes(path))?.id : undefined;
  const categoryImage = kind === "loot" ? images["minecraft:chest"] : kind === "trade" ? GAME_KNOWLEDGE_TRADE_ARTWORK[id]
      ?? gameKnowledgeEntityArtwork("minecraft:villager")
    : kind === "enchantment" ? images["minecraft:enchanted_book"] : kind === "advancement" ? images["minecraft:experience_bottle"]
    : kind === "biome" ? images[GAME_GUIDE_BIOME_ICON_ITEMS[path] ?? GAME_GUIDE_BIOME_ICON_ITEMS[biomeFamily ?? ""]]
      ?? images["minecraft:grass_block"] : undefined;
  const image = entityImage ?? categoryImage ?? images[kind === "effect" ? `effect:${id}` : id]
    ?? images[aliasedId] ?? original.image
    ?? (potion ? images[`${namespace}:${item}`] : undefined);
  return { ...original, ...(name ? { name: variant?.startsWith("strong_") ? `${name} II` : variant?.startsWith("long_") ? `${name} +` : name } : {}),
    ...(image ? { image } : {}) };
};

const isArtworkAlias = (id: string) => {
  const path = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  if (GAME_GUIDE_ITEM_ALIASES[path] && GAME_GUIDE_ITEM_ALIASES[path] !== path) return true;
  const [container, variant] = path.split("/");
  return Boolean(variant && GAME_GUIDE_BREWING.containers.some(candidate => candidate === container)
    && GAME_GUIDE_BREWING.variantAliases[variant] && GAME_GUIDE_BREWING.variantAliases[variant] !== variant);
};

/** Every canonical packaged inventory identity, including placeable blocks, is browsable as an item. */
export const gameKnowledgeInventorySubjects = Object.freeze(Object.keys(artwork)
  .filter(id => inventory.includes(id))
  .filter(id => !isArtworkAlias(id))
  .map(id => Object.freeze({ kind: "item" as const, id })));

/** Converts technical, item-backed entities to their inventory identity for guide browsing. */
export const gameKnowledgeGuideSubject = (subject: InspectorSubject): InspectorSubject => {
  const normalized = normalizeGuideSubject(subject);
  const itemId = normalized.kind === "entity" ? GAME_GUIDE_ITEM_ENTITY_ALIASES[normalized.id] : undefined;
  return itemId ? { kind: "item", id: itemId } : normalized;
};

/** Finds technical entity records whose mechanics should be retained on an item guide page. */
export const gameKnowledgeGuideEntitySources = (itemId: string): readonly InspectorSubject[] =>
  Object.entries(GAME_GUIDE_ITEM_ENTITY_ALIASES)
    .filter(([, target]) => target === itemId)
    .map(([id]) => ({ kind: "entity", id }));

export const gameKnowledgeSubjectHeroImage = (kind: string, id: string): string | undefined =>
  kind === "poi" ? GAME_STRUCTURE_TYPES.find(type => type.knowledgeId === id)?.preview : undefined;

/** Replaces generated registry jargon with the authored, player-facing structure summary. */
export const gameKnowledgeSubjectDescription = (kind: string, id: string, translate: (key: string) => string): string | undefined => {
  const type = kind === "poi" ? GAME_STRUCTURE_TYPES.find(candidate => candidate.knowledgeId === id) : undefined;
  if (type) return translate(`structureMap.descriptions.${type.id}`);
  if (kind === "enchantment") {
    const summary = translate(`inspector.enchantmentSummaries.${id.split(":").at(-1)}`);
    return summary || undefined;
  }
  return undefined;
};

export const gameKnowledgeBiomeFamily = (id: string, translate: (key: string) => string) => {
  const path = id.startsWith("minecraft:") ? id.slice("minecraft:".length) : id;
  const index = GAME_GUIDE_BIOME_FAMILIES.findIndex(family => (family.biomeIds as readonly string[]).includes(path));
  if (index < 0) return null;
  const family = GAME_GUIDE_BIOME_FAMILIES[index];
  return { key: family.id, label: translate(family.labelKey), order: index };
};
