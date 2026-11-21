import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const source = read("data/site-research/foreverdb-profession-routes.json");
const catalog = read("public/data/professions/catalog.json");
const payload = read("public/data/professions/leveling.json");

test("published crafting routes reproduce the ForeverDB source and match Forever recipes", () => {
  assert.equal(payload.version, 4);
  assert.deepEqual(Object.keys(payload.guides).sort(), Object.keys(source.guides).sort());
  for (const [id, route] of Object.entries(source.guides)) {
    const guide = payload.guides[id];
    const profession = catalog.professions.find((entry) => entry.id === id);
    assert.equal(guide.kind, "crafting", id);
    assert.equal(guide.sourceUrl, route.sourceUrl, id);
    assert.equal(guide.sourceBuild, route.sourceBuild, id);
    assert.equal(guide.routeFaction, "Alliance", id);
    assert.equal(guide.betaCap, 225, id);
    assert.equal(guide.maxSkill, 300, id);
    assert.deepEqual(guide.steps, route.steps.map((step) => ({ ...step, approximate: true })), id);
    assert.deepEqual(guide.hordeDifferences, route.hordeDifferences.map((step) => ({ ...step, approximate: true })), id);
    assert.equal(guide.steps[0].from, 1, id);
    assert.equal(guide.steps.at(-1).to, 300, id);
    const details = read(`public/data/professions/details/${id}.json`);
    for (const [index, step] of guide.steps.entries()) {
      if (index) assert.equal(guide.steps[index - 1].to, step.from, id);
      assert.ok(profession.recipes.some((recipe) => recipe.name === step.recipeName), `${id}: ${step.recipeName}`);
      assert.ok(details.recipes.some((recipe) => recipe.n === step.recipeName && Number.isInteger(recipe.req) && recipe.req <= step.from), `${id}: ${step.recipeName} requirement`);
    }
  }
});

test("Classic healing potions are absent from the Alchemy route", () => {
  assert.deepEqual(payload.guides.alchemy.steps[0], {
    from: 1, to: 13, recipeName: "Minor Arcane Elixir", crafts: 13, approximate: true,
  });
  assert.ok(payload.guides.alchemy.steps.every((step) => !step.recipeName.includes("Healing Potion")));
  assert.deepEqual(payload.guides.firstaid.steps[0], {
    from: 1, to: 41, recipeName: "Linen Bandage", crafts: 42, approximate: true,
  });
  assert.ok(catalog.professions.find((entry) => entry.id === "firstaid").recipes.some((recipe) => recipe.name === "Minor Healing Potion"));
});

test("gathering professions have no fabricated ForeverDB route", () => {
  for (const id of ["herbalism", "mining", "skinning", "fishing"]) {
    assert.equal(payload.guides[id], undefined);
  }
});
