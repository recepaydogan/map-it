import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GAME_GUIDE_ENTITY_OVERVIEWS, GAME_GUIDE_ITEM_ENTITY_ALIASES, GAME_GUIDE_LEGACY_BEDROCK_ENTITIES,
  GAME_GUIDE_NON_MOB_ENTITIES,
  GAME_KNOWLEDGE_ENTITY_ALIASES } from "../src/game-config.ts";

const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const guideIds = Object.keys(GAME_GUIDE_ENTITY_OVERVIEWS);
const canonical = id => GAME_KNOWLEDGE_ENTITY_ALIASES[id] ?? id;
assert.equal(guideIds.length, 90, "The current Java mob guide should cover all 90 mobs.");

for (const [edition, version] of [["java", "26.3"], ["bedrock", "26.45"]]) {
  const catalog = await readJson(`public/knowledge-data/${edition}/${version}/mechanics.json`);
  const mobs = catalog.subjects.filter(subject => subject.kind === "entity"
    && !GAME_GUIDE_NON_MOB_ENTITIES.has(subject.id) && !GAME_GUIDE_ITEM_ENTITY_ALIASES[subject.id]
    && (edition !== "bedrock" || !GAME_GUIDE_LEGACY_BEDROCK_ENTITIES.has(subject.id)));
  const missing = mobs.map(subject => subject.id).filter(id => !Object.hasOwn(GAME_GUIDE_ENTITY_OVERVIEWS, canonical(id)));
  assert.deepEqual(missing, [], `${edition} has a visible mob without guide content.`);
  const identities = mobs.map(subject => canonical(subject.id));
  assert.equal(new Set(identities).size, edition === "java" ? 90 : 88,
    `${edition} should show each available mob identity once.`);
  if (edition === "java") {
    const feeding = catalog.mechanics.filter(mechanic => mechanic.kind === "feeding");
    assert.equal(feeding.length, 29, "Java mob food tags should be included in the packaged catalog.");
    assert.ok(feeding.every(mechanic => mechanic.requirements.length > 0));
    const beeFood = feeding.find(mechanic => mechanic.subject.id === "minecraft:bee");
    assert.equal(beeFood?.requirements.length, 29);
    assert.equal(beeFood.provenance.path, "data/minecraft/tags/item/bee_food.json");
  }
}

for (const locale of ["en", "es", "fr", "hi-IN", "pt-BR", "zh-Hans"]) {
  const details = (await readJson(`src/i18n/locales/${locale}.json`)).inspector.mobDetails;
  for (const group of ["summaries", "habitats", "interactions"]) {
    assert.deepEqual(Object.keys(details[group]).sort(), guideIds.map(id => id.slice("minecraft:".length)).sort(),
      `${locale}:${group} is missing a mob.`);
  }
}

console.log("Mob guide coverage passed for 90 Java and 88 Bedrock mobs; 29 Java food tags are packaged.");
