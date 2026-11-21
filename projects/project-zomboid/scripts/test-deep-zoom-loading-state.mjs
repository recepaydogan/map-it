import assert from "node:assert/strict";
import { areWantedDeepZoomLayersReady } from "../src/features/map/deep-zoom-loading-state.ts";

const wanted = new Set(["base", "offscreen-overlay"]);
const layers = new Map([
  ["base", { status: "ready" }],
  ["offscreen-overlay", { status: "ready" }],
]);

assert.equal(areWantedDeepZoomLayersReady(false, wanted, layers), false);
assert.equal(areWantedDeepZoomLayersReady(true, wanted, layers), true);
layers.set("offscreen-overlay", { status: "loading" });
assert.equal(areWantedDeepZoomLayersReady(true, wanted, layers), false);
wanted.delete("offscreen-overlay");
assert.equal(areWantedDeepZoomLayersReady(true, wanted, layers), true);

console.log("Deep zoom loading-state tests passed.");
