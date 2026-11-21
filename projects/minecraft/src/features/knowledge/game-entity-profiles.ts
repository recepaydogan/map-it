import type { TFunction } from "i18next";
import { createElement } from "react";
import { GAME_GUIDE_BOSS_COMBAT, GAME_GUIDE_ENTITY_ENTRY_STRUCTURES, GAME_GUIDE_ENTITY_HEALTH_26_3, GAME_GUIDE_ENTITY_OVERVIEWS, GAME_GUIDE_ENTITY_PROFILES,
  GAME_KNOWLEDGE_ENTITY_ALIASES, GAME_STRUCTURE_DISCOVERIES, GAME_STRUCTURE_TYPES } from "../../game-config.ts";
import type { InspectorSubject } from "../inspector/inspector-controller.ts";
import type { InspectorContent, InspectorLink, InspectorSection } from "../inspector/inspector-types.ts";
import type { KnowledgeSubjectDisplay } from "./mechanics-inspector-content.ts";
import type { ValidatedMechanicsCatalog } from "./mechanics-types.ts";
import { createStructureDiscoverySections } from "../worlds/world-structure-discovery-sections.ts";
import BossCombatGuide from "./boss-combat-guide.tsx";
import english from "../../i18n/locales/en.json" with { type: "json" };

type Resolver = (subject: InspectorSubject) => InspectorContent | null;

/** Show only game-specific profile claims backed by configured sources and present in this catalog. */
export const withGameEntityProfiles = (resolve: Resolver, display: KnowledgeSubjectDisplay, t: TFunction,
  catalog: ValidatedMechanicsCatalog | null, items: ReadonlySet<string>, edition: string): Resolver => {
  if (!catalog) return resolve;
  const labels = english.inspector.mobDetails;
  const label = (key: "interaction" | "habitat" | "combatTip" | "beeBreedingLabel" | "safeHarvest"
    | "beeScheduleLabel" | "beeStingLabel" | "behavior" | "health" | "attack" | "access"
    | "structureLocations") => t(`inspector.mobDetails.${key}`, { defaultValue: labels[key] });
  const entities = new Set(catalog.subjects.filter(subject => subject.kind === "entity").map(subject => subject.id));
  const profiles = new Map<string, (typeof GAME_GUIDE_ENTITY_PROFILES)[number]>(GAME_GUIDE_ENTITY_PROFILES.filter(profile =>
    (!("version" in profile) || profile.version === catalog.source.version))
    .map(profile => [profile.entity, profile]));
  const bosses = new Map<string, (typeof GAME_GUIDE_BOSS_COMBAT)[number]>(GAME_GUIDE_BOSS_COMBAT.filter(guide => guide.edition === edition
    && guide.version === catalog.source.version && entities.has(guide.entity)).map(guide => [guide.entity, guide]));
  const locations = new Map<string, InspectorLink[]>();
  const knownStructures = new Set(catalog.subjects.filter(subject => subject.kind === "poi").map(subject => subject.id));
  for (const type of GAME_STRUCTURE_TYPES) {
    if (!knownStructures.has(type.knowledgeId)) continue;
    const discoveries = createStructureDiscoverySections(GAME_STRUCTURE_DISCOVERIES[type.id], display, {
      mobs: t("inspector.subjectKinds.entity"), loot: t("inspector.subjectKinds.loot"),
    }, { edition, version: catalog.source.version });
    for (const mob of discoveries.find(section => section.key === "structure:mobs")?.links ?? []) {
      if (!entities.has(mob.subject.id)) continue;
      const links = locations.get(mob.subject.id) ?? [];
      if (!links.some(link => link.subject.id === type.knowledgeId)) links.push({
        key: `mob-profile:structure:${type.id}`, subject: { kind: "poi", id: type.knowledgeId },
        name: t(`structureMap.types.${type.id}`), image: type.artwork,
      });
      locations.set(mob.subject.id, links);
    }
  }
  return subject => {
    const base = resolve(subject);
    if (subject.kind !== "entity" || !base) return base;
    const canonicalId = GAME_KNOWLEDGE_ENTITY_ALIASES[subject.id] ?? subject.id;
    const profile = profiles.get(canonicalId);
    const boss = bosses.get(subject.id);
    const health = edition === "java" && catalog.source.version === "26.3" ? GAME_GUIDE_ENTITY_HEALTH_26_3[subject.id] : undefined;
    const structureLinks = locations.get(subject.id);
    const entryId = GAME_GUIDE_ENTITY_ENTRY_STRUCTURES[canonicalId];
    const entryType = entryId && knownStructures.has(entryId)
      ? GAME_STRUCTURE_TYPES.find(type => type.knowledgeId === entryId) : undefined;
    const hasOverview = Object.hasOwn(GAME_GUIDE_ENTITY_OVERVIEWS, canonicalId);
    if (!profile && !boss && health === undefined && !structureLinks?.length && !entryType && !hasOverview) return base;
    const behavior = profile && "behavior" in profile ? profile.behavior : GAME_GUIDE_ENTITY_OVERVIEWS[canonicalId];
    const slug = canonicalId.slice("minecraft:".length);
    const overview = hasOverview ? t(`inspector.mobDetails.summaries.${slug}`) : undefined;
    const habitat = hasOverview ? t(`inspector.mobDetails.habitats.${slug}`) : undefined;
    const interaction = hasOverview ? t(`inspector.mobDetails.interactions.${slug}`) : undefined;
    const combatTip = t(`inspector.mobDetails.combatTips.${slug}`, { defaultValue: "" });
    const entityGuide = hasOverview ? {
      behavior: [{ key: "interaction", label: label("interaction"), value: interaction! },
        ...(slug === "bee" ? [
          { key: "bee-breeding", label: label("beeBreedingLabel"),
            value: t("inspector.mobDetails.beeBreeding") },
          { key: "bee-harvest", label: label("safeHarvest"),
            value: t("inspector.mobDetails.beeHarvest") },
        ] : [])],
      spawning: [{ key: "habitat", label: label("habitat"), value: habitat! },
        ...(slug === "bee" ? [{ key: "bee-schedule", label: label("beeScheduleLabel"),
          value: t("inspector.mobDetails.beeSchedule") }] : [])],
      ...(combatTip ? { combat: [{ key: "combat-tip", label: label("combatTip"),
        value: combatTip }, ...(slug === "bee" ? [{ key: "bee-sting", label: label("beeStingLabel"),
          value: t("inspector.mobDetails.beeSting") }] : [])] } : {}),
    } : undefined;
    const facts = [
      ...(behavior ? [{ key: "behavior", label: label("behavior"),
        value: t(`inspector.mobDetails.behaviors.${behavior}`),
        ...(profile && "trigger" in profile ? { note: t(`inspector.mobDetails.triggers.${profile.trigger}`) } : {}) }] : []),
      ...(health === undefined ? [] : [{ key: "health", label: label("health"),
        value: t("inspector.mobDetails.healthValue", { value: health }) }]),
      ...(profile && "attack" in profile ? [{ key: "attack", label: label("attack"),
        value: t(`inspector.mobDetails.attacks.${profile.attack}`) }] : []),
      ...(profile && "access" in profile ? [{ key: "access", label: label("access"),
        value: t(`inspector.mobDetails.accessTypes.${profile.access}`) }] : []),
    ];
    const actionSection = (kind: "taming" | "breeding"): InspectorSection | null => {
      if (!profile) return null;
      if (kind === "breeding" && base.sections?.some(section => /^mechanics:(breeding|feeding)(:|$)/.test(section.key)))
        return null;
      const ids: readonly string[] = kind === "taming"
        ? "taming" in profile ? profile.taming : [] : "breeding" in profile ? profile.breeding : [];
      const links = ids.filter(id => items.has(id)).map(id => ({ key: `mob-profile:${kind}:${id}`,
        subject: { kind: "item" as const, id }, ...display("item", id) }));
      return links.length ? { key: `mob-profile:${kind}`, title: t(`inspector.mechanicKinds.${kind}`), links } : null;
    };
    return { ...base, ...(overview ? { description: overview } : {}), facts: [...facts, ...(base.facts ?? [])],
      ...(entityGuide ? { entityGuide } : {}),
      ...(boss ? { combat: createElement(BossCombatGuide, { guide: boss, t }) } : {}),
      sections: [actionSection("taming"), actionSection("breeding"),
        ...(structureLinks?.length ? [{ key: "entity:locations", title: label("structureLocations"),
          links: structureLinks }] : []), ...(base.sections ?? [])]
        .concat(entryType ? [{ key: "entity:entry-locations", title: t("inspector.mobDetails.entryStructure"),
          links: [{ key: `mob-profile:entry:${entryType.id}`, subject: { kind: "poi" as const, id: entryType.knowledgeId },
            name: t(`structureMap.types.${entryType.id}`), image: entryType.artwork }] }] : [])
        .filter((section): section is InspectorSection => section !== null) };
  };
};
