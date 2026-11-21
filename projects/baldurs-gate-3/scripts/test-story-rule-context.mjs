import assert from "node:assert/strict";
import { createStoryRuleLookup } from "./lib/story-rule-context.mjs";
import { assertScriptedDestinationsReviewed, createScriptedDestinationReview } from "./lib/scripted-destination-review.mjs";

const source = [
  "INITSECTION", "NormalInit();", "KBSECTION",
  "IF", "FlagSet((FLAG)Debug_Teleport_11111111-1111-1111-1111-111111111111,_,_)",
  "THEN", "TeleportTo(Actor,Anchor);",
  "IF", "// Debug in a comment must not exclude a playable rule.", "FlagSet((FLAG)Quest_11111111-1111-1111-1111-111111111111,_,_)",
  "THEN", "TeleportTo(Actor,Anchor);",
  "PROC", "PROC_DebugSpawn()", "THEN", "TeleportTo(Actor,Anchor);",
  "IF", "NOT FlagSet((FLAG)Debug_Teleport_11111111-1111-1111-1111-111111111111,_,_)",
  "THEN", "TeleportTo(Actor,Anchor);",
  "IF", "TextEvent(\"DebugTeleport\")", "THEN", "TeleportTo(Actor,Anchor);",
  "EXITSECTION", "Cleanup();",
].join("\n");
const lookup = createStoryRuleLookup(source);
assert.equal(lookup(2), undefined);
assert.equal(lookup(7).debugOnly, true);
assert.equal(lookup(7).sourceLine, 4);
assert.equal(lookup(7).actionLine, 7);
assert.equal(lookup(12).debugOnly, false);
assert.equal(lookup(16).debugOnly, true);
assert.equal(lookup(20).debugOnly, false);
assert.equal(lookup(24).debugOnly, true);
assert.equal(lookup(26), undefined);
const regions = createStoryRuleLookup([
  "KBSECTION", "//REGION Debug", "//REGION Teleport helpers", "IF", 'TextEvent("teleport_helper")', "THEN", "TeleportTo(Actor,Anchor);",
  "//END_REGION", "//END_REGION Debug", "IF", 'TextEvent("normal_story")', "THEN", "TeleportTo(Actor,Anchor);", "EXITSECTION",
].join("\n"));
assert.equal(regions(7).debugOnly, true);
assert.equal(regions(13).debugOnly, false);
console.log("Story rule context passed: debug flag/event/procedure, normal rules, negation and section boundaries.");

const relation = { character: { id: "actor" }, anchor: { id: "anchor" } };
const entity = { id: "actor:destination:anchor", storyDestination: { characterContentId: "actor", anchorContentId: "anchor" } };
const debugReview = createScriptedDestinationReview({ scriptedDestinations: [], excludedScriptedDestinations: [relation] });
assert.throws(() => assertScriptedDestinationsReviewed("floor", [entity], debugReview), /Source-rule review required/);
assert.doesNotThrow(() => assertScriptedDestinationsReviewed("floor", [entity], debugReview, [entity.id]));
assert.throws(() => assertScriptedDestinationsReviewed("floor", [entity], debugReview, ["another-actor"]), /Source-rule review required/);
const mixedReview = createScriptedDestinationReview({ scriptedDestinations: [relation], excludedScriptedDestinations: [relation] });
assert.doesNotThrow(() => assertScriptedDestinationsReviewed("floor", [entity], mixedReview));
assert.doesNotThrow(() => assertScriptedDestinationsReviewed("new-floor", [], debugReview));
assert.throws(() => assertScriptedDestinationsReviewed("floor", [entity], createScriptedDestinationReview({})), /Source-rule review required/);
console.log("Existing destination safeguard passed: no unreviewed deletions, exact exclusions and normal-source precedence.");
