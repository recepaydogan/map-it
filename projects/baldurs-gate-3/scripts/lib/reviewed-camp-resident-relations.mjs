import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseEndpoint, splitArguments } from "./story-goal-facts.mjs";
import { createReviewedStoryRuleReader, normalizeStoryStatement } from "./reviewed-story-rules.mjs";
import { mergeStoryDestinationEvidence } from "./story-destination-profile.mjs";

// Only explicitly reviewed normal recruitment can activate INIT resident rows.
// An entry-night whitelist must not restrict later recruited camp residents.
export const applyReviewedCampResidentRelations = (relations, facts, filename, projectRoot) => {
  const hashes = {};
  const read = (file) => {
    const absolute = path.resolve(projectRoot, file), data = fs.readFileSync(absolute);
    const key = path.relative(projectRoot, absolute).replaceAll("\\", "/");
    const hash = createHash("sha256").update(data).digest("hex");
    if (hashes[key] && hashes[key] !== hash) throw new Error(`Camp resident source changed: ${key}`);
    hashes[key] = hash;
    return data.toString("utf8");
  };
  const extension = JSON.parse(read(filename)), inherited = extension.baseRecipe ? JSON.parse(read(extension.baseRecipe)) : null;
  if (inherited?.baseRecipe || inherited && extension.runtimeReviews) throw new Error("Resident extensions must retain one verified runtime recipe");
  const recipe = inherited ? { ...inherited, ...extension, residents: [...inherited.residents, ...extension.residents] } : extension;
  const reader = createReviewedStoryRuleReader(read);
  if (recipe.schemaVersion !== 1 || !recipe.runtimeReviews?.length || !recipe.residents?.length) {
    throw new Error("Invalid camp resident review");
  }
  const runtime = recipe.runtimeReviews.map((review) => ({ id: review.id, ...reader.verify(review) }));
  const sourceReviews = new Map((recipe.sourceReviews ?? []).map((review) => [review.id, { id: review.id, ...reader.verify(review) }]));
  if (sourceReviews.size !== (recipe.sourceReviews ?? []).length) throw new Error("Duplicate resident source reviews");
  const supporting = (ids) => ids.map((id) => {
    const rule = sourceReviews.get(id);
    if (!rule) throw new Error(`Missing resident source review: ${id}`);
    return { id, guards: rule.guards, actions: rule.actions, evidence: rule.evidence };
  });
  const statements = (entries) => entries.map((entry) => {
    const line = reader.source(entry.sourcePath).lines[entry.sourceLine - 1];
    if (normalizeStoryStatement(line ?? "") !== entry.statement) throw new Error(`Changed resident source statement: ${entry.sourcePath}:${entry.sourceLine}`);
    return entry;
  });
  const contexts = new Map(), reviewedActors = new Set(), excludedRegistrations = [];
  for (const resident of recipe.residents) {
    const actorId = resident.characterContentId;
    if (reviewedActors.has(actorId)) throw new Error(`Duplicate camp resident review: ${actorId}`);
    reviewedActors.add(actorId);
    const recruitment = reader.verify(resident.recruitmentReview);
    const rules = supporting(resident.supportingReviews ?? []), nativeStatements = statements(resident.sourceStatements ?? []);
    const eligibility = rules.length || nativeStatements.length ? { rules, statements: nativeStatements } : undefined;
    const extraEvidence = [...rules.flatMap(({ evidence }) => evidence), ...nativeStatements];
    const excludedCamps = new Map((resident.excludedCamps ?? []).map((entry) => [entry.camp, entry]));
    if (excludedCamps.size !== (resident.excludedCamps ?? []).length) throw new Error(`Duplicate excluded resident camps: ${resident.id}`);
    const call = recruitment.actions.find((statement) => statement.startsWith("PROC_ORI_SetupCamp("));
    const args = splitArguments(call ?? "");
    if (parseEndpoint(args[0] ?? "")?.id !== actorId || args[1] !== "1") {
      throw new Error(`Camp recruitment does not bind the reviewed actor: ${resident.id}`);
    }
    for (const source of resident.registrationSources) read(source);
    const rows = facts.filter((fact) => fact.section === "init" && !fact.negated
      && fact.predicate === "DB_ORI_OriginCampData" && parseEndpoint(fact.arguments[0])?.id === actorId);
    const flags = facts.filter((fact) => fact.section === "init" && !fact.negated
      && fact.predicate === "DB_OriginCampFlags" && parseEndpoint(fact.arguments[0])?.id === actorId);
    if (rows.length !== resident.expectedCampCount || flags.length !== 1
      || [...rows, ...flags].some((row) => !resident.registrationSources.includes(row.evidence.sourcePath))) {
      throw new Error(`Camp resident registration set changed: ${resident.id}`);
    }
    const camps = new Set();
    for (const row of rows) {
      const camp = row.arguments[1].match(/^"([^"\n]+)"$/)?.[1], anchor = parseEndpoint(row.arguments[2]);
      const key = `${actorId}/${anchor?.id}`;
      if (!camp || !anchor || camps.has(camp) || contexts.has(key)) throw new Error(`Invalid resident registration: ${resident.id}`);
      camps.add(camp);
      const excluded = excludedCamps.get(camp);
      if (excluded) {
        const exclusionRules = supporting(excluded.reviews ?? []), exclusionStatements = statements(excluded.statements ?? []);
        if (!excluded.reason || !exclusionRules.length || !exclusionStatements.length) throw new Error(`Unproven unreachable resident camp: ${resident.id}/${camp}`);
        if (relations.some((relation) => relation.character.id === actorId && relation.anchor.id === anchor.id)) {
          throw new Error(`Unreachable registration overlaps an existing relation; review its disposition: ${key}`);
        }
        excludedRegistrations.push({ characterContentId: actorId, anchorContentId: anchor.id, camp,
          registration: row, reason: excluded.reason, rules: exclusionRules, statements: exclusionStatements });
        continue;
      }
      const context = { id: resident.id, kind: "conditional-camp-resident", camp, requiresSceneContentReview: true,
        registration: row.evidence, campFlags: flags[0].evidence,
        recruitment: { guards: recruitment.guards, evidence: recruitment.evidence },
        runtime: runtime.map(({ id, guards, actions, evidence }) => ({ id, guards, actions, evidence })),
        ...(eligibility ? { eligibility } : {}) };
      contexts.set(key, { context, character: { ...parseEndpoint(row.arguments[0]), type: "character" },
        anchor: { ...anchor, type: "trigger" }, evidence: mergeStoryDestinationEvidence([
          row.evidence, flags[0].evidence, ...recruitment.evidence, ...runtime.flatMap(({ evidence }) => evidence), ...extraEvidence,
        ]) });
    }
    if ([...excludedCamps.keys()].some((camp) => !camps.has(camp))) throw new Error(`Excluded resident camp is not registered: ${resident.id}`);
  }
  const seen = new Set();
  const result = relations.map((relation) => {
    const key = `${relation.character.id}/${relation.anchor.id}`, resident = contexts.get(key);
    if (!resident) return relation;
    if (relation.campEntryContext || relation.camp && relation.camp !== resident.context.camp) {
      throw new Error(`Conflicting camp contexts: ${relation.id}`);
    }
    seen.add(key);
    return { ...relation, camp: resident.context.camp, campResidentContext: resident.context,
      evidence: mergeStoryDestinationEvidence([...relation.evidence, ...resident.evidence]) };
  });
  for (const [key, { context, character, anchor, evidence }] of contexts) if (!seen.has(key)) {
    result.push({ id: `${character.id}:camp:${anchor.id}`, kind: "camp", character, anchor, camp: context.camp,
      arrivalState: "unspecified", arrivalEvidence: [], campResidentContext: context, evidence });
  }
  return { relations: result, sourceReview: {
    recipe: path.relative(projectRoot, filename).replaceAll("\\", "/"), hashes,
    reviewedCharacters: reviewedActors.size, reviewedResidentAnchors: contexts.size,
    existingAnchorsEnriched: seen.size, newAnchors: contexts.size - seen.size, requiresSceneContentReview: true,
    ...(excludedRegistrations.length ? { excludedRegistrations } : {}),
  } };
};
