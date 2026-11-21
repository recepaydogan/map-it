import assert from "node:assert/strict";
import { createStoryDestinationResolver } from "./lib/story-destination-resolution.mjs";
import { createStoryRuleLookup } from "./lib/story-rule-context.mjs";
import { splitArguments } from "./lib/story-goal-facts.mjs";
import { bindStoryArguments, forwardsDestinationPair, resolveStoryDestination, selectStoryDestination, STORY_DESTINATION_PREDICATES, substituteStoryArguments } from "./lib/story-destination.mjs";

const actor = "(CHARACTER)Actor_11111111-1111-1111-1111-111111111111";
const anchor = "(TRIGGER)Anchor_22222222-2222-2222-2222-222222222222";
const action = { arguments: ["_Actor", "_Anchor", '"arrival"'], evidence: { sourceLine: 30 } };
const guard = { predicate: "DB_Survivors", arguments: ['"survivor"', "_Actor", "_Anchor", "_"], evidence: { sourceLine: 28 } };
const row = { arguments: ['"survivor"', actor, anchor, '"dialog"'], evidence: { sourceLine: 4 } };
const rows = new Map([[guard.predicate, [row]]]);
const resolved = resolveStoryDestination(action, [guard], rows);
assert.equal(resolved.length, 1);
assert.deepEqual(resolved[0].arguments, [actor, anchor, '"arrival"']);
assert.deepEqual(resolved[0].evidence.map(({ sourceLine }) => sourceLine), [4, 28, 30]);
assert.deepEqual(resolveStoryDestination(action, [{ ...guard, negated: true }], rows), []);
assert.deepEqual(resolveStoryDestination(action, [guard, { ...guard, predicate: "DB_Other" }], rows), []);
assert.deepEqual(resolveStoryDestination(action, [{ ...guard, arguments: ['"another"', "_Actor", "_Anchor", "_"] }], rows), []);
assert.deepEqual(resolveStoryDestination(action, [guard], new Map([[guard.predicate, [{ ...row, negated: true }]]])), []);
assert.deepEqual(resolveStoryDestination(action, [guard], new Map([[guard.predicate, [{ ...row, arguments: ['"survivor"', actor, "_RuntimeAnchor", '"dialog"'] }]]])), []);
assert.deepEqual(resolveStoryDestination(action, [{ ...guard, arguments: ['"survivor"', "_Actor", "_Anchor", "_Actor"] }], rows), []);
assert.equal(resolveStoryDestination({ ...action, arguments: [actor, anchor] }, [], new Map()).length, 1);
assert.equal(STORY_DESTINATION_PREDICATES.PROC_CharacterMoveTo, "move");
assert.equal(STORY_DESTINATION_PREDICATES.PROC_AppearOutOfSightTo, "appear");
console.log("Story destinations passed: direct helpers, exact DB joins, literals, repeated variables, negation and ambiguous-join rejection.");
const destinations = [{ anchor: { id: "a" }, relation: { evidence: [1] } }, { anchor: { id: "b" }, relation: { evidence: [1, 2] } }];
assert.equal(selectStoryDestination(destinations, "a").anchor.id, "a");
assert.equal(selectStoryDestination(destinations, "missing").anchor.id, "b");
assert.deepEqual(destinations.map(({ anchor }) => anchor.id), ["a", "b"]);
console.log("Destination stability passed: retain only a still-valid previous anchor and never mutate source ordering.");
const bindings = bindStoryArguments(["(CHARACTER)_Actor", "(TRIGGER)_Anchor", "(STRING)_Group"], [actor, anchor, '"group"']);
assert.deepEqual(substituteStoryArguments(["_Actor", "_Anchor"], bindings), [actor, anchor]);
assert.equal(bindStoryArguments(["_Actor", '"fixed"'], [actor, '"other"']), null);
assert.equal(forwardsDestinationPair(["(CHARACTER)_Actor", "(TRIGGER)_Anchor"], ["_Actor", "_Anchor"]), true);
assert.equal(forwardsDestinationPair(["_Actor", "_Anchor"], ["_Anchor", "_Actor"]), false);

const fromSource = (source) => {
  const lookup = createStoryRuleLookup(source);
  let section;
  const facts = source.split("\n").flatMap((line, index) => {
    if (line === "INITSECTION") section = "init";
    if (line === "KBSECTION") section = "kb";
    const predicate = line.match(/^(\w+)\(/)?.[1];
    return predicate ? [{ predicate, section, arguments: splitArguments(line), evidence: { sourcePath: "fixture", sourceLine: index + 1, statement: line.replace(/;$/, "") } }] : [];
  });
  const resolver = createStoryDestinationResolver(facts, (fact) => lookup(fact.evidence.sourceLine));
  const action = facts.find(({ predicate }) => predicate === "TeleportTo");
  return { resolver, values: resolver.resolve(action) };
};
const fixture = (group, extraGuard = "", debugCaller = false) => fromSource([
  "INITSECTION", `DB_Setup(${actor},${anchor},"${group}");`, "KBSECTION",
  ...(debugCaller ? ["//REGION Debug"] : []),
  "PROC", "PROC_Setup()", "AND", "DB_Setup(_Actor,_Anchor,_Group)", "THEN", "PROC_Place(_Actor,_Anchor,_Group);",
  ...(debugCaller ? ["//END_REGION"] : []),
  "PROC", "PROC_Place((CHARACTER)_Actor,(TRIGGER)_Anchor,(STRING)_Group)", "THEN", "TeleportTo(_Actor,_Anchor);",
  "PROC", 'PROC_Place((CHARACTER)_Actor,_Anchor,"dead")', ...(extraGuard ? ["AND", extraGuard] : []), "THEN", "PROC_Kill(_Actor);",
  "PROC", "PROC_Kill((CHARACTER)_Actor)", "THEN", "Die(_Actor);", "EXITSECTION",
].join("\n"));
for (const [group, guarded, dead] of [["dead", "", true], ["alive", "", false], ["dead", "DB_RuntimeFlag(1)", false]]) {
  const { resolver, values } = fixture(group, guarded);
  assert.equal(values.length, 1);
  assert.deepEqual(values[0].arguments, [actor, anchor]);
  assert.equal(resolver.corpseEvidence(values[0]).length > 0, dead, "Only matching, unconditional procedure effects prove corpse placement");
  assert.ok(values[0].evidence.some(({ statement }) => statement.startsWith("DB_Setup(")));
}
assert.deepEqual(fixture("dead", "", true).values, [], "A debug-only caller cannot support a normal helper");
console.log("Procedure binding passed: DB-to-procedure forwarding, normal-only callers, literal overloads and guarded death rejection.");
for (const [event, guarded, target, expected] of [["arrival", false, "_Actor", true], ["other", false, "_Actor", false], ["arrival", true, "_Actor", false], ["arrival", false, anchor, false]]) {
  const { resolver, values } = fromSource([
    "INITSECTION", "KBSECTION", "IF", 'TextEvent("normal_story")', "THEN", `TeleportTo(${actor},${anchor},"arrival");`,
    "IF", `EntityEvent(_Actor,"${event}")`, ...(guarded ? ["AND", "DB_RuntimeFlag(1)"] : []), "THEN", `Die(${target});`, "EXITSECTION",
  ].join("\n"));
  assert.equal(values.length, 1);
  assert.equal(resolver.corpseEvidence(values[0]).length > 0, expected, "Arrival effects must match both the literal event and the same actor without extra guards");
}
console.log("Arrival event binding passed: exact event and actor, no unrelated or conditional deaths.");
for (const [mutable, expected] of [[false, true], [true, false]]) {
  const { resolver, values } = fromSource([
    "INITSECTION", 'DB_DeadGroups("dead");', "KBSECTION",
    "IF", 'TextEvent("normal_story")', "THEN", `PROC_Place(${actor},${anchor},"dead");`,
    "PROC", "PROC_Place(_Actor,_Anchor,_Group)", "THEN", "TeleportTo(_Actor,_Anchor);",
    "PROC", "PROC_Place(_Actor,_Anchor,_Group)", "AND", "DB_DeadGroups(_Group)", "THEN", "Die(_Actor);",
    ...(mutable ? ["IF", 'TextEvent("runtime_change")', "THEN", 'DB_DeadGroups("alive");'] : []), "EXITSECTION",
  ].join("\n"));
  assert.equal(resolver.corpseEvidence(values[0]).length > 0, expected, "Only immutable, fully bound source tables can discharge a death guard");
}
console.log("Arrival group binding passed: immutable source enums accepted, mutable runtime databases rejected.");
