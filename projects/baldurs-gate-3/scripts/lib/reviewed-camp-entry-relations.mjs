import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { parseEndpoint, splitArguments } from "./story-goal-facts.mjs";

// A reviewed source boundary, not a visibility or coordinate heuristic. New
// camp-entry rules must be audited instead of silently becoming map pins.
export const applyReviewedCampEntryRelations = (relations, filename, projectRoot) => {
  const hashes = {};
  const read = (file) => {
    const absolute = path.resolve(projectRoot, file), bytes = fs.readFileSync(absolute);
    const key = path.relative(projectRoot, absolute).replaceAll("\\", "/");
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hashes[key] && hashes[key] !== hash) throw new Error(`Camp source changed while reading: ${key}`);
    hashes[key] = hash;
    return JSON.parse(bytes);
  };
  const recipe = read(filename), review = read(recipe.report);
  if (recipe.schemaVersion !== 1 || hashes[recipe.report] !== recipe.reportSha256
    || review.kind !== "camp-entry-native-source-survey" || review.errors.length
    || !review.schedulerProof?.length || !review.offstageRuntime?.length) throw new Error("Unverified camp-entry source review");
  for (const [file, expected] of Object.entries(review.hashes)) {
    const actual = createHash("sha256").update(fs.readFileSync(path.resolve(projectRoot, file))).digest("hex");
    if (actual !== expected) throw new Error(`Stale camp-entry source review: ${file}`);
    hashes[file] = actual;
  }
  const previous = read(review.catalogPath), previousById = new Map(previous.scriptedDestinations.map((entry) => [entry.id, entry]));
  const entries = new Map(review.reviewed.map((entry) => [entry.id, entry]));
  if (entries.size !== review.reviewed.length) throw new Error("Duplicate camp-entry source review");
  const seen = new Set(), retained = [], excluded = [];
  for (const relation of relations) {
    const campBound = relation.evidence.some(({ statement }) => statement.startsWith("DB_Camp("));
    if (!campBound) {
      if (entries.has(relation.id)) throw new Error(`Reviewed camp binding changed: ${relation.id}`);
      retained.push(relation);
      continue;
    }
    const entry = entries.get(relation.id), disposition = recipe.dispositions[entry?.classification];
    if (!entry || entry.unresolved.length || !isDeepStrictEqual(relation, previousById.get(relation.id))) {
      throw new Error(`Camp-entry relation requires a new source review: ${relation.id}`);
    }
    if (seen.has(relation.id)) throw new Error(`Duplicate camp-entry relation: ${relation.id}`);
    seen.add(relation.id);
    if (disposition === "exclude-normal-location") {
      excluded.push({ ...relation, reason: entry.classification, camp: entry.camp,
        review: { report: recipe.report, movement: entry.movement, allowedCamps: entry.allowedCamps,
          contradictedActiveCamp: entry.contradictedActiveCamp } });
      continue;
    }
    if (disposition !== "retain-conditional" || entry.classification !== "camp-listed-conditional-scene"
      || !entry.allowedCamps.includes(entry.camp) || entry.contradictedActiveCamp.length) throw new Error(`Unsupported camp-entry disposition: ${relation.id}`);
    const registrations = entry.registrations.filter(({ evidence }) =>
      splitArguments(evidence.statement)[1] === `"${entry.camp}"`);
    const nightIds = [...new Set(registrations.map(({ evidence }) => parseEndpoint(splitArguments(evidence.statement)[0])?.id).filter(Boolean))].sort();
    if (!nightIds.length || nightIds.some((id) => !entry.nights.includes(id))) throw new Error(`Unbound camp-night registration: ${relation.id}`);
    retained.push({ ...relation, camp: entry.camp,
      campEntryContext: { kind: "conditional-scene-entry", nightIds, report: recipe.report,
        requiresSceneContentReview: true, movement: entry.movement, registrations,
        nightEvidence: entry.nightEvidence.filter(({ id }) => nightIds.includes(id)), effects: entry.effects } });
  }
  if (seen.size !== entries.size) throw new Error("Camp-entry source review no longer matches the complete relation set");
  return { relations: retained, excluded, sourceReview: {
    recipe: path.relative(projectRoot, filename).replaceAll("\\", "/"), report: recipe.report, hashes,
    reviewedRelations: seen.size, retainedConditionalRelations: seen.size - excluded.length,
    excludedNormalLocationRelations: excluded.length, requiresSceneContentReview: true } };
};
