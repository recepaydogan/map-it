import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { labelByCandidateKind, publicCategoryByCandidateKind } from "./placement-presentation.mjs";

export const createSceneContentResolver = (catalog) => {
  const profiles = new Map((catalog?.profiles ?? []).map((profile) => [`${profile.characterContentId}/${profile.anchorContentId}`, profile]));
  if (profiles.size !== (catalog?.profiles ?? []).length) throw new Error("Duplicate scene content profiles");
  return (destination) => destination ? profiles.get(`${destination.characterContentId}/${destination.anchorContentId}`) : undefined;
};

// Retain authored inventory and combat evidence, but do not present a source
// actor's original encounter as the current state of a reviewed later scene.
export const applySceneContentProfile = (entity, profile) => {
  if (!profile) return entity;
  if (entity.storyDestination?.characterContentId !== profile.characterContentId
    || entity.storyDestination.anchorContentId !== profile.anchorContentId) throw new Error(`Scene identity mismatch: ${entity.id}`);
  const { combat, ...gameplay } = entity.gameplay ?? {};
  const { deathLoot, tradeInventory, ...rest } = entity;
  const replacement = profile.inventoryChange;
  const equipmentChange = profile.equipmentChange;
  const identityOnly = profile.appearance?.projection === "identity-only";
  if (profile.appearance && (identityOnly
    ? !profile.omitAuthoredCombat || entity.statsId !== profile.appearance.authoredStatsId
    : entity.statsId !== profile.appearance.statsId)) throw new Error(`Unreviewed scene stat transformation: ${entity.id}`);
  return { ...rest, kind: profile.kind ?? entity.kind,
    ...(profile.localizedTitles ? { title: profile.localizedTitles.en, localizedTitles: profile.localizedTitles } : {}),
    ...(profile.appearance ? { iconId: profile.appearance.iconId } : {}),
    // An authored pool remains evidence after a scripted inventory transfer,
    // but must not be rendered as the later scene's current stock.
    ...(tradeInventory && !replacement ? { tradeInventory } : {}),
    ...(profile.kind && entity.tags ? { tags: [...new Set(entity.tags.map((tag) => tag === entity.kind ? profile.kind : tag))] } : {}),
    ...(profile.omitAuthoredCombat && entity.gameplay ? { gameplay } : {}),
    sceneContext: { id: profile.id, localizedDescriptions: profile.localizedDescriptions, evidence: profile.evidence,
      ...(profile.localizedTitles ? { authoredTitles: entity.sceneContext?.authoredTitles ?? entity.localizedTitles ?? { en: entity.title } } : {}),
      ...(equipmentChange ? { equipmentChange } : {}),
      ...(profile.itemTransfers ? { itemTransfers: profile.itemTransfers } : {}),
      ...(profile.appearance ? { appearance: profile.appearance, authoredIconId: entity.iconId } : {}),
      ...(replacement ? { inventoryChange: replacement,
        ...(tradeInventory || entity.sceneContext?.authoredTradeInventory
          ? { authoredTradeInventory: tradeInventory ?? entity.sceneContext.authoredTradeInventory } : {}),
        ...(entity.sceneContext?.authoredLoot || deathLoot ? { authoredLoot: entity.sceneContext?.authoredLoot ?? deathLoot } : {}) } : {}),
      ...(profile.omitAuthoredCombat && (combat || entity.sceneContext?.authoredCombat)
        ? { authoredCombat: combat ?? entity.sceneContext.authoredCombat } : {}) },
    ...(deathLoot ? { deathLoot: profile.lootAvailability ? { ...deathLoot,
      availability: { id: profile.id, localizedConditions: profile.lootAvailability, evidence: profile.evidence,
        ...(profile.deathDropsUnavailable ? { deathDropsUnavailable: true } : {}) } } : deathLoot } : {}) };
};

// Append proven scene possessions without deleting potentially retained gear.
// The transfer's equipped-item and story-item exceptions remain explicit.
export const applySceneInventorySearch = (location, profile) => {
  // Markers and the cross-map index consume name, not the content entity's
  // title field. Keep the authored name searchable after a scene renames it.
  if (profile?.localizedTitles) location = { ...location, name: profile.localizedTitles.en,
    searchTerms: [...(location.searchTerms ?? []), location.name, ...Object.values(profile.localizedTitles)] };
  const replacement = profile?.inventoryChange;
  const equipment = profile?.equipmentChange;
  if (!replacement && !equipment && !profile?.itemTransfers) return location;
  const terms = [...(location.searchTerms ?? [])];
  const items = [...(replacement?.branches ?? []).filter((branch) => !branch.reviewOnly).flatMap(({ items }) => items), ...(equipment?.items ?? []),
    ...(profile?.itemTransfers ?? []).map((transfer) => transfer.item)];
  return { ...location, searchTerms: [...terms, ...items.flatMap((item) => [
    ...Object.values(item.localizedNames), item.statsId,
  ])] };
};

export const acquisitionAvailability = (availability, certainty) => availability ? {
  certainty: "story", detail: availability.localizedConditions.en, localizedDetails: availability.localizedConditions,
  locationDetail: availability.localizedConditions.en, localizedLocationDetails: availability.localizedConditions,
} : { certainty };

// A scene can forbid death acquisition without removing authored inventory,
// pickpocket eligibility, or conditional source-pool evidence.
export const allowsDeathAcquisition = (availability) => availability?.deathDropsUnavailable !== true;

export const applySceneLocationPresentation = (location, profile) => {
  if (!profile?.kind) return location;
  const kind = profile.kind;
  if (!Object.hasOwn(labelByCandidateKind, kind)) throw new Error(`Unknown scene kind: ${kind}`);
  const { categoryFacets, ...rest } = location;
  const facets = categoryFacets?.filter((facet) => facet !== publicCategoryByCandidateKind[kind]);
  return { ...rest, category: publicCategoryByCandidateKind[kind], label: labelByCandidateKind[kind], subtype: kind,
    ...(facets?.length ? { categoryFacets: facets } : {}) };
};
export const readVerifiedSceneContentCatalog = (filename, projectRoot) => {
  const catalog = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (!catalog.hashes || !Object.keys(catalog.hashes).length || !Array.isArray(catalog.profiles)) throw new Error(`Scene catalog lacks source evidence: ${filename}`);
  for (const profile of catalog.profiles) {
    if (!profile.localizedDescriptions?.en || !profile.lootAvailability?.en
      || profile.deathDropsUnavailable !== undefined && profile.deathDropsUnavailable !== true
      || profile.inventoryChange && profile.inventoryChange.mode !== "transfer-and-equip"
      || profile.localizedTitles && !profile.localizedTitles.en
      || profile.itemTransfers && (!Array.isArray(profile.itemTransfers) || !profile.itemTransfers.length
        || new Set(profile.itemTransfers.map((transfer) => transfer.id)).size !== profile.itemTransfers.length
        || profile.itemTransfers.some((transfer) => !transfer.id || transfer.mode !== "move-existing-item"
          || transfer.destinationContentId !== profile.characterContentId
          || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(transfer.objectId ?? "")
          || !transfer.localizedConditions?.en || !transfer.evidence?.length || !transfer.item?.evidence?.length
          || !transfer.item.itemId || !transfer.item.templateId || !transfer.item.statsId || !transfer.item.localizedNames?.en
          || transfer.item.title !== transfer.item.localizedNames.en || !Number.isInteger(transfer.item.amount) || transfer.item.amount < 1))
      || profile.equipmentChange && (!["replace-equipped-slots", "give-equipment-set", "copy-equipped"].includes(profile.equipmentChange.mode)
        || !profile.equipmentChange.items?.length || !Array.isArray(profile.equipmentChange.removedSlots)
        || profile.equipmentChange.mode === "replace-equipped-slots" && !profile.equipmentChange.removedSlots.length
        || profile.equipmentChange.mode !== "replace-equipped-slots" && profile.equipmentChange.removedSlots.length !== 0
        || profile.equipmentChange.mode === "copy-equipped" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(profile.equipmentChange.sourceCharacterContentId ?? "")
        || profile.equipmentChange.mode !== "copy-equipped" && profile.equipmentChange.sourceCharacterContentId !== undefined
        || (profile.equipmentChange.unresolvedEntries ?? []).some((entry) => !entry.statsId
          || entry.reason !== "equipment-definition-reference-not-resolved-item" || !entry.evidence?.length)
        || !profile.equipmentChange.localizedConditions?.en || !profile.equipmentChange.evidence?.length)
      || profile.appearance && (!profile.appearance.iconId || !profile.appearance.statsId || !profile.appearance.ruleSourcePath
        || profile.appearance.projection !== undefined && profile.appearance.projection !== "identity-only"
        || profile.appearance.projection === "identity-only" && (!profile.appearance.authoredStatsId || !profile.omitAuthoredCombat))) {
      throw new Error(`Unsupported scene inventory semantics: ${profile.id}`);
    }
  }
  for (const [file, expected] of Object.entries(catalog.hashes)) {
    const actual = createHash("sha256").update(fs.readFileSync(path.resolve(projectRoot, file))).digest("hex");
    if (actual !== expected) throw new Error(`Stale scene content source: ${file}`);
  }
  return catalog;
};
