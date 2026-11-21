import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GAME_JAVA_GUIDE_RECIPE_SOURCES } from "../src/game-config.ts";
import { parseMechanicsCatalogArtifact } from "../src/features/knowledge/mechanics-catalog-artifact.ts";
import { readRecipeArchive } from "./recipe-source-archive.mjs";
import { buildJavaMechanicsArtifact } from "./normalize-java-mechanics.mjs";
import translations from "../src/features/knowledge/guide-names.json" with { type: "json" };

const versionIndex = process.argv.indexOf("--version");
const version = versionIndex < 0 ? "26.2" : process.argv[versionIndex + 1];
const recipeSource = GAME_JAVA_GUIDE_RECIPE_SOURCES.find(source => source.version === version);
if (!recipeSource) throw new Error(`Pinned Java source is not configured for ${version}.`);
const source = { ...recipeSource, lootPrefix: "data/minecraft/loot_table/", tradePrefix: "data/minecraft/villager_trade/",
  enchantmentPrefix: "data/minecraft/enchantment/", itemTagPrefix: "data/minecraft/tags/item/",
  enchantmentTagPrefix: "data/minecraft/tags/enchantment/", entityTagPrefix: "data/minecraft/tags/entity_type/",
  templatePoolPrefix: "data/minecraft/worldgen/template_pool/",
  structurePrefix: "data/minecraft/worldgen/structure/", structureSetPrefix: "data/minecraft/worldgen/structure_set/",
  advancementPrefix: "data/minecraft/advancement/", biomePrefix: "data/minecraft/worldgen/biome/", translations };
source.includePrefixes = [source.lootPrefix, source.tradePrefix, source.enchantmentPrefix, source.itemTagPrefix,
  source.enchantmentTagPrefix, source.entityTagPrefix, source.templatePoolPrefix, source.structurePrefix, source.structureSetPrefix,
  source.advancementPrefix, source.biomePrefix];
const archive = await readRecipeArchive(source);
const artifact = buildJavaMechanicsArtifact(archive.files, source);
parseMechanicsCatalogArtifact(artifact, source);
const output = resolve("node_modules/.cache/mechanics-catalogs"); await mkdir(output, { recursive: true });
await writeFile(resolve(output, `${source.edition}-${source.version}.json`), JSON.stringify(artifact, null, 2));
if (process.argv.includes("--package")) {
  const destination = resolve(`public/knowledge-data/${source.edition}/${source.version}`); await mkdir(destination, { recursive: true });
  await writeFile(resolve(destination, "mechanics.json"), JSON.stringify(artifact, null, 2));
}
console.log(JSON.stringify(artifact.report));
