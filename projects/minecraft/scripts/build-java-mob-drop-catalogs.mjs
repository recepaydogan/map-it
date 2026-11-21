import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GAME_JAVA_GUIDE_RECIPE_SOURCES } from "../src/game-config.ts";
import { parseMechanicsCatalogArtifact } from "../src/features/knowledge/mechanics-catalog-artifact.ts";
import { readRecipeArchive } from "./recipe-source-archive.mjs";
import { buildJavaMechanicsArtifact } from "./normalize-java-mechanics.mjs";
import translations from "../src/features/knowledge/guide-names.json" with { type: "json" };

const entityPrefixes = ["data/minecraft/loot_table/entities/", "data/minecraft/loot_tables/entities/"];
const requestedVersion = process.argv.indexOf("--version");
const versions = requestedVersion < 0 ? GAME_JAVA_GUIDE_RECIPE_SOURCES
  : GAME_JAVA_GUIDE_RECIPE_SOURCES.filter(source => source.version === process.argv[requestedVersion + 1]);
if (!versions.length) throw new Error("Requested Java guide release is not configured.");

for (const recipeSource of versions) {
  const destination = resolve(`public/knowledge-data/java/${recipeSource.version}/mechanics.json`);
  try { await access(destination); console.log(`SKIP ${recipeSource.version}: mechanics catalog already exists`); continue; }
  catch (error) { if (error.code !== "ENOENT") throw error; }

  const archive = await readRecipeArchive({ ...recipeSource, includePrefixes: entityPrefixes });
  const entityPrefix = entityPrefixes.find(prefix => archive.files.some(file => file.path.startsWith(prefix)));
  if (!entityPrefix) throw new Error(`No entity loot tables in pinned Java ${recipeSource.version} source.`);
  const lootPrefix = entityPrefix.slice(0, -"entities/".length);
  const source = { ...recipeSource, lootPrefix, translations,
    tradePrefix: "data/minecraft/villager_trade/", enchantmentPrefix: "data/minecraft/enchantment/",
    itemTagPrefix: "data/minecraft/tags/item/", enchantmentTagPrefix: "data/minecraft/tags/enchantment/",
    entityTagPrefix: "data/minecraft/tags/entity_type/", templatePoolPrefix: "data/minecraft/worldgen/template_pool/",
    structurePrefix: "data/minecraft/worldgen/structure/", structureSetPrefix: "data/minecraft/worldgen/structure_set/",
    advancementPrefix: "data/minecraft/advancement/", biomePrefix: "data/minecraft/worldgen/biome/" };
  const artifact = buildJavaMechanicsArtifact(archive.files, source);
  if (artifact.mechanics.some(mechanic => mechanic.kind !== "drop") || !artifact.mechanics.length)
    throw new Error(`Unexpected mechanics in Java ${recipeSource.version} mob drop catalog.`);
  parseMechanicsCatalogArtifact(artifact, source);
  await mkdir(resolve(`public/knowledge-data/java/${recipeSource.version}`), { recursive: true });
  await writeFile(destination, JSON.stringify(artifact, null, 2));
  console.log(`PACKAGED ${recipeSource.version}: ${artifact.mechanics.length} mob loot tables`);
}
