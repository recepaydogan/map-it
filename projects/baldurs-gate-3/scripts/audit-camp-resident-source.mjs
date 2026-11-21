import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Reconstruct the reviewed native rules without the production rule reader,
// argument binder, relation enricher or destination grouping implementation.
const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 5, "Usage: audit-camp-resident-source.mjs <before-catalog> <after-catalog> <fresh-report>");
const [beforePath, afterPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const outputRelative = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(outputRelative && !outputRelative.startsWith("..") && !path.isAbsolute(outputRelative) && !fs.existsSync(output));
const hashes = {}, errors = [];
const digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute);
  const key = path.relative(root, absolute).replaceAll("\\", "/"), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash, `Input changed: ${key}`);
  hashes[key] = hash;
  return data;
};
const read = (file) => JSON.parse(bytes(file));
const check = (condition, message) => { if (!condition) errors.push(message); };
const before = read(beforePath), after = read(afterPath), extension = read(after.campResidentReviews.recipe);
const inherited = extension.baseRecipe ? read(extension.baseRecipe) : null;
assert(!inherited?.baseRecipe && !(inherited && extension.runtimeReviews));
const recipe = inherited ? { ...inherited, ...extension, residents: [...inherited.residents, ...extension.residents] } : extension;
for (const [file, expected] of Object.entries(after.campResidentReviews.hashes)) assert.equal(digest(bytes(file)), expected);
const normalized = (line) => line.replace(/\/\/.*$/, "").trim().replace(/;$/, "");
const nativeRule = (review) => {
  const lines = bytes(review.sourcePath).toString("utf8").split(/\r?\n/), action = review.actionLine - 1;
  let start = action, end = action + 1;
  while (start >= 0 && !/^(IF|IFF|PROC|QRY)$/.test(normalized(lines[start]))) start--;
  while (end < lines.length && !/^(IF|IFF|PROC|QRY|EXITSECTION|ENDEXITSECTION)$/.test(normalized(lines[end]))) end++;
  assert(start >= 0 && end < lines.length, `Unbounded native rule: ${review.id}`);
  const scoped = lines.slice(start + 1, end);
  assert(scoped.every((line) => !line.includes("/*") && !line.includes("*/")), `Review block comments explicitly: ${review.id}`);
  const then = scoped.findIndex((line) => normalized(line) === "THEN");
  assert(then >= 0 && review.actionLine > start + then + 2);
  const guards = scoped.slice(0, then).map(normalized).filter((line) => line && line !== "AND");
  const actions = scoped.slice(then + 1).map(normalized).filter(Boolean);
  assert.deepEqual(guards, review.requiredGuards);
  for (const statement of review.requiredActions) assert(actions.includes(statement), `Missing reviewed effect: ${review.id}`);
  assert(!guards.some((line) => /DEBUG|DebugTeleported|SavegameIsOlderThan/.test(line)), `Non-normal entry: ${review.id}`);
  const evidence = scoped.flatMap((line, index) => {
    const statement = normalized(line);
    return statement && !["AND", "THEN"].includes(statement)
      ? [{ sourcePath: review.sourcePath, sourceLine: start + index + 2, statement }] : [];
  });
  return { id: review.id, guards, actions, evidence };
};
const runtime = recipe.runtimeReviews.map(nativeRule);
assert.equal(new Set(runtime.map(({ id }) => id)).size, 8);
const byRuntimeId = new Map(runtime.map((rule) => [rule.id, rule]));
// These reviewed roles jointly prove ordinary recruitment, guarded default
// placement, higher-priority scene positions, later camp swaps and faction.
for (const id of ["camp-recruitment-visibility", "camp-recruitment-position", "camp-position-override",
  "camp-position-night", "camp-position-default", "camp-position-fallback", "camp-swap-position", "camp-follower-faction"]) {
  assert(byRuntimeId.has(id), `Missing native runtime role: ${id}`);
}
const extraRules = new Map((recipe.sourceReviews ?? []).map((review) => [review.id, nativeRule(review)]));
assert.equal(extraRules.size, (recipe.sourceReviews ?? []).length);
const selectedRules = (ids) => ids.map((id) => { assert(extraRules.has(id), `Missing source review: ${id}`); return extraRules.get(id); });
const sourceStatements = (entries) => entries.map((entry) => {
  const line = bytes(entry.sourcePath).toString("utf8").split(/\r?\n/)[entry.sourceLine - 1];
  assert.equal(normalized(line), entry.statement);
  return entry;
});
const expected = new Map(), reviewedRows = [], excludedRegistrations = [];
const guid = /[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/gi;
const nativeEndpoint = (argument, type) => {
  const match = argument.match(/^(?:\(([A-Z]+)\))?([A-Za-z0-9_]+)_([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i);
  assert(match, `Not an exact native endpoint: ${argument}`);
  return { id: match[3].toLowerCase(), token: `${match[2]}_${match[3]}`, name: match[2], cast: match[1]?.toLowerCase() ?? null, type };
};
assert.equal(new Set(recipe.residents.map(({ characterContentId }) => characterContentId)).size, recipe.residents.length);
for (const resident of recipe.residents) {
  const recruitment = nativeRule(resident.recruitmentReview);
  assert(recruitment.actions.some((action) => action.startsWith("PROC_ORI_SetupCamp(")
    && action.match(guid)?.[0] === resident.characterContentId && /,\s*1\)$/.test(action)));
  const rules = selectedRules(resident.supportingReviews ?? []), statements = sourceStatements(resident.sourceStatements ?? []);
  const eligibility = rules.length || statements.length ? { rules, statements } : undefined;
  const exclusions = new Map((resident.excludedCamps ?? []).map((entry) => [entry.camp, entry]));
  assert.equal(exclusions.size, (resident.excludedCamps ?? []).length);
  const rows = [], flags = [];
  for (const file of resident.registrationSources) {
    const lines = bytes(file).toString("utf8").split(/\r?\n/);
    const firstKb = lines.indexOf("KBSECTION");
    assert(firstKb > 0);
    for (let index = 0; index < firstKb; index++) {
      const statement = normalized(lines[index]);
      if (!statement.includes(resident.characterContentId)) continue;
      const evidence = { sourcePath: file, sourceLine: index + 1, statement };
      if (statement.startsWith("DB_ORI_OriginCampData(")) rows.push(evidence);
      if (statement.startsWith("DB_OriginCampFlags(")) flags.push(evidence);
    }
  }
  assert.equal(flags.length, 1);
  assert.equal(rows.length, resident.expectedCampCount);
  const camps = new Set();
  for (const row of rows) {
    const ids = row.statement.match(guid), camp = row.statement.match(/,\s*"([A-Z]+)"\s*,/)?.[1];
    assert.equal(ids?.length, 2); assert.equal(ids[0], resident.characterContentId);
    assert(camp && !camps.has(camp)); camps.add(camp);
    const key = `${ids[0]}/${ids[1]}`;
    assert(!expected.has(key));
    const args = row.statement.slice(row.statement.indexOf("(") + 1, -1).split(",").map((argument) => argument.trim());
    assert.equal(args.length, 3);
    const character = nativeEndpoint(args[0], "character"), anchor = nativeEndpoint(args[2], "trigger");
    const excluded = exclusions.get(camp);
    if (excluded) {
      const exclusionRules = selectedRules(excluded.reviews ?? []), exclusionStatements = sourceStatements(excluded.statements ?? []);
      assert(excluded.reason && exclusionRules.length && exclusionStatements.length);
      assert(!before.scriptedDestinations.some((relation) => relation.character.id === ids[0] && relation.anchor.id === ids[1]), "Exclusion would remove an existing relation");
      assert(!after.scriptedDestinations.some((relation) => relation.character.id === ids[0] && relation.anchor.id === ids[1]), "Excluded registration was activated");
      excludedRegistrations.push({ characterContentId: ids[0], anchorContentId: ids[1], camp,
        registration: { predicate: "DB_ORI_OriginCampData", section: "init", negated: false, arguments: args, evidence: row },
        reason: excluded.reason, rules: exclusionRules, statements: exclusionStatements });
      continue;
    }
    expected.set(key, {
      character, anchor,
      context: { id: resident.id, kind: "conditional-camp-resident", camp, requiresSceneContentReview: true,
        registration: row, campFlags: flags[0], recruitment: { guards: recruitment.guards, evidence: recruitment.evidence }, runtime,
        ...(eligibility ? { eligibility } : {}) },
      evidence: [row, flags[0], ...recruitment.evidence, ...runtime.flatMap(({ evidence }) => evidence), ...rules.flatMap(({ evidence }) => evidence), ...statements],
    });
    reviewedRows.push({ characterId: ids[0], anchorId: ids[1], camp, evidence: row });
  }
  assert([...exclusions.keys()].every((camp) => camps.has(camp)));
}
const oldById = new Map(before.scriptedDestinations.map((row) => [row.id, row]));
assert.equal(new Set(after.scriptedDestinations.map(({ id }) => id)).size, after.scriptedDestinations.length);
assert([...oldById.keys()].every((id) => after.scriptedDestinations.some((row) => row.id === id)), "Existing relation removed");
let unchanged = 0, enriched = 0, added = 0;
const seen = new Set();
for (const row of after.scriptedDestinations) {
  const previous = oldById.get(row.id), key = `${row.character.id}/${row.anchor.id}`, proof = expected.get(key);
  if (!proof) { check(equal(row, previous), `Unrelated relation changed: ${row.id}`); unchanged++; continue; }
  assert(!seen.has(key), `Duplicate resident anchor: ${key}`);
  seen.add(key);
  const { campResidentContext, camp, evidence, ...rest } = row;
  if (previous) {
    enriched++;
    assert.deepEqual(rest, Object.fromEntries(Object.entries(previous).filter(([field]) => !["camp", "evidence", "campResidentContext"].includes(field))));
    if (previous.campResidentContext) assert.deepEqual(row, previous, "Earlier reviewed residency changed");
  } else {
    added++;
    assert.deepEqual(rest, { id: `${proof.character.id}:camp:${proof.anchor.id}`, kind: "camp", character: proof.character,
      anchor: proof.anchor, arrivalState: "unspecified", arrivalEvidence: [] });
  }
  check(equal(campResidentContext, proof.context) && camp === proof.context.camp, `Native context mismatch: ${row.id}`);
  const evidenceByKey = new Map([...(previous?.evidence ?? []), ...proof.evidence].map((entry) => [JSON.stringify(entry), entry]));
  check(equal(evidence, [...evidenceByKey.values()]), `Evidence conservation mismatch: ${row.id}`);
}
assert.equal(seen.size, expected.size);
assert.equal(after.campResidentReviews.reviewedResidentAnchors, seen.size);
assert.equal(after.campResidentReviews.reviewedCharacters, recipe.residents.length);
// Producer starts from un-enriched relations, so all retained resident pairs
// (including an earlier reviewed resident) count as existing source anchors.
assert.equal(after.campResidentReviews.existingAnchorsEnriched, enriched);
assert.equal(after.campResidentReviews.newAnchors, added);
assert.deepEqual(after.campResidentReviews.excludedRegistrations ?? [], excludedRegistrations);
const unrelatedFields = Object.keys(before).filter((key) => !["scriptedDestinations", "scriptedDestinationsByCharacterId", "campResidentReviews", "stats"].includes(key));
for (const key of unrelatedFields) check(equal(before[key], after[key]), `Unrelated catalog field changed: ${key}`);
assert.deepEqual(after.stats, { ...before.stats, scriptedDestinations: before.stats.scriptedDestinations + added,
  scriptedDestinationCharacters: new Set(after.scriptedDestinations.map((row) => row.character.id)).size });
const expectedIndex = Object.fromEntries(Object.entries(Object.groupBy(after.scriptedDestinations, (row) => row.character.id)));
check(equal(expectedIndex, after.scriptedDestinationsByCharacterId), "Actor index does not match complete relations");
for (const file of [import.meta.filename, "scripts/lib/reviewed-camp-resident-relations.mjs", "scripts/lib/story-destination-profile.mjs",
  "scripts/lib/story-destination.mjs", "scripts/build-story-location-relation-catalog.mjs"]) bytes(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
const stats = { totalRelations: after.scriptedDestinations.length, unchangedRelations: unchanged, enrichedResidentRelations: enriched,
  reviewedNativeResidentAnchors: seen.size, excludedNativeRegistrations: excludedRegistrations.length,
  normalRuntimeRules: runtime.length, addedRelations: added, removedRelations: 0 };
writeGeneratedFile(output, `${JSON.stringify({ kind: "camp-resident-native-source-audit", beforePath, afterPath, stats,
  reviewedRows, excludedRegistrations, runtime, hashes, errors,
  scope: "Normal conditional camp residency and exact native provenance; complete unrelated catalog/evidence conservation. Does not approve combat, loot, scene presentation or publication." }, null, 2)}\n`);
console.log(JSON.stringify({ stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
