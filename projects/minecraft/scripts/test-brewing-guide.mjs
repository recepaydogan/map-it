import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GAME_GUIDE_BREWING, GAME_GUIDE_CLIENT_SOURCE, GAME_GUIDE_SOURCES } from "../src/game-config.ts";
import { createBrewingPathResolver } from "../src/features/knowledge/brewing-path.ts";
import { parseRecipeCatalogArtifact } from "../src/features/knowledge/recipe-catalog-artifact.ts";
import { GUIDE_KINDS } from "../src/features/knowledge/game-guide-categories.ts";

assert(GUIDE_KINDS.includes("brewing"));
assert.equal(GAME_GUIDE_SOURCES.find(source => source.edition === "java"
  && source.version === GAME_GUIDE_CLIENT_SOURCE.version)?.brewingRevision, GAME_GUIDE_CLIENT_SOURCE.revision);
const catalog = parseRecipeCatalogArtifact(JSON.parse(await readFile(
  `public/knowledge-data/java/${GAME_GUIDE_CLIENT_SOURCE.version}/brewing.json`, "utf8")), {
  edition: "java", version: GAME_GUIDE_CLIENT_SOURCE.version, revision: GAME_GUIDE_CLIENT_SOURCE.revision,
});
assert.equal(catalog.recipes.length, 279);
const path = createBrewingPathResolver(catalog.recipes, `${GAME_GUIDE_BREWING.bottle}/water`);
assert.deepEqual(path("minecraft:potion/long_swiftness")?.map(recipe => recipe.outputs[0].id), [
  "minecraft:potion/awkward", "minecraft:potion/swiftness", "minecraft:potion/long_swiftness",
]);
assert.equal(path("minecraft:potion/luck"), null);
const bedrock = GAME_GUIDE_SOURCES.find(source => source.edition === "bedrock" && source.version === "26.45");
assert(bedrock);
const bedrockCatalog = parseRecipeCatalogArtifact(JSON.parse(await readFile(
  `public/knowledge-data/bedrock/${bedrock.version}/brewing.json`, "utf8")), {
  edition: bedrock.edition, version: bedrock.version, revision: bedrock.brewingRevision,
});
const bedrockPath = createBrewingPathResolver(bedrockCatalog.recipes, `${GAME_GUIDE_BREWING.bottle}/water`);
assert.deepEqual(bedrockPath("minecraft:potion/long_swiftness")?.map(recipe => recipe.outputs[0].id), [
  "minecraft:potion/awkward", "minecraft:potion/swiftness", "minecraft:potion/long_swiftness",
]);
console.log("Java 26.3 and Bedrock 26.45 brewing catalog and route checks passed.");
