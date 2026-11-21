import assert from "node:assert/strict";
import test from "node:test";
import { isCharacterQuestObjectiveComplete } from "./character-quest-progress.ts";

test("completion trusts explicit game state and supports classic text-only objectives", () => {
  assert.equal(isCharacterQuestObjectiveComplete({ done: true, have: null, need: null }), true);
  assert.equal(isCharacterQuestObjectiveComplete({ done: false, have: 4, need: 4 }), false);
});
test("only known positive requirements can confirm completion without a state flag", () => {
  assert.equal(isCharacterQuestObjectiveComplete({ done: null, have: 4, need: 4 }), true);
  assert.equal(isCharacterQuestObjectiveComplete({ done: null, have: 3, need: 4 }), false);
  assert.equal(isCharacterQuestObjectiveComplete({ done: null, have: null, need: 4 }), false);
  assert.equal(isCharacterQuestObjectiveComplete({ done: null, have: 0, need: 0 }), false);
});
