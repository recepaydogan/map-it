import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GAME_RECIPE_SOURCES } from "../src/game-config.ts";
import { parseMechanicsCatalogArtifact } from "../src/features/knowledge/mechanics-catalog-artifact.ts";
import { buildBedrockMechanicsArtifact } from "./normalize-bedrock-mechanics.mjs";
import { readPinnedJsonSource } from "./pinned-json-source.mjs";
import { readRecipeArchive } from "./recipe-source-archive.mjs";

const recipeSource = GAME_RECIPE_SOURCES.find(source => source.edition === "bedrock");
if (!recipeSource) throw new Error("Pinned Bedrock source is not configured.");
const source = { ...recipeSource, lootPrefix: "behavior_pack/loot_tables/", tradePrefix: "behavior_pack/trading/economy_trades/",
  entityPrefix: "behavior_pack/entities/", itemPrefix: "behavior_pack/items/", itemCatalogPrefix: "behavior_pack/item_catalog/" };
const prefixes = [source.lootPrefix, source.tradePrefix, source.entityPrefix, source.itemPrefix, source.itemCatalogPrefix];
const extracted = source.fetchMode === "installed" ? await readRecipeArchive({ ...source, includePrefixes: prefixes }) : null;
const files = extracted?.files ?? await readPinnedJsonSource(source, prefixes, "Mechanics");
const artifact = buildBedrockMechanicsArtifact(files, { ...source, installedLayers: extracted?.layers });
parseMechanicsCatalogArtifact(artifact, source);
const output = resolve("node_modules/.cache/mechanics-catalogs"); await mkdir(output, { recursive: true });
await writeFile(resolve(output, `${source.edition}-${source.version}.json`), JSON.stringify(artifact, null, 2));
if (process.argv.includes("--package")) {
  const destination = resolve(`public/knowledge-data/${source.edition}/${source.version}`); await mkdir(destination, { recursive: true });
  await writeFile(resolve(destination, "mechanics.json"), JSON.stringify(artifact, null, 2));
}
console.log(JSON.stringify(artifact.report));
