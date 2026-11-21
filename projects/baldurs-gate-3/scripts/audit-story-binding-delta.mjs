import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { readStoryFacts } from "./lib/story-goal-facts.mjs";
import { createStoryRuleLookup } from "./lib/story-rule-context.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// An actual-source delta audit, not a fixture suite. Argument substitution and
// comparison checks intentionally do not call the destination resolver/binder.
const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 6, "Usage: audit-story-binding-delta.mjs <before> <after> <canonical-stage> <fresh-report>");
const [beforePath, afterPath, canonical, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const destination = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(destination && !destination.startsWith("..") && !path.isAbsolute(destination) && !fs.existsSync(output), "Use a fresh audit report");
const hashes = {}, errors = [];
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute);
  const digest = createHash("sha256").update(data).digest("hex");
  assert(!hashes[relative(absolute)] || hashes[relative(absolute)] === digest, `Input changed: ${file}`);
  hashes[relative(absolute)] = digest;
  return data;
};
const read = (file) => JSON.parse(bytes(file));
const check = (condition, message) => { if (!condition) errors.push(message); };
const key = ({ sourcePath, sourceLine, statement }) => `${sourcePath}:${sourceLine}:${statement}`;
const before = read(beforePath), after = read(afterPath), manifest = read(path.join(canonical, "stage-manifest.json"));
const previous = new Map(before.scriptedDestinations.map((row) => [row.id, row]));
const current = new Map(after.scriptedDestinations.map((row) => [row.id, row]));
check(previous.size === before.scriptedDestinations.length && current.size === after.scriptedDestinations.length, "Duplicate relation identities");
const allowed = new Set(["stats", "scriptedDestinations", "scriptedDestinationsByCharacterId", "excludedScriptedDestinations"]);
for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
  if (!allowed.has(field)) check(equal(before[field], after[field]), `Unrelated catalog field changed: ${field}`);
}
const allowedStats = new Set(["scriptedDestinations", "scriptedDestinationCharacters", "excludedDebugDestinationStatements"]);
for (const field of new Set([...Object.keys(before.stats), ...Object.keys(after.stats)])) {
  if (!allowedStats.has(field)) check(before.stats[field] === after.stats[field], `Unrelated statistic changed: ${field}`);
}
check(after.stats.scriptedDestinations === current.size, "Relation count disagrees");
check(after.stats.scriptedDestinationCharacters === new Set(after.scriptedDestinations.map((row) => row.character.id)).size, "Actor count disagrees");
check(after.stats.excludedDebugDestinationStatements === after.excludedScriptedDestinations.length, "Debug count disagrees");
check(equal({ ...Object.groupBy(after.scriptedDestinations, ({ character }) => character.id) }, after.scriptedDestinationsByCharacterId), "Character index disagrees");

const facts = readStoryFacts([path.join(root, "map-sources/extracted/story-goals"),
  path.join(root, "map-sources/extracted/story-support/shared"),
  path.join(root, "map-sources/extracted/story-support/patched-shared-camp")], root);
const factByKey = new Map(facts.map((fact) => [key(fact.evidence), fact]));
const nativeFact = (evidence) => {
  const negated = evidence.statement.startsWith("NOT ");
  const fact = factByKey.get(key(negated ? { ...evidence, statement: evidence.statement.slice(4) } : evidence));
  return fact && fact.negated === negated ? fact : null;
};
const ruleCache = new Map();
const ruleFor = (fact) => {
  const file = fact.evidence.sourcePath;
  if (!ruleCache.has(file)) ruleCache.set(file, createStoryRuleLookup(bytes(file).toString("utf8")));
  return ruleCache.get(file)(fact.evidence.sourceLine);
};
const movement = { TeleportTo: "teleport", CharacterMoveTo: "move", PROC_CharacterMoveTo: "move", PROC_AppearOutOfSightTo: "appear" };
const strip = (value) => value.trim().replace(/^\([A-Z]+\)\s*/, "");
const guid = (value) => strip(value).match(/^(?:[A-Za-z0-9_]+_)?([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i)?.[1].toLowerCase();
const variable = (value) => /^_[A-Za-z]\w*$/.test(strip(value)) ? strip(value) : null;
const valueKey = (value) => guid(value) ?? strip(value);
const substitute = (value, assignments) => assignments.get(variable(value)) ?? value;
const join = (guard, row) => {
  if (guard.predicate !== row.predicate || guard.arguments.length !== row.arguments.length) return null;
  const assignments = new Map();
  for (let index = 0; index < guard.arguments.length; index++) {
    const pattern = strip(guard.arguments[index]), value = row.arguments[index];
    if (pattern === "_") continue;
    if (variable(pattern)) {
      if (assignments.has(pattern) && valueKey(assignments.get(pattern)) !== valueKey(value)) return null;
      assignments.set(pattern, value);
    } else if (valueKey(pattern) !== valueKey(value)) return null;
  }
  return assignments;
};
const comparisons = (rule, assignments) => (rule?.guards ?? []).join("\n")
  .split(/(?:^|\n)\s*AND\s*(?:\n|$)/).flatMap((condition) => {
    const match = condition.trim().match(/^([\s\S]+?)\s*(!=|==)\s*([\s\S]+)$/);
    if (!match) return [];
    const atom = (value) => {
      const bound = substitute(value.trim(), assignments), id = guid(bound);
      if (id) return { type: "identity", value: id };
      // Restrict strings to unescaped source literals; do not invent escape or
      // numeric coercion semantics for this source-language audit.
      if (/^"[^"\\\r\n]*"$/.test(strip(bound))) return { type: "string", value: strip(bound).slice(1, -1) };
      return null;
    };
    const left = atom(match[1]), right = atom(match[3]);
    return [{ condition: condition.trim(), left, right, verdict: !left || !right || left.type !== right.type ? "unknown"
      : (match[2] === "==" ? left.value === right.value : left.value !== right.value) ? "satisfied" : "contradicted" }];
  });
const changed = after.scriptedDestinations.filter((row) => !equal(row, previous.get(row.id)));
const removed = before.scriptedDestinations.filter((row) => !current.has(row.id));
const prove = (relation) => {
  const evidenceFacts = relation.evidence.map(nativeFact).filter(Boolean);
  const proofs = [], contradictions = [], unsupportedActions = [];
  const resolveEvidenceAction = (action, trail = new Set()) => {
    const rule = ruleFor(action);
    if (trail.has(key(action.evidence)) || action.negated || rule?.debugOnly
      || rule && (!rule.actionLine || action.evidence.sourceLine < rule.actionLine)) return [];
    const candidates = [];
    if (action.arguments.slice(0, 2).every(guid)) candidates.push({ assignments: new Map(), evidence: [action.evidence] });
    for (const guard of evidenceFacts.filter((fact) => !fact.negated && fact.predicate.startsWith("DB_") && fact.section === "kb"
      && fact.evidence.sourcePath === action.evidence.sourcePath && rule && fact.evidence.sourceLine >= rule.sourceLine && fact.evidence.sourceLine < rule.actionLine)) {
      for (const row of evidenceFacts.filter((fact) => fact.section === "init" && !fact.negated)) {
        const assignments = join(guard, row);
        if (assignments) candidates.push({ assignments, evidence: [row.evidence, guard.evidence, action.evidence] });
      }
    }
    const headers = rule?.kind === "PROC" ? evidenceFacts.filter((fact) => fact.predicate.startsWith("PROC_")
      && fact.evidence.sourcePath === action.evidence.sourcePath && fact.evidence.sourceLine >= rule.sourceLine
      && fact.evidence.sourceLine < rule.actionLine) : [];
    if (headers.length === 1) {
      const [header] = headers, nextTrail = new Set([...trail, key(action.evidence)]);
      for (const call of evidenceFacts.filter((fact) => fact.predicate === header.predicate && fact !== header)) {
        for (const resolved of resolveEvidenceAction(call, nextTrail)) {
          const assignments = join(header, { ...call, arguments: resolved.arguments });
          if (assignments) candidates.push({ assignments, evidence: [...resolved.evidence, header.evidence, action.evidence],
            inheritedComparisons: resolved.comparisons, parentProof: resolved });
        }
      }
    }
    return candidates.map(({ assignments, evidence, inheritedComparisons = [], parentProof }) => ({
      arguments: action.arguments.map((value) => substitute(value, assignments)), evidence, assignments: Object.fromEntries(assignments),
      rule: rule ? { sourcePath: action.evidence.sourcePath, sourceLine: rule.sourceLine, guards: rule.guards } : null,
      comparisons: [...inheritedComparisons, ...comparisons(rule, assignments)], ...(parentProof ? { parentProof } : {}),
    }));
  };
  for (const action of evidenceFacts.filter((fact) => movement[fact.predicate] === relation.kind)) {
    const rule = ruleFor(action);
    if (action.negated || rule?.debugOnly || rule && (!rule.actionLine || action.evidence.sourceLine < rule.actionLine)) continue;
    let matched = false;
    for (const proof of resolveEvidenceAction(action)) {
      if (guid(proof.arguments[0] ?? "") !== relation.character.id || guid(proof.arguments[1] ?? "") !== relation.anchor.id) continue;
      matched = true;
      if (proof.comparisons.some(({ verdict }) => verdict === "contradicted")) contradictions.push(proof);
      else proofs.push(proof);
    }
    if (!matched) unsupportedActions.push(action.evidence);
  }
  const unique = (rows) => [...new Map(rows.map((row) => [JSON.stringify(row), row])).values()];
  return { proofs: unique(proofs), contradictions: unique(contradictions), unsupportedActions: unique(unsupportedActions) };
};

// Check all current citations, not only changed rows. Binding reconstruction is
// deliberately scoped to the delta; unchanged helper/camp proofs stay separate.
let citations = 0;
for (const row of after.scriptedDestinations) {
  check(row.id === `${row.character.id}:${row.kind}:${row.anchor.id}`, `Malformed identity: ${row.id}`);
  for (const evidence of [...row.evidence, ...row.arrivalEvidence]) {
    const fact = nativeFact(evidence); citations++;
    check(fact, `Missing/inactive native statement: ${key(evidence)}`);
    if (fact) bytes(evidence.sourcePath);
  }
}
const changes = changed.map((row) => {
  const old = previous.get(row.id), result = prove(row);
  const fields = old ? [...new Set([...Object.keys(old), ...Object.keys(row)])].filter((field) => !equal(old[field], row[field])) : [];
  const removedEvidence = old?.evidence.filter((evidence) => !row.evidence.some((next) => equal(evidence, next))) ?? [];
  const previousContradictions = removedEvidence.length ? prove(old).contradictions : [];
  const contradictedCitations = new Set(previousContradictions.flatMap(({ evidence }) => evidence.map(key)));
  for (const evidence of removedEvidence) check(contradictedCitations.has(key(evidence)), `Unexplained discarded evidence: ${row.id}/${key(evidence)}`);
  if (old) {
    check(fields.every((field) => ["character", "anchor", "evidence"].includes(field)), `Unexpected changed field: ${row.id}`);
    for (const field of ["character", "anchor"]) check(equal({ ...old[field], token: null, cast: null }, { ...row[field], token: null, cast: null }), `Endpoint identity changed: ${row.id}`);
  }
  check(result.proofs.length > 0, `No independent delta binding: ${row.id}`);
  check(result.contradictions.length === 0, `Contradictory source branch retained: ${row.id}`);
  check(result.unsupportedActions.length === 0, `Unsupported cited delta action: ${row.id}`);
  return { id: row.id, change: old ? "changed-evidence" : "added", fields, removedEvidence, previousContradictions, ...result };
});
const removals = removed.map((row) => {
  const result = prove(row);
  check(result.proofs.length === 0 && result.contradictions.length > 0 && result.unsupportedActions.length === 0, `Removal not fully explained by native contradiction: ${row.id}`);
  return { id: row.id, ...result };
});
const changedIds = new Set([...changed, ...removed].map(({ id }) => id)), affectedAppearances = [];
for (const mapId of manifest.maps) {
  const content = read(path.join(canonical, `public/maps/${mapId}/content.json`));
  for (const entity of content.entities) {
    const profile = entity.storyDestination;
    if (!profile) continue;
    const anchors = [profile.anchorContentId, ...(profile.otherAnchorContentIds ?? [])];
    const relations = [...changedIds].filter((id) => id.startsWith(`${profile.characterContentId}:`) && anchors.includes(id.split(":").at(-1)));
    if (relations.length) affectedAppearances.push({ mapId, id: entity.id, title: entity.title, selectedAnchor: profile.anchorContentId, relations,
      selectedRelationRemoved: removed.some((row) => row.character.id === profile.characterContentId && row.anchor.id === profile.anchorContentId) });
  }
}
for (const row of before.excludedScriptedDestinations) check(after.excludedScriptedDestinations.some((next) => equal(row, next)), `Previously excluded debug evidence changed: ${row.id}`);
const extraExclusions = after.excludedScriptedDestinations.filter((row) => !before.excludedScriptedDestinations.some((old) => equal(old, row)));
for (const row of extraExclusions) {
  const actions = row.evidence.map((evidence) => factByKey.get(key(evidence))).filter((fact) => fact && movement[fact.predicate] === row.kind);
  check(actions.some((fact) => ruleFor(fact)?.debugOnly), `New debug exclusion lacks debug source: ${row.id}`);
}
for (const file of [import.meta.filename, "scripts/lib/story-destination.mjs", "scripts/lib/story-destination-resolution.mjs",
  "scripts/lib/story-goal-facts.mjs", "scripts/lib/story-rule-context.mjs", "scripts/lib/story-source-lines.mjs"]) bytes(file);
for (const [file, expected] of Object.entries(hashes)) assert.equal(hash(path.resolve(root, file)), expected, `Input changed during audit: ${file}`);
const stats = { beforeRelations: previous.size, afterRelations: current.size, added: changes.filter(({ change }) => change === "added").length,
  changed: changes.filter(({ change }) => change !== "added").length, removed: removals.length, nativeFacts: facts.length, checkedCitations: citations,
  addedDebugExclusions: extraExclusions.length, affectedCanonicalAppearances: affectedAppearances.length,
  selectedRemovedAppearances: affectedAppearances.filter(({ selectedRelationRemoved }) => selectedRelationRemoved).length };
writeGeneratedFile(output, `${JSON.stringify({ kind: "story-binding-delta-audit", beforePath, afterPath, canonical, stats, changes, removals,
  affectedAppearances, extraExclusions, hashes, errors,
  scope: "Complete catalog delta/conservation, native citations and independent single-table argument/comparison reconstruction for every changed relation. Runtime branch reachability, complete map coverage, scene roles/inventory and publication remain separate reviews." }, null, 2)}\n`);
console.log(JSON.stringify({ stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
