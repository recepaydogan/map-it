import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseMechanicsCatalogArtifact } from "../src/features/knowledge/mechanics-catalog-artifact.ts";
import { createTradeGuideIndex, tradeOfferDirection } from "../src/features/knowledge/trade-guide-data.ts";

const guide = async (edition, version) => {
  const artifact = JSON.parse(await readFile(new URL(`../public/knowledge-data/${edition}/${version}/mechanics.json`, import.meta.url)));
  return createTradeGuideIndex(parseMechanicsCatalogArtifact(artifact, { edition, version }));
};

const java = await guide("java", "26.3"), bedrock = await guide("bedrock", "26.45");
assert.equal(java.professions.size, 14);
assert.equal(bedrock.professions.size, 11);
assert.equal(java.professions.get("minecraft:trade/librarian")?.entityId, "minecraft:villager");
assert.equal(bedrock.professions.get("minecraft:trade/librarian")?.entityId, "minecraft:villager_v2");
assert.equal(java.offers.size, 391);
assert.equal(bedrock.offers.size, 217);
assert(!java.professions.has("minecraft:trade/smith"), "The shared smith pool is not a separate profession.");
const shared = [...java.offers.values()].filter(offer => offer.subject.id === "minecraft:trade/smith");
assert.equal(shared.length, 3);
for (const offer of shared) {
  assert.deepEqual(java.offerProfessions.get(offer.id), ["minecraft:trade/armorer",
    "minecraft:trade/toolsmith", "minecraft:trade/weaponsmith"]);
  for (const profession of java.offerProfessions.get(offer.id)) {
    assert(java.professions.get(profession)?.offers.includes(offer), `${profession} is missing a shared smith trade.`);
  }
}
assert.equal(java.professions.get("minecraft:trade/wandering_trader")?.offers.length, 100);
assert.equal(bedrock.professions.get("minecraft:trade/wandering_trader")?.offers.length, 97);
for (const index of [java, bedrock]) for (const offer of index.offers.values()) {
  assert(offer.inputs.length && offer.outputs.length, `Incomplete trade ${offer.id}`);
  assert([...offer.inputs, ...offer.outputs].every(item => item.kind === "item"), `Non-item trade ${offer.id}`);
  assert(["earn", "spend"].includes(tradeOfferDirection(offer)));
}
console.log("Trade guide coverage and shared profession checks passed.");
