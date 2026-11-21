import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { GAME_GUIDE_BREWING as config, GAME_RECIPE_SOURCES } from "../src/game-config.ts";
import { readRecipeArchive } from "./recipe-source-archive.mjs";
import { buildRecipeIndex } from "../src/features/knowledge/recipe-index.ts";
import { parseRecipeCatalogArtifact } from "../src/features/knowledge/recipe-catalog-artifact.ts";
import { normalizeBrewingId } from "./normalize-brewing-id.mjs";

const java = config.java, cache = `node_modules/.cache/guide-client-${java.version}.jar`;
await mkdir("node_modules/.cache", { recursive: true });
let bytes;
try { bytes = await readFile(cache); } catch (error) {
  if (error.code !== "ENOENT") throw error;
  const response = await fetch(java.url); if (!response.ok) throw new Error(`Client download failed: ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer()); await writeFile(cache, bytes);
}
if (createHash("sha1").update(bytes).digest("hex") !== java.revision) throw new Error("Client hash mismatch");
const disassembly = execFileSync("javap", ["-classpath", cache, "-c", "-p", java.className], { encoding: "utf8" });
const code = disassembly.split("public static void addVanillaMixes")[1]?.split("static {};")[0];
if (!code) throw new Error("Brewing method is missing");
const mixes = [], containers = []; let fields = [];
for (const line of code.split("\n")) {
  const field = line.match(/Field .*\/(Items|Potions)\.([A-Z_]+):/);
  if (field) fields.push(field[2].toLowerCase());
  const call = line.match(/Builder\.(addContainerRecipe|addContainer|addStartMix|addMix):/);
  if (!call) continue;
  if (call[1] === "addMix") { if (fields.length !== 3) throw new Error("Unexpected brewing operands"); mixes.push([...fields]); }
  if (call[1] === "addStartMix") {
    if (fields.length !== 2) throw new Error("Unexpected start-mix operands");
    mixes.push([java.water, fields[0], java.mundane], [java.awkward, fields[0], fields[1]]);
  }
  if (call[1] === "addContainerRecipe") containers.push([...fields]);
  fields = [];
}
if (mixes.length < 50 || containers.length !== 2) throw new Error("Incomplete brewing extraction");
const potionId = (container, type) => `${config.namespace}:${container}/${type}`;
const makeRecipe = (id, input, reagent, output, provenance) => ({ id, method: "brewing", sourceType: "brewing",
  source: provenance, stations: [config.station], stationTags: [],
  ingredients: [normalizeBrewingId(input, config.variantAliases), reagent]
    .map(id => ({ choices: [{ kind: "item", id }], count: 1 })),
  outputs: [{ id: normalizeBrewingId(output, config.variantAliases), count: 1 }], sourceMetadata: {} });
const persist = async (source, recipes) => {
  const artifact = { schemaVersion: 2, source, recipes, index: buildRecipeIndex(recipes, () => ({ items: [], missing: [], cycles: [], complete: true })) };
  parseRecipeCatalogArtifact(artifact, source);
  const path = `public/knowledge-data/${source.edition}/${source.version}`; await mkdir(path, { recursive: true });
  await writeFile(`${path}/brewing.json`, JSON.stringify(artifact, null, 2));
  console.log(`${source.edition}: ${recipes.length} brewing recipes`);
};
const source = { edition: GAME_RECIPE_SOURCES[0].edition, version: java.version, revision: java.revision };
const provenance = { ...source, path: java.className, sha256: createHash("sha256").update(bytes).digest("hex"), url: java.url };
const recipes = [];
for (const container of config.containers) for (const [input, reagent, output] of mixes)
  recipes.push(makeRecipe(`${config.namespace}:brew/${container}/${input}/${reagent}/${output}`, potionId(container, input), `${config.namespace}:${reagent}`, potionId(container, output), provenance));
const types = [...new Set(mixes.flatMap(([input, , output]) => [input, output]))];
for (const [input, reagent, output] of containers) for (const type of types)
  recipes.push(makeRecipe(`${config.namespace}:brew/${input}/${type}/${reagent}`, potionId(input, type), `${config.namespace}:${reagent}`, potionId(output, type), provenance));
await persist(source, recipes);
const bedrock = GAME_RECIPE_SOURCES.find(entry => entry.dialect === "wrapped");
const archive = await readRecipeArchive(bedrock), brews = [];
const bodies = archive.files.map(file => ({ file, body: Object.values(JSON.parse(file.text)).find(value => value && typeof value === "object" && "reagent" in value) })).filter(entry => entry.body);
const bedrockTypes = [...new Set(bodies.flatMap(({ body }) => [body.input, body.output]).filter(id => id.startsWith(config.legacyPotionPrefix)).map(id => id.slice(config.legacyPotionPrefix.length)))];
const convert = id => id.replace(config.legacyPotionPrefix, config.potionPrefix);
for (const { file, body } of bodies) {
  const provenance = { edition: bedrock.edition, version: bedrock.version, revision: bedrock.revision,
    path: file.path, sha256: file.sha256, url: bedrock.sourceUrl ? `${bedrock.sourceUrl}#${encodeURIComponent(file.path)}`
      : `https://github.com/${bedrock.repository}/blob/${bedrock.revision}/${file.path}` };
  const input = convert(body.input), output = convert(body.output);
  if (input.startsWith(config.potionPrefix)) {
    for (const container of config.containers) brews.push(makeRecipe(`${body.description.identifier}/${container}`,
      input.replace(config.potionPrefix, `${config.namespace}:${container}/`), body.reagent,
      output.replace(config.potionPrefix, `${config.namespace}:${container}/`), provenance));
  } else {
    for (const type of bedrockTypes) brews.push(makeRecipe(`${body.description.identifier}/${type}`, `${input}/${type}`, body.reagent, `${output}/${type}`, provenance));
  }
}
await persist({ edition: bedrock.edition, version: bedrock.version, revision: bedrock.revision }, brews);
