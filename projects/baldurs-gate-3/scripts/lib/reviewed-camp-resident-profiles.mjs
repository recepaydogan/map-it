import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

// Presentation consumes the independently audited normal recruitment chain,
// not a save-repair teleport or an unrestricted initial-position table.
export const readVerifiedCampResidentSourceAudit = (recipe, destinationPath, readText, projectRoot) => {
  const sourceText = readText(recipe.sourceAudit), source = JSON.parse(sourceText);
  const digest = (text) => createHash("sha256").update(text).digest("hex");
  if (recipe.schemaVersion !== 1 || digest(sourceText) !== recipe.sourceAuditSha256
    || source.kind !== "camp-resident-native-source-audit" || source.errors.length
    || path.resolve(projectRoot, destinationPath) !== source.afterPath) throw new Error("Unverified normal camp resident source");
  for (const [file, hash] of Object.entries(source.hashes)) {
    if (digest(readText(file)) !== hash) throw new Error(`Stale normal camp resident proof: ${file}`);
  }
  const auditedAnchors = new Set(source.reviewedRows.map(({ characterId, anchorId }) => `${characterId}/${anchorId}`));
  if (auditedAnchors.size !== source.reviewedRows.length) throw new Error("Duplicate audited resident anchors");
  return auditedAnchors;
};

export const readReviewedCampResidentProfiles = (filename, destinationPath, destinations, readText, projectRoot) => {
  const recipe = JSON.parse(readText(filename));
  const auditedAnchors = readVerifiedCampResidentSourceAudit(recipe, destinationPath, readText, projectRoot);
  const seenContexts = new Set(), profiles = [];
  for (const profile of recipe.profiles) {
    if (seenContexts.has(profile.contextId) || profile.kind !== "npc" || profile.omitAuthoredCombat !== false
      || !profile.localizedDescriptions?.en || !profile.lootAvailability?.en) throw new Error(`Invalid camp resident presentation: ${profile.id}`);
    seenContexts.add(profile.contextId);
    const matches = new Map();
    for (const relation of destinations.filter(({ campResidentContext }) => campResidentContext?.id === profile.contextId)) {
      const key = `${relation.character.id}/${relation.anchor.id}`;
      if (!auditedAnchors.has(key)) throw new Error(`Unaudited camp resident appearance: ${key}`);
      if (matches.has(key) && !isDeepStrictEqual(matches.get(key).campResidentContext, relation.campResidentContext)) {
        throw new Error(`Conflicting resident contexts: ${key}`);
      }
      matches.set(key, relation);
    }
    if (!matches.size) throw new Error(`Camp resident presentation has no locations: ${profile.id}`);
    for (const relation of matches.values()) {
      const context = relation.campResidentContext;
      profiles.push({ id: `${profile.id}:${context.camp}`, characterContentId: relation.character.id, anchorContentId: relation.anchor.id,
        kind: profile.kind, omitAuthoredCombat: false, localizedDescriptions: profile.localizedDescriptions,
        lootAvailability: profile.lootAvailability,
        evidence: [context.registration, context.campFlags, ...context.recruitment.evidence, ...context.runtime.flatMap(({ evidence }) => evidence)] });
    }
  }
  if (profiles.length !== auditedAnchors.size) throw new Error("Resident scene presentation does not cover the reviewed anchor set");
  return profiles;
};
