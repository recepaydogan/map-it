import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { GAME_CONFIG, GAME_BIOMES, GAME_GUIDE_BEDROCK_BIOME_ALIASES, GAME_GUIDE_BEDROCK_BIOME_UNAVAILABLE,
  GAME_GUIDE_BEDROCK_BIOME_SOURCE as source }
  from "../src/game-config.ts";

const root = resolve(import.meta.dirname, "..");
const rawBase = `https://raw.githubusercontent.com/${source.repository}/${source.revision}/${source.prefix}`;
const withoutComments = text => {
  let output = "", quoted = false, escaped = false, line = false, block = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index], next = text[index + 1];
    if (line) { if (char === "\n") { line = false; output += char; } continue; }
    if (block) { if (char === "*" && next === "/") { block = false; index++; } continue; }
    if (quoted) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; output += char; continue; }
    if (char === "/" && next === "/") { line = true; index++; continue; }
    if (char === "/" && next === "*") { block = true; index++; continue; }
    output += char;
  }
  return output;
};
const fetchJson = async url => {
  const response = await fetch(url, { headers: { "User-Agent": `${GAME_CONFIG.appSlug}-biome-guide` } });
  if (!response.ok) throw new Error(`Source request ${response.status}: ${url}`);
  return JSON.parse(withoutComments(await response.text()));
};
const unsupportedFilters = new Set();
const matchesFilter = (filter, tags, tagSets) => {
  if (Array.isArray(filter)) {
    const positive = filter.every(entry => entry?.test === "has_biome_tag"
      && (entry.operator === "==" || entry.operator === undefined));
    const intersects = positive && tagSets.some(set => filter.every(entry => set.has(entry.value)));
    return positive && !intersects
      ? filter.some(entry => matchesFilter(entry, tags, tagSets))
      : filter.every(entry => matchesFilter(entry, tags, tagSets));
  }
  if (filter?.all_of) return filter.all_of.every(entry => matchesFilter(entry, tags, tagSets));
  if (filter?.any_of) return filter.any_of.some(entry => matchesFilter(entry, tags, tagSets));
  if (filter?.none_of) return filter.none_of.every(entry => !matchesFilter(entry, tags, tagSets));
  if (filter?.test !== "has_biome_tag") { unsupportedFilters.add(filter?.test ?? "unknown"); return false; }
  if (typeof filter.value !== "string") throw new Error(`Invalid biome tag filter: ${JSON.stringify(filter)}`);
  const present = tags.has(filter.value);
  if (filter.operator === "!=" || filter.operator === "not") return !present;
  if (filter.operator === "==" || filter.operator === "equals" || filter.operator === undefined) return present;
  throw new Error(`Unsupported biome spawn operator: ${filter.operator}`);
};
const spawnCategory = populationControl => ({ animal: "creature", water_animal: "water_creature",
  ambient: "ambient", monster: "monster" })[populationControl] ?? populationControl;
const biomes = [];
const tagsById = new Map();
for (const { registryId } of GAME_BIOMES) {
  const path = registryId.slice("minecraft:".length);
  if (GAME_GUIDE_BEDROCK_BIOME_UNAVAILABLE.has(path)) continue;
  const sourcePath = GAME_GUIDE_BEDROCK_BIOME_ALIASES[path] ?? path;
  const url = `${rawBase}${sourcePath}.biome.json`;
  const document = await fetchJson(url);
  const biome = document["minecraft:biome"];
  if (biome?.description?.identifier !== `minecraft:${sourcePath}`) {
    throw new Error(`Unexpected biome identifier in ${url}`);
  }
  const climate = biome.components?.["minecraft:climate"];
  if (!climate || !Number.isFinite(climate.temperature) || !Number.isFinite(climate.downfall)) {
    throw new Error(`Missing climate in ${url}`);
  }
  const terrain = biome.components?.["minecraft:surface_builder"]?.builder;
  const tags = biome.components?.["minecraft:tags"]?.tags;
  if (!Array.isArray(tags) || tags.some(tag => typeof tag !== "string")) throw new Error(`Missing biome tags in ${url}`);
  tagsById.set(registryId, new Set(tags));
  biomes.push({ id: registryId, sourceId: `minecraft:${sourcePath}`,
    temperature: climate.temperature, downfall: climate.downfall,
    ...(terrain?.top_material ? { topMaterial: terrain.top_material } : {}),
    ...(terrain?.sea_material ? { seaMaterial: terrain.sea_material } : {}),
  });
}

const tree = await fetchJson(`https://api.github.com/repos/${source.repository}/git/trees/${source.revision}?recursive=1`);
if (tree.truncated) throw new Error("Bedrock sample file tree is truncated.");
const spawnFiles = tree.tree.filter(entry => entry.type === "blob"
  && /^behavior_pack\/spawn_rules\/[^/]+\.json$/.test(entry.path));
const spawnRules = await Promise.all(spawnFiles.map(entry => fetchJson(
  `https://raw.githubusercontent.com/${source.repository}/${source.revision}/${entry.path}`)));
const tagSets = [...tagsById.values()];
for (const biome of biomes) {
  const tags = tagsById.get(biome.id);
  const spawns = new Map();
  for (const [ruleIndex, document] of spawnRules.entries()) {
    const rules = document["minecraft:spawn_rules"];
    const id = rules?.description?.identifier;
    if (typeof id !== "string") {
      throw new Error(`Invalid Bedrock spawn rule: ${spawnFiles[ruleIndex].path}`);
    }
    if (!rules.conditions) continue;
    if (!Array.isArray(rules.conditions)) throw new Error(`Invalid spawn conditions: ${spawnFiles[ruleIndex].path}`);
    for (const condition of rules.conditions) {
      const filter = condition["minecraft:biome_filter"];
      if (!filter || !matchesFilter(filter, tags, tagSets)) continue;
      const weight = condition["minecraft:weight"]?.default;
      const herds = condition["minecraft:herd"];
      const herd = Array.isArray(herds) ? herds[0] : herds;
      if (!Number.isFinite(weight) || weight <= 0 || herd && (!Number.isFinite(herd.min_size)
        || !Number.isFinite(herd.max_size))) continue;
      const entry = { id, category: spawnCategory(rules.description.population_control),
        weight, min: herd?.min_size ?? 1, max: herd?.max_size ?? 1 };
      const current = spawns.get(id);
      if (!current || current.weight < entry.weight) spawns.set(id, entry);
    }
  }
  biome.spawns = [...spawns.values()];
}
if (unsupportedFilters.size) console.warn(`Skipped non-tag biome filters: ${[...unsupportedFilters].join(", ")}`);
console.log(`Spawn categories: ${[...new Set(biomes.flatMap(biome => biome.spawns.map(spawn => spawn.category)))].join(", ")}`);

const artifact = { source: { edition: source.edition, version: source.version, repository: source.repository,
  revision: source.revision, tag: source.tag, url: `https://github.com/${source.repository}/tree/${source.revision}/${source.prefix}` },
  biomes };
const output = resolve(root, `public/knowledge-data/${source.edition}/${source.version}/biomes.json`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(artifact)}\n`);
console.log(`Wrote ${biomes.length} Bedrock biome guide records and ${spawnFiles.length} spawn-rule sources to ${output}`);
