import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { GAME_GUIDE_BREWING, GAME_GUIDE_CLIENT_SOURCE } from "../src/game-config.ts";
import { buildRecipeIndex } from "../src/features/knowledge/recipe-index.ts";
import { parseRecipeCatalogArtifact } from "../src/features/knowledge/recipe-catalog-artifact.ts";

const source = GAME_GUIDE_CLIENT_SOURCE;
const cache = `node_modules/.cache/guide-client-${source.version}.jar`;
await mkdir("node_modules/.cache", { recursive: true });
let bytes;
try { bytes = await readFile(cache); } catch (error) {
  if (error.code !== "ENOENT") throw error;
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`Client download failed: ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(cache, bytes);
}
if (createHash("sha1").update(bytes).digest("hex") !== source.revision) throw new Error("Client hash mismatch");

const prefix = `data/${source.namespace}/recipe/brewing/`;
const files = unzipSync(bytes, { filter: file => file.name.startsWith(prefix) && file.name.endsWith(".json") });
const names = Object.keys(files).sort();
if (names.length < 200) throw new Error("Incomplete data-driven brewing catalog");
const resourceId = /^minecraft:[a-z0-9_./-]+$/;
const potionId = (container, potion) => {
  if (!GAME_GUIDE_BREWING.containers.some(value => container === `${source.namespace}:${value}`)
    || !resourceId.test(potion)) throw new Error("Unexpected brewing potion identity");
  return `${container}/${potion.slice(`${source.namespace}:`.length)}`;
};
const context = { edition: "java", version: source.version, revision: source.revision };
const recipes = names.map(path => {
  const bytes = files[path], value = JSON.parse(strFromU8(bytes));
  const input = value.input, output = value.output, reagent = value.reagent;
  if (value.type !== `${source.namespace}:brewing` || !resourceId.test(reagent?.item)
    || !resourceId.test(input?.potion_contents?.potions)
    || !resourceId.test(output?.components?.[`${source.namespace}:potion_contents`]?.potion))
    throw new Error(`Unexpected brewing recipe shape: ${path}`);
  const inputId = potionId(input.item, input.potion_contents.potions);
  const outputId = potionId(output.id, output.components[`${source.namespace}:potion_contents`].potion);
  return { id: `${source.namespace}:${path.slice(`data/${source.namespace}/recipe/`.length, -5)}`,
    method: "brewing", sourceType: value.type,
    source: { ...context, path, sha256: createHash("sha256").update(bytes).digest("hex"),
      url: `${source.url}#${encodeURIComponent(path)}` },
    stations: [GAME_GUIDE_BREWING.station], stationTags: [],
    ingredients: [inputId, reagent.item].map(id => ({ choices: [{ kind: "item", id }], count: 1 })),
    outputs: [{ id: outputId, count: 1 }], sourceMetadata: {} };
});
const artifact = { schemaVersion: 2, source: context, recipes,
  index: buildRecipeIndex(recipes, () => ({ items: [], missing: [], cycles: [], complete: true })) };
parseRecipeCatalogArtifact(artifact, context);
const destination = `public/knowledge-data/java/${source.version}`;
await mkdir(destination, { recursive: true });
await writeFile(`${destination}/brewing.json`, JSON.stringify(artifact, null, 2));
console.log(`Java ${source.version}: ${recipes.length} data-driven brewing recipes verified.`);
