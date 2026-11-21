import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GAME_GUIDE_TUTORIALS } from "../src/game-config.ts";

const load = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const items = new Set((await load("../public/knowledge-data/java/26.3/items.json")).items);
const subjects = new Set((await load("../public/knowledge-data/java/26.3/mechanics.json")).subjects
  .map(subject => `${subject.kind}|${subject.id}`));
const bedrockRecipes = await load("../public/knowledge-data/bedrock/26.45/recipes.json");
const bedrockBrewing = await load("../public/knowledge-data/bedrock/26.45/brewing.json");
const bedrockMechanics = await load("../public/knowledge-data/bedrock/26.45/mechanics.json");
const bedrockItems = new Set([
  ...Object.keys(bedrockRecipes.index.produces), ...Object.keys(bedrockRecipes.index.usesItem),
  ...Object.keys(bedrockBrewing.index.produces), ...Object.keys(bedrockBrewing.index.usesItem),
  ...bedrockMechanics.subjects.filter(subject => subject.kind === "item" || subject.kind === "block")
    .map(subject => subject.id),
]);
const bedrockSubjects = new Set(bedrockMechanics.subjects.map(subject => `${subject.kind}|${subject.id}`));
const english = await load("../src/i18n/locales/en.json");
const translations = english.inspector.tutorialGuide.topics;
assert.equal(GAME_GUIDE_TUTORIALS.length, 9);
assert.equal(new Set(GAME_GUIDE_TUTORIALS.map(topic => topic.id)).size, GAME_GUIDE_TUTORIALS.length);
for (const topic of GAME_GUIDE_TUTORIALS) {
  assert(items.has(topic.iconItemId), `Missing tutorial icon item: ${topic.iconItemId}`);
  assert(translations[topic.id]?.title && translations[topic.id]?.summary, `Missing title or summary: ${topic.id}`);
  assert.equal(topic.steps.length, 4, `Incomplete route: ${topic.id}`);
  for (const step of topic.steps) {
    assert(translations[topic.id].steps[step.id]?.title
      && translations[topic.id].steps[step.id]?.body, `Missing copy: ${topic.id}/${step.id}`);
    assert(step.links.length > 0, `Step has no related guide pages: ${topic.id}/${step.id}`);
    assert.equal(new Set(step.links).size, step.links.length, `Duplicate link: ${topic.id}/${step.id}`);
    let javaLinks = 0, bedrockLinks = 0;
    for (const link of step.links) {
      const [kind, id] = link.split("|");
      assert(["item", "entity", "poi", "trade", "enchantment"].includes(kind) && id,
        `Invalid link: ${link}`);
      const java = kind === "item" ? items.has(id) : subjects.has(link);
      const bedrock = kind === "item" ? bedrockItems.has(id) : bedrockSubjects.has(link);
      assert(java || bedrock, `Unavailable guide link in both editions: ${link}`);
      if (java) javaLinks++;
      if (bedrock) bedrockLinks++;
    }
    assert(javaLinks > 0 && bedrockLinks > 0, `Step has no linked page in an edition: ${topic.id}/${step.id}`);
  }
}
console.log("Tutorial routes, copy, and Java/Bedrock guide links passed.");
