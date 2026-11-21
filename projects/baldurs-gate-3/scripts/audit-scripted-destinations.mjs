import fs from "node:fs";
import path from "node:path";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";
import { createScriptedDestinationReview } from "./lib/scripted-destination-review.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const ids = readRegisteredMapIds(fs.readFileSync(path.join(root, "src/features/map/map-registry.ts"), "utf8"));
const catalog = read("map-sources/catalog/story-location-relations.json");
const review = createScriptedDestinationReview(catalog);
const evidenceKey = ({ sourcePath, sourceLine, statement }) => `${sourcePath}:${sourceLine}:${statement}`;
const evidenceByDestination = Map.groupBy(catalog.scriptedDestinations, ({ character, anchor }) => `${character.id}/${anchor.id}`);
const entries = [];
for (const mapId of ids) {
  for (const entity of Object.values(read(`public/maps/${mapId}/content.json`).entities)) {
    const destination = entity.storyDestination;
    if (!destination) continue;
    const { status, excludedSourceStatements } = review(destination);
    const relations = evidenceByDestination.get(`${destination.characterContentId}/${destination.anchorContentId}`) ?? [];
    const playableEvidence = new Set(relations
      .flatMap(({ evidence }) => evidence.map(evidenceKey)));
    const publishedEvidenceMatches = destination.evidence.length > 0
      && destination.evidence.every((evidence) => playableEvidence.has(evidenceKey(evidence)));
    const publishedEvidence = new Set(destination.evidence.map(evidenceKey));
    const publishedEvidenceComplete = [...playableEvidence].every((key) => publishedEvidence.has(key));
    const alternateEvidenceMatches = (destination.alternateDestinations ?? []).every((alternative) => {
      const eligible = evidenceByDestination.get(`${destination.characterContentId}/${alternative.anchorContentId}`) ?? [];
      const allowed = new Set(eligible.filter(({ kind }) => kind === alternative.kind).flatMap(({ evidence }) => evidence.map(evidenceKey)));
      return alternative.anchorContentId !== destination.anchorContentId && alternative.evidence.length > 0
        && alternative.evidence.every((entry) => allowed.has(evidenceKey(entry)));
    });
    entries.push({ mapId, contentId: entity.id, title: entity.title, status,
      publishedEvidenceMatches, publishedEvidenceComplete, alternateEvidenceMatches,
      arrivalStateMismatch: relations.length > 0 && relations.every(({ arrivalState }) => arrivalState === "corpse") && entity.kind !== "corpse",
      characterContentId: destination.characterContentId, anchorContentId: destination.anchorContentId,
      ...(status === "requires-source-rule-review" ? {
        reason: "Current destination evidence is debug-only. This does not prove the location is fictitious: review normal movement, setup and dialogue anchors before moving or removing its existing marker.",
        excludedSourceStatements,
      } : {}) });
  }
}
const stats = { registeredMaps: ids.length, publishedDestinations: entries.length,
  playableStatements: entries.filter(({ status }) => status === "has-playable-source-statement").length,
  requiresSourceRuleReview: entries.filter(({ status }) => status === "requires-source-rule-review").length,
  stalePublishedEvidence: entries.filter(({ status, publishedEvidenceMatches }) => status === "has-playable-source-statement" && !publishedEvidenceMatches).length,
  incompletePublishedEvidence: entries.filter(({ status, publishedEvidenceComplete }) => status === "has-playable-source-statement" && !publishedEvidenceComplete).length,
  staleAlternateEvidence: entries.filter(({ alternateEvidenceMatches }) => !alternateEvidenceMatches).length,
  arrivalStateMismatches: entries.filter(({ arrivalStateMismatch }) => arrivalStateMismatch).length,
  missingCatalogRelations: entries.filter(({ status }) => status === "missing-catalog-relation").length };
writeGeneratedFile(path.join(root, "map-sources/catalog/scripted-destination-audit.json"), `${JSON.stringify({
  scope: "Source-rule provenance audit; review candidates are not automatic deletion decisions.", stats, entries,
}, null, 2)}\n`);
console.log("Scripted destination source-rule audit:", stats);
