import assert from "node:assert/strict";
import { getClimbHeight } from "../src/features/map/map-climb-height.ts";

assert.equal(getClimbHeight("TOOL_Ladder_Metal_4n5H_A_001"), 4.5);
assert.equal(getClimbHeight("TOOL_Goblins_Ladder_9H_A_005"), 9);
assert.equal(getClimbHeight("TOOL_Ladder_Cliff_Granite_15H_A_001"), 15);
assert.equal(getClimbHeight("TOOL_Ladder_Web_10n5H_A_002"), 10.5);
assert.equal(getClimbHeight("TOOL_Ladder_Cursed_Roots_6H_B"), 6);
assert.equal(getClimbHeight("S_DEN_LockdownVines_015"), undefined);
assert.equal(getClimbHeight("TOOL_Goblins_Ladder_4n5_A_000"), undefined);
assert.equal(getClimbHeight("S_TOOL_Lader_ElfsongTavernRoof"), undefined);
assert.equal(getClimbHeight(undefined), undefined);

console.log("Climb height tests passed.");
