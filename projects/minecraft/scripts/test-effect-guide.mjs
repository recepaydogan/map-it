import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { GAME_GUIDE_EFFECTS, GAME_GUIDE_EFFECT_GROUPS } from "../src/game-config.ts";
import { createEffectGuideIndex, effectGuidePotionIds } from "../src/features/knowledge/effect-guide-data.ts";

const readJson = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url)));
const keys = new Set(GAME_GUIDE_EFFECTS.map(effect => effect.key));
assert.equal(GAME_GUIDE_EFFECTS.length, 41);
assert.equal(keys.size, GAME_GUIDE_EFFECTS.length);
for (const effect of GAME_GUIDE_EFFECTS)
  assert(GAME_GUIDE_EFFECT_GROUPS.includes(effect.group), `Unknown effect group: ${effect.key}`);

const current = createEffectGuideIndex("java", "26.3");
const bedrock = createEffectGuideIndex("bedrock", "26.45");
assert.equal(current.size, 40);
assert.equal(bedrock.size, 37);
assert.equal(createEffectGuideIndex("java", "1.18.2").size, 32);
assert.equal(createEffectGuideIndex("java", "1.19.4").size, 33);
assert.equal(createEffectGuideIndex("java", "1.21.10").size, 39);
assert(current.has("minecraft:breath_of_the_nautilus"));
assert(!bedrock.has("minecraft:dolphins_grace"));
assert(bedrock.has("minecraft:fatal_poison"));

const images = await readJson("src/features/knowledge/guide-artwork.json");
for (const effect of GAME_GUIDE_EFFECTS) {
  const image = images[`effect:minecraft:${effect.key}`];
  assert(image?.startsWith("/guide-artwork/effect-"), `Missing effect icon: ${effect.key}`);
  await access(new URL(`../public${image}`, import.meta.url));
}

const javaItems = new Set((await readJson("public/knowledge-data/java/26.3/items.json")).items);
const javaEntities = new Set((await readJson("public/knowledge-data/java/26.3/mechanics.json")).subjects
  .filter(subject => subject.kind === "entity").map(subject => subject.id));
for (const effect of GAME_GUIDE_EFFECTS) {
  if ("sourceItems" in effect) for (const id of effect.sourceItems)
    assert(javaItems.has(`minecraft:${id}`), `Unavailable effect item source: ${effect.key} -> ${id}`);
  if ("sourceEntities" in effect) for (const id of effect.sourceEntities)
    assert(javaEntities.has(`minecraft:${id}`), `Unavailable effect mob source: ${effect.key} -> ${id}`);
}
const potion = current.get("minecraft:speed");
assert.deepEqual(effectGuidePotionIds(potion, javaItems), [
  "minecraft:potion/swiftness", "minecraft:splash_potion/swiftness", "minecraft:lingering_potion/swiftness",
]);

for (const language of ["en", "es", "fr", "hi-IN", "pt-BR", "zh-Hans"]) {
  const locale = await readJson(`src/i18n/locales/${language}.json`);
  const guide = locale.inspector.effectGuide;
  assert(locale.inspector.subjectKinds.effect, `${language}: missing category label`);
  for (const group of GAME_GUIDE_EFFECT_GROUPS) assert(guide.groups[group], `${language}: missing group ${group}`);
  for (const effect of GAME_GUIDE_EFFECTS) {
    const copy = guide.parts[effect.key];
    assert(copy?.behavior && copy.obtain && copy.tip, `${language}: missing effect copy for ${effect.key}`);
  }
}

console.log("Effect guide edition gating, icons, sources, potions and translations passed.");
