import { FileJson, LoaderCircle, Package } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ItemCatalog, { ItemCatalogCategory } from "../../components/layout/item-catalog";
import { GAME_CONFIG, GAME_GUIDE_BREWING, GAME_GUIDE_ENTITY_OVERVIEWS, GAME_GUIDE_ITEM_TYPES,
  GAME_GUIDE_LEGACY_BEDROCK_ENTITIES, GAME_GUIDE_SMITHING,
  GAME_GUIDE_NON_MOB_ENTITIES, GAME_GUIDE_COOKING_STATIONS, GAME_GUIDE_REDSTONE_GROUPS,
  GAME_GUIDE_CANONICAL_ITEM_NAMES, GAME_GUIDE_EFFECT_GROUPS, GAME_GUIDE_BIOME_FAMILIES,
  GAME_GUIDE_TUTORIALS, GAME_GUIDE_BLOCK_HIGHLIGHTS, GAME_GUIDE_ITEM_HIGHLIGHTS, GAME_KNOWLEDGE_ENTITY_ALIASES,
  GAME_STRUCTURE_GROUPS, gameGuideItemType } from "../../game-config";
import type { InspectorSubject } from "../inspector/inspector-controller";
import type { InspectorContent } from "../inspector/inspector-types";
import MapPointIcon from "../map/map-point-icon";
import { createConnectedKnowledgeInspectorResolver } from "./connected-knowledge-inspector-content";
import { isConfiguredStructureSubject } from "./game-structure-loot-sources";
import { availableKnowledgeItemIds, type KnowledgeCatalogs } from "./knowledge-catalogs";
import { gameKnowledgeBiomeFamily, gameKnowledgeCanonicalItemId, gameKnowledgeGuideEntitySources, gameKnowledgeGuideSubject,
  gameKnowledgeRecipeSubjectKind,
  gameKnowledgeSubjectDisplay as display } from "./game-knowledge-subject-display";
import { GUIDE_KINDS, GUIDE_MENU_KINDS, type GuideKind } from "./game-guide-categories";
import GameGuideDetailPage from "./game-guide-detail-page";
import { createMechanicsInspectorResolver, createMechanicsSubjectDisplay } from "./mechanics-inspector-content";
import GuideSourceControls, { type GuideSource } from "./guide-source-controls";
import { createBrewingPathResolver } from "./brewing-path";
import { groupEnchantmentEquipment } from "./enchantment-equipment-groups";
import { createSmithingGuideIndex, smithingTemplateId } from "./smithing-guide-data";
import { createSmithingGuideContent } from "./smithing-guide-content";
import { createCraftingGuideIndex, matchesCraftingFilter, type CraftingGuideFilter } from "./crafting-guide-data.ts";
import { createCraftingGuideContent } from "./crafting-guide-content.tsx";
import { createSmeltingGuideIndex, matchesSmeltingStation } from "./smelting-guide-data.ts";
import { createSmeltingGuideContent } from "./smelting-guide-content.tsx";
import { availableStructureGuideTypes } from "./structure-guide-data.ts";
import { createStructureGuideContent } from "./structure-guide-content.tsx";
import { createRedstoneGuideIndex } from "./redstone-guide-data.ts";
import { createRedstoneGuideContent } from "./redstone-guide-content.tsx";
import { createEffectGuideIndex } from "./effect-guide-data.ts";
import { createEffectGuideContent } from "./effect-guide-content.tsx";
import { createItemGuideContent } from "./item-guide-content.tsx";
import { createBiomeGuideIndex } from "./biome-guide-data.ts";
import { createBiomeGuideContent } from "./biome-guide-content.tsx";
import { createBlockGuideContent } from "./block-guide-content.tsx";
import { BLOCK_GUIDE_FILTERS, createBlockSurfaceIndex, matchesBlockGuideFilter, visibleBlockGuideIds } from "./block-guide-data.ts";
import { createTradeGuideIndex } from "./trade-guide-data.ts";
import { createTradeGuideContent, createTradeOfferContent } from "./trade-guide-content.tsx";
import { createTutorialGuideContent } from "./tutorial-guide-content.tsx";

const RENDER_CAP = 300;
const BLOCK_PRIORITY = new Map([...GAME_GUIDE_BLOCK_HIGHLIGHTS].map((id, index) => [id, index]));
const blockPriority = (id: string) => BLOCK_PRIORITY.get(id) ?? Number.MAX_SAFE_INTEGER;
const ITEM_PRIORITY = new Map(Object.keys(GAME_GUIDE_ITEM_HIGHLIGHTS)
  .filter(id => !GAME_GUIDE_BLOCK_HIGHLIGHTS.has(id))
  .map((id, index) => [id, index]));
const itemPriority = (id: string) => ITEM_PRIORITY.get(id) ?? Number.MAX_SAFE_INTEGER;
const BROWSABLE_GUIDE_KINDS = new Set<InspectorSubject["kind"]>(GUIDE_KINDS.filter(kind => kind !== "all" && kind !== "brewing" && kind !== "smithing" && kind !== "crafting" && kind !== "smelting" && kind !== "structures" && kind !== "redstone" && kind !== "effect") as InspectorSubject["kind"][]);
const HIDDEN_GUIDE_KINDS = new Set<InspectorSubject["kind"]>(["advancement", "poi"]);
const subjectKey = (subject: InspectorSubject) => `${subject.kind}:${subject.id}`;
type GuideHistoryEntry = { subject: InspectorSubject; kind: GuideKind; query?: string; filter?: string; limit?: number };
type GuideFilter = { id: string; label: string; matches: (subject: InspectorSubject) => boolean };
const CRAFTING_FILTERS = ["inventory", "table", "shaped", "shapeless", "cutting"] as const;
const MOB_BEHAVIORS = ["passive", "neutral", "hostile"] as const;
const mobBehavior = (id: string) => GAME_GUIDE_ENTITY_OVERVIEWS[GAME_KNOWLEDGE_ENTITY_ALIASES[id] ?? id];
const itemTypeOf = (subject: InspectorSubject) => gameGuideItemType(subject.id,
  gameKnowledgeRecipeSubjectKind(subject.id) === "block");
const hideGuideLinks = (content: InspectorContent | null, available: (subject: InspectorSubject) => boolean): InspectorContent | null => {
  if (!content) return null;
  const filterSections = (input: NonNullable<InspectorContent["sections"]>) => input
    .map(section => ({ ...section, links: [...new Map(section.links
      .filter(link => (!HIDDEN_GUIDE_KINDS.has(link.subject.kind)
        || isConfiguredStructureSubject(link.subject)) && available(link.subject))
      .map(link => {
        const subject = gameKnowledgeGuideSubject(link.subject);
        return [`${subject.kind}:${subject.id}`, { ...link, subject }] as const;
      })).values()] }))
    .filter(section => section.links.length > 0);
  return { ...content,
    ...(content.summarySections ? { summarySections: filterSections(content.summarySections) } : {}),
    ...(content.sections ? { sections: filterSections(content.sections) } : {}),
    ...(content.guideSections ? { guideSections: content.guideSections.map(group => ({ ...group,
      ...(group.sections ? { sections: filterSections(group.sections) } : {}),
    })).filter(group => group.heroImage || group.body || group.description || group.facts?.length
      || group.pillSections?.length || group.sections?.length) } : {}) };
};

const GameGuideBrowser = ({ source, catalogs, phase, kind, initialSubject, rootBackLabel, onKindChange, onSourceChange,
  onSearchStructureMap, onClose }: {
  source: GuideSource;
  catalogs: KnowledgeCatalogs;
  phase: "loading" | "ready" | "error";
  kind: GuideKind;
  initialSubject?: InspectorSubject | null;
  rootBackLabel?: string;
  onKindChange: (kind: GuideKind) => void;
  onSourceChange: (gameId: string, edition: string, version: string) => void;
  onSearchStructureMap?: (knowledgeId: string) => void;
  onClose: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [browsing, setBrowsing] = useState(Boolean(initialSubject));
  const craftingFilter: CraftingGuideFilter = kind === "crafting"
    ? CRAFTING_FILTERS.find(option => option === filter) ?? "all"
    : "all";
  const selectedSmeltingStation = kind === "smelting"
    ? GAME_GUIDE_COOKING_STATIONS.find(station => station.id === filter)
    : undefined;
  const [renderLimit, setRenderLimit] = useState(RENDER_CAP);
  const [history, setHistory] = useState<GuideHistoryEntry[]>(() => initialSubject
    ? [{ subject: gameKnowledgeGuideSubject(initialSubject), kind }] : []);
  const locallySelectedKind = useRef<GuideKind>(kind);
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const structureTypes = useMemo(() => availableStructureGuideTypes(source.edition, source.version),
    [source.edition, source.version]);
  const structureById = useMemo(() => new Map<string, (typeof structureTypes)[number]>(
    structureTypes.map(type => [type.knowledgeId, type])), [structureTypes]);
  const subjectDisplay = useMemo(() => {
    const base = catalogs.mechanics ? createMechanicsSubjectDisplay(catalogs.mechanics, display, locale) : display;
    return (subjectKind: InspectorSubject["kind"], id: string) => {
      const tutorial = subjectKind === "tutorial" ? GAME_GUIDE_TUTORIALS.find(topic => topic.id === id) : undefined;
      if (tutorial) return { name: t(`inspector.tutorialGuide.topics.${id}.title`),
        image: base("item", tutorial.iconItemId).image };
      const appearance = base(subjectKind, id), structure = subjectKind === "poi" ? structureById.get(id) : undefined;
      if (structure) return { ...appearance, name: t(`structureMap.types.${structure.id}`), image: structure.artwork };
      if (subjectKind === "entity" && GAME_KNOWLEDGE_ENTITY_ALIASES[id])
        return { ...appearance, name: display("entity", GAME_KNOWLEDGE_ENTITY_ALIASES[id]).name };
      return subjectKind === "item" && GAME_GUIDE_CANONICAL_ITEM_NAMES.has(id)
        ? { ...appearance, name: display(subjectKind, id).name } : appearance;
    };
  }, [catalogs.mechanics, locale, structureById, t]);
  const availableItemIds = useMemo(() => availableKnowledgeItemIds(catalogs),
    [catalogs]);
  const availableEntityIds = useMemo(() => new Set((catalogs.mechanics?.subjects ?? [])
    .filter(subject => subject.kind === "entity").map(subject => subject.id)), [catalogs.mechanics]);
  const availableEnchantmentIds = useMemo(() => new Set((catalogs.mechanics?.subjects ?? [])
    .filter(subject => subject.kind === "enchantment").map(subject => subject.id)), [catalogs.mechanics]);
  const brewing = useMemo(() => {
    const ids = new Set<string>(), outputs = new Set<string>();
    for (const recipe of catalogs.recipes?.recipes ?? []) {
      if (recipe.method !== "brewing") continue;
      for (const output of recipe.outputs) { ids.add(output.id); outputs.add(output.id); }
      for (const ingredient of recipe.ingredients) for (const choice of ingredient.choices)
        if (choice.kind === "item") ids.add(choice.id);
      for (const station of recipe.stations) ids.add(station);
    }
    return { ids, outputs };
  }, [catalogs.recipes]);
  const brewingPath = useMemo(() => createBrewingPathResolver(catalogs.recipes?.recipes ?? [],
    `${GAME_GUIDE_BREWING.bottle}/water`), [catalogs.recipes]);
  const smithing = useMemo(() => createSmithingGuideIndex(catalogs.recipes?.recipes ?? []), [catalogs.recipes]);
  const crafting = useMemo(() => createCraftingGuideIndex(catalogs.recipes?.recipes ?? []), [catalogs.recipes]);
  const craftedBlockIds = useMemo(() => new Set(crafting.keys()), [crafting]);
  const smelting = useMemo(() => createSmeltingGuideIndex(catalogs.recipes?.recipes ?? []), [catalogs.recipes]);
  const recipesById = useMemo(() => new Map((catalogs.recipes?.recipes ?? []).map(recipe => [recipe.id, recipe])),
    [catalogs.recipes]);
  const redstone = useMemo(() => createRedstoneGuideIndex(source.edition), [source.edition]);
  const redstoneBlockIds = useMemo(() => new Set(redstone.keys()), [redstone]);
  const redstoneOrder = useMemo(() => new Map([...redstone.keys()].map((id, index) => [id, index])), [redstone]);
  const effects = useMemo(() => createEffectGuideIndex(source.edition, source.version),
    [source.edition, source.version]);
  const biomes = useMemo(() => createBiomeGuideIndex(catalogs, source.edition), [catalogs, source.edition]);
  const blockSurfaceIds = useMemo(() => createBlockSurfaceIndex(biomes), [biomes]);
  const trade = useMemo(() => createTradeGuideIndex(catalogs.mechanics), [catalogs.mechanics]);
  const effectOrder = useMemo(() => new Map([...effects.keys()].map((id, index) => [id, index])), [effects]);
  const specialGuideIds = useMemo(() => new Map<GuideKind, ReadonlySet<string>>([
    ["brewing", brewing.ids], ["smithing", smithing.subjects], ["crafting", new Set(crafting.keys())],
    ["smelting", new Set(smelting.keys())], ["redstone", new Set(redstone.keys())],
    ["blocks", visibleBlockGuideIds(availableItemIds, id => itemTypeOf({ kind: "item", id }) === "blocks",
      gameKnowledgeCanonicalItemId, id => subjectDisplay("item", id).name, craftedBlockIds)],
  ]), [brewing, smithing, crafting, smelting, redstone, availableItemIds, subjectDisplay, craftedBlockIds]);
  const enchantmentEquipment = useMemo(() => {
    const groups = new Map<string, { name: string; subjects: Set<string> }>();
    for (const mechanic of catalogs.mechanics?.mechanics ?? []) {
      if (mechanic.kind !== "enchanting" || mechanic.subject.kind !== "enchantment") continue;
      for (const group of groupEnchantmentEquipment(mechanic.requirements)) {
        if (!groups.has(group.key)) groups.set(group.key, { name: group.type
          ? t(`inspector.enchantmentEquipmentTypes.${group.type}`)
          : subjectDisplay(group.item!.kind, group.item!.id).name, subjects: new Set() });
        groups.get(group.key)!.subjects.add(mechanic.subject.id);
      }
    }
    return groups;
  }, [catalogs.mechanics, subjectDisplay, t]);
  const resolver = useMemo(() => createConnectedKnowledgeInspectorResolver(catalogs, display, t, locale,
    source.edition, source.version),
  [catalogs, t, locale, source.edition, source.version]);
  const mechanicsResolver = useMemo(() => catalogs.mechanics
    ? createMechanicsInspectorResolver(catalogs.mechanics, display, t, locale,
      id => gameKnowledgeBiomeFamily(id, key => t(key)))
    : () => null, [catalogs.mechanics, t, locale]);
  const subjectAvailable = (subject: InspectorSubject) => {
    const normalized = gameKnowledgeGuideSubject(subject);
    if (normalized.kind === "tutorial") return GAME_GUIDE_TUTORIALS.some(topic => topic.id === normalized.id);
    if (normalized.kind === "poi") return structureById.has(normalized.id);
    if (normalized.kind === "effect") return effects.has(normalized.id);
    if (normalized.kind === "biome") return biomes.has(normalized.id);
    if (normalized.kind === "trade") return trade.professions.has(normalized.id);
    if (normalized.kind === "entity") return availableEntityIds.has(normalized.id)
      && !(source.edition === "bedrock" && GAME_GUIDE_LEGACY_BEDROCK_ENTITIES.has(normalized.id));
    if (normalized.kind === "enchantment") return availableEnchantmentIds.has(normalized.id);
    return normalized.kind !== "item" && normalized.kind !== "block" || availableItemIds.has(normalized.id);
  };

  useEffect(() => {
    if (locallySelectedKind.current === kind) return;
    locallySelectedKind.current = kind;
    setQuery("");
    setFilter("all");
    setRenderLimit(RENDER_CAP);
    setHistory([]);
    setBrowsing(false);
  }, [kind]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const subjects = useMemo(() => {
    const values = new Map<string, InspectorSubject>();
    for (const id of availableItemIds) values.set(`item:${id}`, { kind: "item", id });
    if (catalogs.mechanics) for (const subject of catalogs.mechanics.subjects) {
      if (subject.kind === "entity" && (GAME_GUIDE_NON_MOB_ENTITIES.has(subject.id)
        || source.edition === "bedrock" && GAME_GUIDE_LEGACY_BEDROCK_ENTITIES.has(subject.id))) continue;
      if (subject.kind === "trade" && !trade.professions.has(subject.id)) continue;
      const normalized = gameKnowledgeGuideSubject({ kind: subject.kind, id: subject.id });
      if (BROWSABLE_GUIDE_KINDS.has(normalized.kind))
        values.set(subjectKey(normalized), normalized);
    }
    for (const type of structureTypes) values.set(`poi:${type.knowledgeId}`, { kind: "poi", id: type.knowledgeId });
    for (const id of effects.keys()) values.set(`effect:${id}`, { kind: "effect", id });
    for (const id of biomes.keys()) values.set(`biome:${id}`, { kind: "biome", id });
    for (const topic of GAME_GUIDE_TUTORIALS)
      values.set(`tutorial:${topic.id}`, { kind: "tutorial", id: topic.id });
    return [...values.values()].sort((left, right) => subjectDisplay(left.kind, left.id).name.localeCompare(
      subjectDisplay(right.kind, right.id).name, locale));
  }, [catalogs.mechanics, availableItemIds, subjectDisplay, locale, source.edition, structureTypes, effects, biomes, trade]);
  const browsableItemIds = useMemo(() => new Set(subjects.filter(subject => subject.kind === "item")
    .map(subject => subject.id)), [subjects]);
  const subjectsByKind = useMemo(() => {
    const byKind = new Map<GuideKind, InspectorSubject[]>([["all", subjects]]);
    for (const guideKind of GUIDE_KINDS) {
      if (guideKind === "all") continue;
      const ids = specialGuideIds.get(guideKind);
      byKind.set(guideKind, subjects.filter(subject => ids
        ? subject.kind === "item" && ids.has(subject.id)
        : subject.kind === (guideKind === "structures" ? "poi" : guideKind)));
    }
    return byKind;
  }, [subjects, specialGuideIds]);
  const scopedSubjects = subjectsByKind.get(kind) ?? subjects;
  const countForKind = (guideKind: GuideKind) => subjectsByKind.get(guideKind)?.length ?? 0;

  const filters = useMemo<GuideFilter[]>(() => {
    switch (kind) {
      case "item":
        return GAME_GUIDE_ITEM_TYPES.filter(id => id !== "all" && id !== "brewing").map(id => ({
          id, label: t("inspector.itemTypes." + id), matches: subject => itemTypeOf(subject) === id,
        }));
      case "entity":
        return MOB_BEHAVIORS.map(id => ({
          id, label: t(`inspector.mobDetails.behaviors.${id}`), matches: subject => mobBehavior(subject.id) === id,
        }));
      case "enchantment":
        return [...enchantmentEquipment].map(([id, group]) => ({
          id, label: group.name, matches: (subject: InspectorSubject) => group.subjects.has(subject.id),
        })).sort((left, right) => left.label.localeCompare(right.label, locale));
      case "smithing":
        return [
          { id: "upgrades", label: t("inspector.smithingGuide.upgrades"),
            matches: subject => smithing.upgrades.has(subject.id) || subject.id.endsWith(GAME_GUIDE_SMITHING.upgradeTemplateSuffix) },
          { id: "trims", label: t("inspector.smithingGuide.trims"), matches: subject => smithing.trims.has(subject.id) },
        ];
      case "crafting":
        return CRAFTING_FILTERS.map(id => ({
          id, label: id === "cutting" ? t("inspector.methods.cutting") : t("inspector.craftingGuide.filters." + id),
          matches: subject => crafting.get(subject.id)?.some(recipe => matchesCraftingFilter(recipe, id)) ?? false,
        }));
      case "smelting":
        return GAME_GUIDE_COOKING_STATIONS.map(station => ({
          id: station.id, label: subjectDisplay("item", station.itemId).name,
          matches: subject => smelting.get(subject.id)?.some(recipe => matchesSmeltingStation(recipe, station.stationIds)) ?? false,
        }));
      case "structures":
        return GAME_STRUCTURE_GROUPS.map(group => ({
          id: group.id, label: t("structureMap.groups." + group.id),
          matches: subject => structureById.get(subject.id)?.group === group.id,
        }));
      case "redstone":
        return GAME_GUIDE_REDSTONE_GROUPS.map(id => ({
          id, label: t("inspector.redstoneGuide.groups." + id), matches: subject => redstone.get(subject.id)?.group === id,
        }));
      case "effect":
        return GAME_GUIDE_EFFECT_GROUPS.map(id => ({
          id, label: t("inspector.effectGuide.groups." + id), matches: subject => effects.get(subject.id)?.group === id,
        }));
      case "biome":
        return GAME_GUIDE_BIOME_FAMILIES.map(group => ({
          id: group.id, label: t(group.labelKey), matches: subject => biomes.get(subject.id)?.family === group.id,
        }));
      case "blocks":
        return BLOCK_GUIDE_FILTERS.filter(id => id !== "all").map(id => ({
          id, label: t("inspector.blockGuide.filters." + id),
          matches: subject => matchesBlockGuideFilter(subject.id, id, blockSurfaceIds, craftedBlockIds, redstoneBlockIds),
        }));
      default:
        return [];
    }
  }, [kind, t, enchantmentEquipment, locale, smithing, crafting, subjectDisplay, smelting,
    structureById, redstone, effects, biomes, blockSurfaceIds, craftedBlockIds, redstoneBlockIds]);
  const filterOptions = useMemo(() => filters.map(option => ({
    ...option, subjects: scopedSubjects.filter(option.matches),
  })).filter(option => option.subjects.length > 0), [filters, scopedSubjects]);
  const activeSubjects = filterOptions.find(option => option.id === filter)?.subjects ?? scopedSubjects;

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-US");
    const filtered = activeSubjects.filter(subject => !needle
      || subject.id.toLocaleLowerCase("en-US").includes(needle)
      || subjectDisplay(subject.kind, subject.id).name.toLocaleLowerCase(locale).includes(needle));
    return kind === "item" && !needle ? filtered.sort((left, right) => itemPriority(left.id) - itemPriority(right.id))
      : kind === "blocks" ? filtered.sort((left, right) => blockPriority(left.id) - blockPriority(right.id))
      : kind === "brewing" ? filtered.sort((left, right) => Number(brewing.outputs.has(right.id))
      - Number(brewing.outputs.has(left.id))) : kind === "smithing" ? filtered.sort((left, right) =>
        Number(smithing.trims.has(left.id)) - Number(smithing.trims.has(right.id))) : kind === "redstone"
          ? filtered.sort((left, right) => (redstoneOrder.get(left.id) ?? Infinity)
            - (redstoneOrder.get(right.id) ?? Infinity)) : kind === "effect"
              ? filtered.sort((left, right) => (effectOrder.get(left.id) ?? Infinity)
                - (effectOrder.get(right.id) ?? Infinity)) : filtered;
  }, [activeSubjects, subjectDisplay, query, locale, kind, brewing, smithing, redstoneOrder, effectOrder]);
  const shown = matches.slice(0, renderLimit);
  const emptyMessage = kind === "brewing" && brewing.ids.size === 0
    ? t("inspector.brewingUnavailable") : kind === "smithing" && smithing.subjects.size === 0
      ? t("inspector.smithingGuide.unavailable") : kind === "crafting" && crafting.size === 0
        ? t("inspector.craftingGuide.unavailable") : kind === "smelting" && smelting.size === 0
          ? t("inspector.smeltingGuide.unavailable") : kind === "redstone" && countForKind("redstone") === 0
            ? t("inspector.redstoneGuide.unavailable") : kind === "effect" && countForKind("effect") === 0
              ? t("inspector.effectGuide.unavailable") : kind === "enchantment" && countForKind("enchantment") === 0
      ? t("inspector.enchantmentUnavailable") : kind === "biome" && countForKind("biome") === 0
        ? t("inspector.biomeGuide.unavailable") : t("inspector.catalogNoResults");
  const historySelected = history[history.length - 1]?.subject ?? null;
  const selectedUnavailable = historySelected !== null && Boolean(catalogs.items)
    && (historySelected.kind === "item" || historySelected.kind === "block") && !availableItemIds.has(historySelected.id);
  const selected = selectedUnavailable ? null : historySelected;

  const guideDisplay = (subject: InspectorSubject) => {
    return subjectDisplay(subject.kind, subject.id);
  };
  const resolveSubject = (subject: InspectorSubject) => {
    const normalized = gameKnowledgeGuideSubject(subject);
    if ((HIDDEN_GUIDE_KINDS.has(normalized.kind) && !isConfiguredStructureSubject(normalized))
      || !subjectAvailable(normalized)) return null;
    if (normalized.kind === "tutorial") {
      const topic = GAME_GUIDE_TUTORIALS.find(candidate => candidate.id === normalized.id);
      if (!topic) throw new Error(`Unknown tutorial: ${normalized.id}`);
      return createTutorialGuideContent(topic, subjectDisplay, subjectAvailable, t);
    }
    const resolved = resolver(normalized);
    const blockDetails = normalized.kind === "item"
      ? mechanicsResolver({ kind: "block", id: normalized.id }) : null;
    const entityDetails = normalized.kind === "item"
      ? gameKnowledgeGuideEntitySources(normalized.id).map(sourceSubject => mechanicsResolver(sourceSubject)).filter(Boolean) : [];
    const appearance = guideDisplay(normalized);
    const combined = resolved || blockDetails || entityDetails.length ? {
      ...appearance, ...(blockDetails ?? {}), ...(resolved ?? {}),
      ...(normalized.kind === "recipe" && resolved ? {} : appearance),
      category: normalized.kind === "recipe" && resolved ? resolved.category
        : t(`inspector.subjectKinds.${kind === "brewing" && brewing.ids.has(normalized.id)
          ? "brewing" : normalized.kind}`),
      sections: [
        ...(resolved?.sections ?? []),
        ...(blockDetails?.sections ?? []).map(section => ({ ...section, key: `block:${section.key}` })),
        ...entityDetails.flatMap((details, index) => (details?.sections ?? [])
          .map(section => ({ ...section, key: `entity:${index}:${section.key}` }))),
      ],
    } : null;
    const route = normalized.kind === "item" && brewing.outputs.has(normalized.id)
      ? brewingPath(normalized.id) : null;
    if (combined && route) combined.sections = combined.sections.map(section => section.key === "ingredients"
      ? { ...section, description: t("inspector.brewingBatchNote") } : section);
    if (combined && route && route.length > 1) {
      const ingredients = combined.sections.filter(section => section.key === "ingredients");
      const otherSections = combined.sections.filter(section => section.key !== "ingredients");
      combined.sections = [...ingredients, { key: "brewing:path",
      title: t("inspector.brewingPath"), links: route.map((recipe, index) => {
        const input = recipe.ingredients[0]?.choices[0], reagent = recipe.ingredients[1]?.choices[0];
        const output = recipe.outputs[0];
        if (!input || !reagent || !output) throw new Error("Brewing path contains an incomplete recipe.");
        return { key: `brewing:path:${recipe.id}`, subject: { kind: "recipe" as const, id: recipe.id },
          ...guideDisplay({ kind: "item", id: output.id }),
          note: t("inspector.brewingStep", { step: index + 1 }),
          transaction: { inputs: [input, reagent].map(choice => guideDisplay({ kind: "item", id: choice.id })),
            outputs: [guideDisplay({ kind: "item", id: output.id })] } };
      }) }, ...otherSections];
    }
    const smithingContent = kind === "smithing" && normalized.kind === "item" && catalogs.recipes
      ? createSmithingGuideContent(normalized.id, combined, resolver({ kind: "item", id: smithing.upgrades.get(normalized.id)
        ? smithingTemplateId(smithing.upgrades.get(normalized.id)!) ?? normalized.id : normalized.id }), catalogs.recipes,
        smithing, subjectDisplay, availableItemIds, t) : null;
    const craftingContent = kind === "crafting" && normalized.kind === "item" && catalogs.recipes
      ? createCraftingGuideContent(normalized.id, combined, catalogs.recipes, crafting, subjectDisplay, t,
        craftingFilter) : null;
    const smeltingContent = kind === "smelting" && normalized.kind === "item" && catalogs.recipes
      ? createSmeltingGuideContent(normalized.id, combined, catalogs.recipes, smelting, subjectDisplay, t,
        selectedSmeltingStation?.stationIds ?? null) : null;
    const structureContent = normalized.kind === "poi"
      ? createStructureGuideContent(normalized.id, combined, structureTypes, subjectDisplay,
        availableItemIds, availableEntityIds, t, onSearchStructureMap) : null;
    const redstoneComponent = (kind === "redstone" || kind === "blocks") && normalized.kind === "item"
      ? redstone.get(normalized.id) : undefined;
    const redstoneContent = redstoneComponent
      ? createRedstoneGuideContent(normalized.id, redstoneComponent, combined, catalogs.recipes,
        crafting, browsableItemIds, source.edition, subjectDisplay, t) : null;
    const effectEntry = normalized.kind === "effect" ? effects.get(normalized.id) : undefined;
    const effectContent = effectEntry ? createEffectGuideContent(normalized.id, effectEntry, effects,
      browsableItemIds, availableEntityIds, subjectDisplay, t) : null;
    const biomeEntry = normalized.kind === "biome" ? biomes.get(normalized.id) : undefined;
    const biomeContent = biomeEntry ? createBiomeGuideContent(biomeEntry, biomes, availableItemIds,
      availableEntityIds, new Set(structureById.keys()), subjectDisplay, t) : null;
    const itemContent = (kind === "item" || kind === "all" || kind === "blocks") && normalized.kind === "item"
      ? createItemGuideContent(normalized.id, combined, itemTypeOf(normalized), availableItemIds,
        availableEntityIds, subjectDisplay, recipesById, catalogs.recipes, smelting.get(normalized.id) ?? [], t) : null;
    const blockContent = kind === "blocks" && itemContent && normalized.kind === "item" && !redstoneComponent
      ? createBlockGuideContent(normalized.id, itemContent, biomes, subjectDisplay, subjectAvailable,
        catalogs.recipes, craftedBlockIds, t) : null;
    const tradeEntry = normalized.kind === "trade" ? trade.professions.get(normalized.id) : undefined;
    const tradeContent = tradeEntry ? createTradeGuideContent(tradeEntry, combined, subjectDisplay,
      availableItemIds, availableEntityIds, t) : null;
    const tradeOffer = normalized.kind === "mechanic" ? trade.offers.get(normalized.id) : undefined;
    const tradeOfferContent = tradeOffer ? createTradeOfferContent(tradeOffer, combined, trade, subjectDisplay, t) : null;
    const content = hideGuideLinks(tradeOfferContent ?? tradeContent ?? biomeContent ?? effectContent ?? structureContent
      ?? redstoneContent ?? blockContent
      ?? smeltingContent ?? craftingContent ?? smithingContent ?? itemContent ?? combined,
      subjectAvailable);
    if (content || normalized.kind !== "item") return content;
    return { ...guideDisplay(normalized), category: t(`inspector.subjectKinds.${kind === "brewing"
      && brewing.ids.has(normalized.id) ? "brewing" : normalized.kind}`),
      contextLabel: `${source.edition} · ${source.version}`,
      description: t("inspector.noCraftingRecipe") };
  };
  const selectSubject = (subject: InspectorSubject) => {
    setHistory([{ subject: gameKnowledgeGuideSubject(subject), kind, query, filter, limit: renderLimit }]);
  };
  const navigateToSubject = (subject: InspectorSubject) => {
    const normalized = gameKnowledgeGuideSubject(subject);
    if (!subjectAvailable(normalized)) return;
    const visited = history.find(entry => subjectKey(entry.subject) === subjectKey(normalized));
    let nextKind = kind;
    if (visited) nextKind = visited.kind;
    else if (normalized.kind === "poi" && structureById.has(normalized.id)) nextKind = "structures";
    else if (normalized.kind === "effect" && effects.has(normalized.id)) nextKind = "effect";
    else if (BROWSABLE_GUIDE_KINDS.has(normalized.kind)) {
      nextKind = (kind === "brewing" || kind === "effect") && normalized.kind === "item" && brewing.ids.has(normalized.id)
        ? "brewing" : kind === "smithing" && normalized.kind === "item" && smithing.subjects.has(normalized.id)
          ? "smithing" : kind === "crafting" && normalized.kind === "item" && crafting.has(normalized.id)
            ? "crafting" : kind === "smelting" && normalized.kind === "item" && smelting.has(normalized.id)
              ? "smelting" : normalized.kind === "item" && itemTypeOf(normalized) === "blocks"
                ? "blocks" : normalized.kind as Exclude<GuideKind, "all">;
    }
    const keepCraftingFilter = nextKind === "crafting" && normalized.kind === "item"
      && crafting.get(normalized.id)?.some(recipe => matchesCraftingFilter(recipe, craftingFilter));
    const nextFilter = visited?.filter ?? (keepCraftingFilter ? craftingFilter : "all");
    if (nextKind !== kind) { locallySelectedKind.current = nextKind; onKindChange(nextKind); }
    setFilter(nextFilter);
    setQuery(visited?.query ?? ""); setRenderLimit(RENDER_CAP);
    setHistory(currentHistory => {
      const existing = currentHistory.findIndex(entry => subjectKey(entry.subject) === subjectKey(normalized));
      if (existing >= 0) return currentHistory.slice(0, existing + 1);
      return [...currentHistory, { subject: normalized, kind: nextKind, query: "", filter: nextFilter }].slice(-32);
    });
  };
  const restoreResults = (entry: GuideHistoryEntry) => {
    locallySelectedKind.current = entry.kind;
    onKindChange(entry.kind);
    setQuery(entry.query ?? "");
    setFilter(entry.filter ?? "all");
    setRenderLimit(entry.limit ?? RENDER_CAP);
  };
  const content = selected && phase === "ready" ? resolveSubject(selected) : null;
  const previous = history.length > 1 ? history[history.length - 2] : null;
  const backLabel = previous ? guideDisplay(previous.subject).name : rootBackLabel;
  const handleBack = previous ? () => {
    restoreResults(previous);
    setHistory(currentHistory => currentHistory.slice(0, -1));
  }
    : rootBackLabel ? onClose : undefined;

  const chooseFilter = (id: string) => {
    setFilter(id);
    setRenderLimit(RENDER_CAP);
    setHistory([]);
  };
  const chooseScope = (id: GuideKind) => {
    locallySelectedKind.current = id;
    onKindChange(id);
    chooseFilter("all");
  };
  const kindLabel = (id: GuideKind) => t("inspector.subjectKinds." + id);
  const categoryOptions = kind === "all"
    ? GUIDE_MENU_KINDS.map(id => ({
      id, label: kindLabel(id), subjects: subjectsByKind.get(id) ?? [], onSelect: () => chooseScope(id),
    })).filter(option => option.subjects.length > 0)
    : filterOptions.map(option => ({ ...option, onSelect: () => chooseFilter(option.id) }));
  const catalogCategories = phase === "ready" && categoryOptions.length ? [
    { id: "all", label: kindLabel("all"), subjects: scopedSubjects, onSelect: () => chooseFilter("all") },
    ...categoryOptions,
  ] : undefined;
  const shownByKey = new Map(shown.map(subject => [subjectKey(subject), subject]));
  const subjectIcon = (image: ReturnType<typeof guideDisplay>["image"], size: number) =>
    <MapPointIcon source={image} fallback={Package} size={size} className="game-guide-detail-image guide-asset-icon" />;
  const categoryImage = (entries: InspectorSubject[]) => {
    for (const entry of entries) {
      const { image } = guideDisplay(entry);
      if (image) return image;
    }
  };
  const statusMessage = phase === "loading" ? <span role="status" className="inline-flex items-center">
    <LoaderCircle size={22} className="animate-spin text-accent" aria-hidden="true" />
    <span className="sr-only">{t("inspector.catalogPreparing")}</span>
  </span> : phase === "error" ? <div role="alert">
    <FileJson size={24} className="mx-auto text-accent" aria-hidden="true" />
    <p className="mt-2 font-semibold text-white">{t("inspector.catalogUnavailable")}</p>
    <p className="mt-1 text-danger-text">{t("inspector.catalogError")}</p>
  </div> : emptyMessage;

  return <ItemCatalog
    label={kindLabel(kind)}
    artwork="/item-catalog-art.webp"
    gameName={GAME_CONFIG.gameName}
    browsing={browsing}
    onBrowse={() => setBrowsing(true)}
    search={{
      query,
      label: t("inspector.search"),
      clearLabel: t("itemCatalog.clearSearch"),
      onChange: value => { setQuery(value); setRenderLimit(RENDER_CAP); setHistory([]); },
    }}
    toolbar={<GuideSourceControls source={source} onSourceChange={onSourceChange} />}
    landingCategories={catalogCategories?.map(({ id, label, subjects, onSelect }) => {
      const image = id === "all" ? undefined : categoryImage(subjects);
      return { id, label, onSelect, icon: image && subjectIcon(image, 52) };
    })}
    categories={catalogCategories?.map(({ id, label, subjects, onSelect }) => <ItemCatalogCategory key={id}
      label={label} count={subjects.length.toLocaleString(locale)}
      active={id === filter} onSelect={onSelect} />)}
    columns={[{ label: kind === "entity" ? t("inspector.mobDetails.behavior") : t("itemCatalog.category") }]}
    rows={phase === "ready" ? shown.map(subject => {
      const { name, image } = guideDisplay(subject);
      const behavior = kind === "entity" ? mobBehavior(subject.id) : undefined;
      const category = kind === "entity" ? (behavior ? t(`inspector.mobDetails.behaviors.${behavior}`) : undefined)
        : specialGuideIds.has(kind) || kind === "structures" ? kindLabel(kind)
        : subject.kind === "item" ? t("inspector.itemTypes." + itemTypeOf(subject)) : t("inspector.subjectKinds." + subject.kind);
      return { id: subjectKey(subject), label: name, subtitle: category, icon: subjectIcon(image, 30), cells: [category] };
    }) : []}
    onOpen={id => { const subject = shownByKey.get(id); if (subject) selectSubject(subject); }}
    onBack={() => {
      const root = history[0];
      if (root) restoreResults(root);
      setHistory([]);
      setBrowsing(true);
    }}
    backLabel={t("itemCatalog.backToList")}
    detail={content && <GameGuideDetailPage content={content} onNavigate={navigateToSubject}
      onSearchStructureMap={onSearchStructureMap} backLabel={backLabel} onBack={handleBack} focusHeading />}
    emptyMessage={statusMessage}
    afterRows={phase === "ready" && matches.length > 0 && <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span role="status">{t("inspector.catalogResultCount", { shown: shown.length, total: matches.length })}</span>
      {matches.length > shown.length && <button type="button" data-guide-show-more
        onClick={() => setRenderLimit(limit => Math.min(matches.length, limit + RENDER_CAP))}>
        {t("inspector.showMore")}
      </button>}
    </div>}
  />;
};

export default GameGuideBrowser;
