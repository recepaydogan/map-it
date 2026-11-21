import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const load = (path) => {
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)(require, module, module.exports);
  return module.exports;
};
const { erMapRewardPresentation } = load("src/features/er-map/er-map-reward-presentation.ts");
const marker = {
  id: "boss:1",
  category: "boss",
  drops: [
    { itemKey: "goods:1", name: "Demi-Human Ashes" },
    { itemKey: "accessory:1", name: "Lord of Blood's Exultation" },
  ],
};
const rewards = {
  [marker.id]: {
    category: "boss",
    rewards: ["spirit-ash", "talisman"],
    rewardItems: { "spirit-ash": ["goods:1"], talisman: ["accessory:1"] },
  },
};
const categories = new Map([
  ["talisman", { label: "Talismans", color: "#a89bd6" }],
  ["spirit-ash", { label: "Spirit Ashes", color: "#a89bd6" }],
]);
const art = new Map([...categories.keys()].map((key) => [key, `/icons/_fallback/${key}.png`]));
const presentationFor = (active, pin = marker) => erMapRewardPresentation(pin, new Set(active), rewards, categories, art);

test("A single reward filter uses full-size category art", () => {
  assert.deepEqual(presentationFor(["talisman"]), {
    iconUrl: "/icons/_fallback/talisman.png", labels: ["Lord of Blood's Exultation"],
  });
  assert.equal(presentationFor(["spirit-ash"]).iconUrl, "/icons/_fallback/spirit-ash.png");
});

test("Boss or multiple matching reward filters retain the boss icon and all hover labels", () => {
  assert.deepEqual(presentationFor(["boss", "talisman"]), {
    iconUrl: undefined, labels: ["Lord of Blood's Exultation"],
  });
  assert.deepEqual(presentationFor(["talisman", "spirit-ash"]), {
    iconUrl: undefined, labels: ["Demi-Human Ashes", "Lord of Blood's Exultation"],
  });
  assert.equal(presentationFor(["talisman", "weapon"]).iconUrl, "/icons/_fallback/talisman.png");
  assert.deepEqual(presentationFor(["boss"]), { iconUrl: undefined, labels: [] });
});

test("Localized item names replace the baked English reward names", () => {
  const itemNames = new Map([["accessory:1", { name: "Jubel des Blutes" }]]);
  assert.deepEqual(
    erMapRewardPresentation(marker, new Set(["talisman"]), rewards, categories, art, itemNames),
    { iconUrl: "/icons/_fallback/talisman.png", labels: ["Jubel des Blutes"] },
  );
});

test("Custom markers and unmatched forced selections preserve their own appearance", () => {
  assert.deepEqual(presentationFor(["talisman"], { ...marker, custom: true }), { labels: [] });
  assert.deepEqual(presentationFor([]), { iconUrl: undefined, labels: [] });
  assert.deepEqual(presentationFor(["weapon"]), { iconUrl: undefined, labels: [] });
});
