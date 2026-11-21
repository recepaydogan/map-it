import { mkdir, readFile, writeFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import sharp from "sharp";
import { renderGuideBlocks } from "./render-guide-models.mjs";
import { renderGuidePotions } from "./render-guide-potions.mjs";
import { GAME_GUIDE_ARTWORK_SOURCE, GAME_GUIDE_BLOCK_ARTWORK_SOURCE, GAME_GUIDE_BREWING, GAME_GUIDE_CLIENT_SOURCE,
  GAME_GUIDE_EDITION_ARTWORK, GAME_GUIDE_EFFECTS, GAME_GUIDE_ITEM_ALIASES } from "../src/game-config.ts";
import { createHash } from "node:crypto";

const source = GAME_GUIDE_ARTWORK_SOURCE;
const client = GAME_GUIDE_CLIENT_SOURCE;
const [renderResponse, blockResponse] = await Promise.all([fetch(source.url), fetch(GAME_GUIDE_BLOCK_ARTWORK_SOURCE.url)]);
if (!renderResponse.ok) throw new Error(`Inventory artwork download failed: ${renderResponse.status}`);
if (!blockResponse.ok) throw new Error(`Block artwork download failed: ${blockResponse.status}`);
const nativeRenders = unzipSync(new Uint8Array(await renderResponse.arrayBuffer()));
const blockTextures = await blockResponse.json();
const images = {};
await mkdir("public/guide-artwork", { recursive: true });
const writeArtwork = async (name, bytes) => {
  for (let attempt = 0; ; attempt++) {
    try { await writeFile(`public/guide-artwork/${name}.png`, bytes); return; }
    catch (error) {
      if (!["EBUSY", "UNKNOWN"].includes(error.code) || attempt === 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
};
for (const entry of blockTextures) {
  if (!/^[a-z0-9_]+$/.test(entry.name) || !entry.texture?.startsWith("data:image/png;base64,")) continue;
  await writeArtwork(entry.name, Buffer.from(entry.texture.split(",")[1], "base64"));
  images[`${GAME_GUIDE_BLOCK_ARTWORK_SOURCE.namespace}:${entry.name}`] = `/guide-artwork/${entry.name}.png`;
}
const clientCache = `node_modules/.cache/guide-client-${client.version}.jar`;
let clientBytes;
try { clientBytes = await readFile(clientCache); }
catch (error) {
  if (error.code !== "ENOENT") throw error;
  const response = await fetch(client.url); if (!response.ok) throw new Error(`Client download failed: ${response.status}`);
  clientBytes = Buffer.from(await response.arrayBuffer()); await writeFile(clientCache, clientBytes);
}
if (createHash("sha1").update(clientBytes).digest("hex") !== client.revision) throw new Error("Guide client hash mismatch");
const zip = unzipSync(new Uint8Array(clientBytes),
  { filter: entry => entry.name.endsWith(`/textures/${GAME_GUIDE_BREWING.guiTexture}.png`)
    || /\/textures\/(?:item|block|mob_effect)\/[^/]+\.png$/.test(entry.name) || /\/models\/(?:item|block)\/.+\.json$/.test(entry.name)
    || /\/blockstates\/[^/]+\.json$/.test(entry.name) || /\/items\/[^/]+\.json$/.test(entry.name)
    || entry.name.endsWith("/lang/en_us.json") });
await sharp(zip[`assets/${source.namespace}/textures/${GAME_GUIDE_BREWING.guiTexture}.png`])
  .extract({ left: 0, top: 0, width: 176, height: 82 }).png().toFile(`public${GAME_GUIDE_BREWING.guiImage}`);
const prefix = Object.keys(nativeRenders).find(path => path.endsWith(`/${source.directory}/`));
if (!prefix) throw new Error(`Artwork archive does not contain ${source.directory}`);
const packagedItems = Object.keys(zip).map(path => path.match(/\/items\/([^/]+)\.json$/)?.[1]).filter(Boolean).sort();
const packagedItemSet = new Set(packagedItems);
const blockNames = blockTextures.map(entry => entry.name).filter(name => !packagedItemSet.has(name));
const renderedBlocks = await renderGuideBlocks(zip, source.namespace, blockNames, async (name, bytes) => {
  await writeArtwork(name, bytes);
  images[`${source.namespace}:${name}`] = `/guide-artwork/${name}.png`;
});
const renderNames = new Set();
for (const [path, bytes] of Object.entries(nativeRenders)) {
  if (!path.startsWith(prefix) || !path.endsWith(".png")) continue;
  const file = path.slice(prefix.length);
  if (!/^[A-Z0-9_]+\.png$/.test(file)) throw new Error(`Unexpected inventory render name: ${file}`);
  const name = file.slice(0, -4).toLowerCase();
  if (renderNames.has(name)) throw new Error(`Duplicate inventory render: ${name}`);
  renderNames.add(name);
  const output = await sharp(bytes).resize(64, 64, { kernel: "nearest" }).png().toBuffer();
  await writeArtwork(name, output);
  images[`${source.namespace}:${name}`] = `/guide-artwork/${name}.png`;
}
const missing = packagedItems.filter(name => !renderNames.has(name));
const unknown = [...renderNames].filter(name => !packagedItems.includes(name)).sort();
if (missing.length || unknown.length) throw new Error(`Inventory render mismatch. Missing: ${missing.join(", ") || "none"}. Unknown: ${unknown.join(", ") || "none"}.`);
for (const entry of GAME_GUIDE_EDITION_ARTWORK) {
  const response = await fetch(`https://raw.githubusercontent.com/${entry.repository}/${entry.revision}/${entry.path}`);
  if (!response.ok) throw new Error(`Edition artwork download failed for ${entry.id}: ${response.status}`);
  const name = entry.id.slice(entry.id.indexOf(":") + 1);
  const output = await sharp(await response.arrayBuffer()).resize(64, 64, { kernel: "nearest" }).png().toBuffer();
  await writeArtwork(name, output);
  images[entry.id] = `/guide-artwork/${name}.png`;
}
for (const effect of GAME_GUIDE_EFFECTS) {
  const key = effect.key === "fatal_poison" ? "poison" : effect.key;
  const file = `effect-${key}.png`;
  if (effect.key === "fatal_poison") {
    images[`effect:${source.namespace}:${effect.key}`] = `/guide-artwork/${file}`;
    continue;
  }
  const bytes = zip[`assets/${source.namespace}/textures/mob_effect/${key}.png`];
  if (!bytes) throw new Error(`Missing effect icon: ${key}`);
  await writeArtwork(`effect-${key}`, await sharp(bytes).resize(64, 64, { kernel: "nearest" }).png().toBuffer());
  images[`effect:${source.namespace}:${key}`] = `/guide-artwork/${file}`;
}
const inventoryOnly = process.argv.includes("--inventory-only");
let potions = 0;
if (inventoryOnly) {
  const existing = JSON.parse(await readFile("src/features/knowledge/guide-artwork.json", "utf8"));
  for (const [id, path] of Object.entries(existing)) {
    if (!id.includes("/")) continue;
    images[id] = path; potions++;
  }
} else {
  potions = await renderGuidePotions(zip, GAME_GUIDE_BREWING, async (name, bytes) => {
    const file = name.replaceAll("/", "-");
    await writeArtwork(file, bytes);
    images[`${source.namespace}:${name}`] = `/guide-artwork/${file}.png`;
  });
}
for (const [alias, target] of Object.entries(GAME_GUIDE_ITEM_ALIASES))
  if (!images[`${source.namespace}:${alias}`] && images[`${source.namespace}:${target}`]) images[`${source.namespace}:${alias}`] = images[`${source.namespace}:${target}`];
for (const container of GAME_GUIDE_BREWING.containers) for (const [alias, target] of Object.entries(GAME_GUIDE_BREWING.variantAliases))
  images[`${source.namespace}:${container}/${alias}`] = images[`${source.namespace}:${container}/${target}`];
await writeFile("src/features/knowledge/guide-artwork.json", JSON.stringify(images));
const inventoryIds = [...renderNames].map(name => `${source.namespace}:${name}`)
  .concat(Object.keys(images).filter(id => id.includes("/"))).sort();
await writeFile("src/features/knowledge/guide-inventory.json", JSON.stringify(inventoryIds));
const names = JSON.parse(new TextDecoder().decode(Object.entries(zip).find(([path]) => path.endsWith("/lang/en_us.json"))[1]));
await writeFile("src/features/knowledge/guide-names.json", JSON.stringify(names));
await writeFile("public/guide-artwork/source.json", JSON.stringify({ blockTextures: GAME_GUIDE_BLOCK_ARTWORK_SOURCE,
  inventoryRenders: source, editionArtwork: GAME_GUIDE_EDITION_ARTWORK, models: client }, null, 2));
console.log(`Packaged ${renderNames.size} verified inventory renders, ${renderedBlocks} block-state renders and ${potions} potion variants (${Object.keys(images).length} identities total).`);
