import { mkdir, writeFile } from "node:fs/promises";
import { GAME_GUIDE_BREWING as config, GAME_RECIPE_SOURCES } from "../src/game-config.ts";
import { buildRecipeIndex } from "../src/features/knowledge/recipe-index.ts";
import { parseRecipeCatalogArtifact } from "../src/features/knowledge/recipe-catalog-artifact.ts";
import { readRecipeArchive } from "./recipe-source-archive.mjs";
import { normalizeBrewingId } from "./normalize-brewing-id.mjs";

const source = GAME_RECIPE_SOURCES.find(entry => entry.edition === "bedrock");
if (!source) throw new Error("Pinned Bedrock source is not configured.");
const archive = await readRecipeArchive(source), recipes = [];
const bodies = archive.files.map(file => ({ file, body: Object.values(JSON.parse(file.text))
  .find(value => value && typeof value === "object" && "reagent" in value) })).filter(entry => entry.body);
const types = [...new Set(bodies.flatMap(({ body }) => [body.input, body.output])
  .filter(id => id.startsWith(config.legacyPotionPrefix)).map(id => id.slice(config.legacyPotionPrefix.length)))];
const convert = id => id.replace(config.legacyPotionPrefix, config.potionPrefix);
const makeRecipe = (id, input, reagent, output, provenance) => ({ id, method: "brewing", sourceType: "brewing",
  source: provenance, stations: [config.station], stationTags: [],
  ingredients: [normalizeBrewingId(input, config.variantAliases), reagent]
    .map(id => ({ choices: [{ kind: "item", id }], count: 1 })),
  outputs: [{ id: normalizeBrewingId(output, config.variantAliases), count: 1 }], sourceMetadata: {} });
for (const { file, body } of bodies) {
  const provenance = { edition: source.edition, version: source.version, revision: source.revision,
    path: file.path, sha256: file.sha256, url: source.sourceUrl ? `${source.sourceUrl}#${encodeURIComponent(file.path)}`
      : `https://github.com/${source.repository}/blob/${source.revision}/${file.path}` };
  const input = convert(body.input), output = convert(body.output);
  if (input.startsWith(config.potionPrefix)) {
    for (const container of config.containers) recipes.push(makeRecipe(`${body.description.identifier}/${container}`,
      input.replace(config.potionPrefix, `${config.namespace}:${container}/`), body.reagent,
      output.replace(config.potionPrefix, `${config.namespace}:${container}/`), provenance));
  } else {
    for (const type of types) recipes.push(makeRecipe(`${body.description.identifier}/${type}`, `${input}/${type}`, body.reagent, `${output}/${type}`, provenance));
  }
}
const identity = { edition: source.edition, version: source.version, revision: source.revision };
const artifact = { schemaVersion: 2, source: identity, recipes,
  index: buildRecipeIndex(recipes, () => ({ items: [], missing: [], cycles: [], complete: true })) };
parseRecipeCatalogArtifact(artifact, identity);
const destination = `public/knowledge-data/${source.edition}/${source.version}`; await mkdir(destination, { recursive: true });
await writeFile(`${destination}/brewing.json`, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify({ edition: source.edition, version: source.version, recipes: recipes.length, installedLayers: archive.layers?.length ?? 0 }));
