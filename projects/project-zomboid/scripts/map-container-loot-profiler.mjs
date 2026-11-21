import { qualifyItemId } from "./map-item-catalog.mjs";

const stripStructuralNoise = (line) => line
  .replace(/--.*$/, "")
  .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");

const countCharacter = (value, character) => (
  [...value].reduce((count, candidate) => count + Number(candidate === character), 0)
);

const extractChildTableBlocks = (source) => {
  const blocks = new Map();
  const lines = source.split(/\r?\n/);
  let depth = 0;
  let started = false;
  let currentName;
  let currentLines = [];

  for (const line of lines) {
    const structural = stripStructuralNoise(line);
    if (started && depth === 1 && !currentName) {
      const match = structural.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/);
      if (match) {
        currentName = match[1];
        currentLines = [];
      }
    }
    if (currentName) currentLines.push(line);
    depth += countCharacter(structural, "{") - countCharacter(structural, "}");
    if (!started && structural.includes("{")) started = true;
    if (currentName && depth === 1) {
      blocks.set(currentName, currentLines.join("\n"));
      currentName = undefined;
      currentLines = [];
    }
    if (started && depth <= 0) break;
  }
  return blocks;
};

export const extractTopLevelTableBlocks = (source, marker) => {
  const start = source.indexOf(marker);
  return start < 0 ? new Map() : extractChildTableBlocks(source.slice(start));
};

const findMatchingBrace = (source, openingIndex) => {
  let depth = 0;
  let quote;
  let escaped = false;
  let lineComment = false;
  for (let index = openingIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "-" && next === "-") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
};

export const extractAssignedTableBlocks = (source, assignmentPattern) => {
  const blocks = new Map();
  for (const match of source.matchAll(assignmentPattern)) {
    const openingIndex = match.index + match[0].lastIndexOf("{");
    const closingIndex = findMatchingBrace(source, openingIndex);
    if (closingIndex > openingIndex) blocks.set(match[1], source.slice(openingIndex, closingIndex + 1));
  }
  return blocks;
};

const extractWeightedItems = (source) => [...source.matchAll(
  /"([A-Za-z0-9_.-]+)"\s*,\s*(\d+(?:\.\d+)?)/g,
)].map((match) => ({ id: qualifyItemId(match[1]), weight: Number(match[2]) }));

const parseListField = (source, field) => source
  .match(new RegExp(`\\b${field}\\s*=\\s*"([^"]+)"`))?.[1]
  .split(";")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean) ?? [];

const parseNumberField = (source, field, fallback) => {
  const value = Number(source.match(new RegExp(`\\b${field}\\s*=\\s*(\\d+(?:[.]\\d+)?)`))?.[1]);
  return Number.isFinite(value) ? value : fallback;
};

const getProceduralEntries = (block) => [...block.matchAll(
  /\{\s*name\s*=\s*"([A-Za-z0-9_]+)"([^{}]*)\}/g,
)].map((match, index) => ({
  key: `${match[1]}:${index}`,
  name: match[1],
  min: parseNumberField(match[2], "min", 0),
  max: parseNumberField(match[2], "max", 99),
  weight: parseNumberField(match[2], "weightChance", 100),
  forcedTiles: parseListField(match[2], "forceForTiles"),
  forcedRooms: parseListField(match[2], "forceForRooms"),
  isZoneForced: /\bforceForZones\s*=/.test(match[2]),
  isItemForced: /\bforceForItems\s*=/.test(match[2]),
}));

const stableHash = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
};

const pickWeightedEntry = (entries, seed) => {
  if (entries.length === 0) return undefined;
  const totalWeight = entries.reduce((total, entry) => total + Math.max(entry.weight, 0), 0);
  if (totalWeight <= 0) return entries[stableHash(seed) % entries.length];
  let target = (stableHash(seed) / 0x100000000) * totalWeight;
  for (const entry of entries) {
    target -= Math.max(entry.weight, 0);
    if (target < 0) return entry;
  }
  return entries.at(-1);
};

const selectProceduralEntry = ({ entries, placement, counts, seed }) => {
  const tile = placement.tile.toLowerCase();
  const room = placement.room.toLowerCase();
  const tileForced = entries.filter((entry) => entry.forcedTiles.includes(tile));
  if (tileForced.length > 0) return pickWeightedEntry(tileForced, seed);
  const roomForced = entries.filter((entry) => entry.forcedRooms.includes(room));
  if (roomForced.length > 0) return pickWeightedEntry(roomForced, seed);

  const regular = entries.filter((entry) => (
    entry.forcedTiles.length === 0
    && entry.forcedRooms.length === 0
    && !entry.isZoneForced
    && !entry.isItemForced
  ));
  const required = regular.filter((entry) => (counts.get(entry.key) ?? 0) < entry.min);
  if (required.length > 0) return pickWeightedEntry(required, `${seed}:required`);
  const available = regular.filter((entry) => (counts.get(entry.key) ?? 0) < entry.max);
  return pickWeightedEntry(available.length > 0 ? available : regular, seed);
};

const extractFirstTableBlock = (source, name) => {
  const match = new RegExp(`\\b${name}\\s*=\\s*\\{`).exec(source);
  if (!match) return undefined;
  const openingIndex = match.index + match[0].lastIndexOf("{");
  const closingIndex = findMatchingBrace(source, openingIndex);
  return closingIndex > openingIndex ? source.slice(openingIndex, closingIndex + 1) : undefined;
};

const pickWeightedItem = (items, seed) => {
  if (items.length === 0) return undefined;
  const totalWeight = items.reduce((total, item) => total + Math.max(item.weight, 0), 0);
  if (totalWeight <= 0) return items[stableHash(seed) % items.length];
  let target = (stableHash(seed) / 0x100000000) * totalWeight;
  for (const item of items) {
    target -= Math.max(item.weight, 0);
    if (target < 0) return item;
  }
  return items.at(-1);
};

const sampleMainItemTable = (source, seed) => {
  const itemsBlock = extractFirstTableBlock(source, "items");
  if (!itemsBlock) return [];
  const items = extractWeightedItems(itemsBlock);
  const rolls = Math.max(0, Math.round(parseNumberField(source, "rolls", items.length > 0 ? 1 : 0)));
  return Array.from({ length: rolls }, (_, roll) => pickWeightedItem(items, `${seed}:${roll}`))
    .filter(Boolean);
};

const sampleDistributionBlock = (source, seed) => {
  const sampled = sampleMainItemTable(source, `${seed}:main`);
  const junkBlock = extractFirstTableBlock(source, "junk");
  if (junkBlock) sampled.push(...sampleMainItemTable(junkBlock, `${seed}:junk`));
  return sampled;
};

const addSampledItems = (scores, items) => {
  for (const item of items) scores.set(item.id, (scores.get(item.id) ?? 0) + 1);
};

const buildSampledProfile = (id, scores, matchedDistributions) => {
  const rankedItems = [...scores].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const strongestWeight = rankedItems[0]?.[1] ?? 1;
  return {
    id,
    items: rankedItems.map(([itemId, weight]) => ({
      id: itemId,
      weight: Math.max(1, Math.round((weight / strongestWeight) * 100)),
    })),
    matchedDistributions,
  };
};

export const parseRoomDistributionAliases = (source) => new Map([...source.matchAll(
  /SuburbsDistributions[.]([A-Za-z_][A-Za-z0-9_]*)\s*=\s*SuburbsDistributions[.]([A-Za-z_][A-Za-z0-9_]*)/g,
)].map((match) => [match[1].toLowerCase(), match[2].toLowerCase()]));

const resolveAlias = (room, aliases) => {
  let resolved = room;
  const visited = new Set();
  while (aliases.has(resolved) && !visited.has(resolved)) {
    visited.add(resolved);
    resolved = aliases.get(resolved);
  }
  return resolved;
};

export const buildContainerLootData = ({
  buildings,
  distributionsSource,
  proceduralSource,
  suburbsDistributionsSource,
  clutterSources,
  roomDistributionSources = [],
  proceduralAddonSources = [],
}) => {
  const roomBlocks = extractTopLevelTableBlocks(distributionsSource, "local distributionTable = {");
  for (const source of roomDistributionSources) {
    for (const [room, block] of extractAssignedTableBlocks(
      source,
      /SuburbsDistributions[.]([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/g,
    )) roomBlocks.set(room, block);
  }
  const containersByRoom = new Map([...roomBlocks].map(([room, block]) => [
    room.toLowerCase(),
    new Map([...extractChildTableBlocks(block)].map(([container, containerBlock]) => [
      container.toLowerCase(),
      containerBlock,
    ])),
  ]));
  const proceduralBlocks = extractTopLevelTableBlocks(proceduralSource, "ProceduralDistributions.list = {");
  for (const source of proceduralAddonSources) {
    for (const [name, block] of extractAssignedTableBlocks(
      source,
      /ProceduralDistributions[.]list[.]([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/g,
    )) proceduralBlocks.set(name, block);
  }
  const clutterBlocks = new Map(clutterSources.flatMap((source) => [...extractAssignedTableBlocks(
    source,
    /ClutterTables[.]([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/g,
  )]));
  const aliases = parseRoomDistributionAliases([
    suburbsDistributionsSource,
    ...roomDistributionSources,
  ].join("\n"));
  const lootProfiles = {};
  const buildingLootProfileIds = new Map();
  const proceduralEntriesByBlock = new Map();

  for (const building of buildings) {
    const buildingScores = new Map();
    let matchedDistributions = 0;
    const placementGroups = new Map();
    for (const placement of building.containers) {
      const room = resolveAlias(placement.room, aliases);
      const roomContainerBlock = containersByRoom.get(room)?.get(placement.container);
      const globalContainerBlock = containersByRoom.get("all")?.get(placement.container);
      const block = roomContainerBlock ?? globalContainerBlock;
      if (!block) continue;
      const sourceRoom = roomContainerBlock ? room : "all";
      const groupKey = `${placement.roomId}:${sourceRoom}:${placement.container}`;
      const group = placementGroups.get(groupKey) ?? [];
      group.push({ placement, block });
      placementGroups.set(groupKey, group);
    }

    for (const group of placementGroups.values()) {
      const counts = new Map();
      group.sort((left, right) => (
        left.placement.floor - right.placement.floor
        || left.placement.y - right.placement.y
        || left.placement.x - right.placement.x
        || left.placement.tile.localeCompare(right.placement.tile)
      ));
      for (const { placement, block } of group) {
        let entries = proceduralEntriesByBlock.get(block);
        if (!entries) {
          entries = getProceduralEntries(block);
          proceduralEntriesByBlock.set(block, entries);
        }
        const seed = [
          building.id,
          placement.roomId,
          placement.container,
          placement.floor,
          placement.x,
          placement.y,
          placement.tile,
        ].join(":");
        const selectedEntry = selectProceduralEntry({ entries, placement, counts, seed });
        if (selectedEntry) counts.set(selectedEntry.key, (counts.get(selectedEntry.key) ?? 0) + 1);
        addSampledItems(buildingScores, sampleDistributionBlock(block, `${seed}:container`));
        if (selectedEntry) {
          const proceduralBlock = proceduralBlocks.get(selectedEntry.name);
          if (proceduralBlock) {
            matchedDistributions += 1;
            addSampledItems(
              buildingScores,
              sampleDistributionBlock(proceduralBlock, `${seed}:procedural:${selectedEntry.name}`),
            );
          }
        }
        for (const match of block.matchAll(/ClutterTables[.]([A-Za-z_][A-Za-z0-9_]*)/g)) {
          const clutterBlock = clutterBlocks.get(match[1]);
          if (!clutterBlock) continue;
          matchedDistributions += 1;
          addSampledItems(
            buildingScores,
            sampleDistributionBlock(clutterBlock, `${seed}:clutter:${match[1]}`),
          );
        }
      }
    }
    const profileId = `location:${building.id}`;
    if (buildingScores.size > 0) {
      lootProfiles[profileId] = buildSampledProfile(profileId, buildingScores, matchedDistributions);
      buildingLootProfileIds.set(building.id, [profileId]);
    } else {
      buildingLootProfileIds.set(building.id, []);
    }
  }

  const lootItemIds = new Set([
    ...roomBlocks.values(),
    ...proceduralBlocks.values(),
    ...clutterBlocks.values(),
  ].flatMap((block) => extractWeightedItems(block).map(({ id }) => id)));
  return {
    lootProfiles,
    buildingLootProfileIds,
    lootItemIds,
    containerPlacementCount: buildings.reduce((count, building) => count + building.containers.length, 0),
  };
};
