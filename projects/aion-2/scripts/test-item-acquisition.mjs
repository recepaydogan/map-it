import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const publicRoot = join(process.cwd(), "public");
const readJson = async (path) => JSON.parse(await readFile(join(publicRoot, path), "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const catalog = await readJson("data/items/catalog.json");
const manifest = await readJson("data/items/source-manifest.json");
const index = await readJson("data/items/acquisition/index.json");
const itemIds = new Set(catalog.items.map((item) => item.id));
const recipesById = new Map(catalog.recipes.map((recipe) => [recipe.id, recipe]));
const markersByMap = new Map();
const forwardMarkerItems = new Set();
const forwardMarkerKinds = new Map();
const normalizedName = (name) => name.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
const counts = { drops: 0, merchants: 0, gathering: 0, shops: 0, crafting: 0, pickups: 0, coinShops: 0 };
const kinds = {
  drops: new Set(["boss-drop", "enemy-drop"]),
  merchants: new Set(["merchant"]),
  gathering: new Set(["gather"]),
  shops: new Set(["random-shop", "cash-shop"]),
  crafting: new Set(["craft-station"]),
  pickups: new Set(["pickup"]),
  coinShops: new Set(["coin-shop"]),
};

assert.equal(index.version, 1);
assert.deepEqual([...index.prefixes].sort(), index.prefixes);
assert.equal(new Set(index.prefixes).size, index.prefixes.length);
assert.deepEqual(manifest.acquisition.chunks.map((chunk) => chunk.prefix), index.prefixes);

let sourcedItems = 0;
for (const prefix of index.prefixes) {
  assert.match(prefix, /^\d{4}$/);
  const path = `data/items/acquisition/${prefix}.json`;
  const bytes = await readFile(join(publicRoot, path));
  const chunk = JSON.parse(bytes.toString("utf8"));
  const record = manifest.acquisition.chunks.find((entry) => entry.prefix === prefix);
  assert.equal(record.path, path);
  assert.equal(record.bytes, bytes.byteLength);
  assert.equal(record.sha256, hash(bytes));
  assert.equal(chunk.version, 1);
  for (const [itemId, groups] of Object.entries(chunk.items)) {
    assert(itemIds.has(itemId), `Unknown catalog item ${itemId}`);
    assert(itemId.startsWith(prefix), `Wrong acquisition chunk for ${itemId}`);
    sourcedItems += 1;
    for (const [groupName, allowedKinds] of Object.entries(kinds)) {
      assert(Array.isArray(groups[groupName]), `Missing ${groupName} for ${itemId}`);
      for (const source of groups[groupName]) {
        counts[groupName] += 1;
        assert(allowedKinds.has(source.kind), `Invalid source kind for ${itemId}`);
        assert(typeof source.name === "string" && source.name.trim(), `Unnamed source for ${itemId}`);
        assert(typeof source.source === "string" && source.source.endsWith(".dat"), `Missing provenance for ${itemId}`);
        if (source.recipeId) {
          const recipe = recipesById.get(source.recipeId);
          assert(recipe, `Unknown recipe ${source.recipeId}`);
          assert(recipe.outputItemId === itemId || recipe.comboOutputItemId === itemId, `Unrelated recipe ${source.recipeId} for ${itemId}`);
        }
        if (source.markerId) {
          assert(source.mapId, `Marker without map for ${itemId}`);
          if (!markersByMap.has(source.mapId)) {
            const metadata = await readJson(`maps/${source.mapId}/metadata.json`);
            markersByMap.set(source.mapId, new Map(metadata.locations.map((point) => [point.id, point])));
          }
          const marker = markersByMap.get(source.mapId).get(source.markerId);
          assert(marker, `Unknown map marker ${source.markerId}`);
          assert.equal(normalizedName(marker.name), normalizedName(source.name), `Marker name mismatch for ${source.markerId}`);
          assert(["boss", "dungeon-boss", "enemy", "merchant", "event-npc"].includes(marker.category), `Unexpected marker category for ${source.markerId}`);
          const markerItemKey = `${source.mapId}:${source.markerId}:${itemId}`;
          forwardMarkerItems.add(markerItemKey);
          if (!forwardMarkerKinds.has(markerItemKey)) forwardMarkerKinds.set(markerItemKey, new Set());
          forwardMarkerKinds.get(markerItemKey).add(source.kind);
        }
        for (const price of source.price ?? []) {
          assert(Number.isFinite(price.amount) && price.amount >= 0, `Invalid price for ${itemId}`);
          assert(typeof price.currency === "string" && price.currency.trim(), `Invalid currency for ${itemId}`);
        }
      }
    }
  }
}

const indexBytes = await readFile(join(publicRoot, manifest.acquisition.index.path));
assert.equal(manifest.acquisition.index.bytes, indexBytes.byteLength);
assert.equal(manifest.acquisition.index.sha256, hash(indexBytes));
assert.equal(sourcedItems, manifest.acquisition.itemsWithSources);
assert.deepEqual(counts, manifest.acquisition.counts);

const markerIndex = await readJson(manifest.acquisition.markerIndex.path);
const markerIndexBytes = await readFile(join(publicRoot, manifest.acquisition.markerIndex.path));
assert.equal(manifest.acquisition.markerIndex.bytes, markerIndexBytes.byteLength);
assert.equal(manifest.acquisition.markerIndex.sha256, hash(markerIndexBytes));
assert.equal(markerIndex.version, 1);
assert.deepEqual(markerIndex.maps, manifest.acquisition.markerChunks.map((chunk) => chunk.mapId));
const reverseMarkerItems = new Set();
for (const { mapId, path, bytes: expectedBytes, sha256 } of manifest.acquisition.markerChunks) {
  const bytes = await readFile(join(publicRoot, path));
  assert.equal(bytes.byteLength, expectedBytes);
  assert.equal(hash(bytes), sha256);
  const chunk = JSON.parse(bytes.toString("utf8"));
  assert.equal(chunk.version, 1);
  for (const [markerId, groups] of Object.entries(chunk.rewards ?? {})) {
    const linked = new Set((chunk.markers[markerId] ?? []).map((item) => item.id));
    assert(linked.size > 0, `Reward groups without linked items for ${markerId}`);
    for (const group of groups) {
      assert(["main", "participation", "shared", "additional"].includes(group.kind));
      assert(group.items.length + group.packages.length > 0, `Empty reward group for ${markerId}`);
      for (const item of group.items) {
        assert(linked.has(item.id), `Unlinked direct reward ${item.id} for ${markerId}`);
        assert(item.probability > 0 && item.probability <= 100_000_000);
      }
      for (const pack of group.packages) {
        assert(pack.probability > 0 && pack.probability <= 100_000_000);
        assert(Number.isInteger(pack.count) && pack.count > 0);
        assert(["weapons", "armor", "accessories", "items"].includes(pack.family));
        assert(pack.items.length > 0, `Empty reward package for ${markerId}`);
        for (const item of pack.items) {
          assert(linked.has(item.id), `Unlinked package reward ${item.id} for ${markerId}`);
          assert(item.probability > 0 && item.probability <= 100_000_000);
          if (pack.grade) assert.equal(item.grade, pack.grade);
        }
      }
    }
  }
  for (const [markerId, items] of Object.entries(chunk.markers)) {
    assert(markersByMap.get(mapId)?.has(markerId), `Unknown reverse marker ${markerId}`);
    const uniqueIds = new Set();
    for (const item of items) {
      assert(itemIds.has(item.id), `Unknown reverse item ${item.id}`);
      assert(!uniqueIds.has(item.id), `Duplicate reverse item ${item.id}`);
      uniqueIds.add(item.id);
      const markerItemKey = `${mapId}:${markerId}:${item.id}`;
      const hasDrop = [...(forwardMarkerKinds.get(markerItemKey) ?? [])].some((kind) => kind === "boss-drop" || kind === "enemy-drop");
      if (hasDrop) assert(["specific", "shared"].includes(item.sourceScope), `Missing drop scope for ${markerItemKey}`);
      else assert.equal(item.sourceScope, undefined, `Unexpected drop scope for ${markerItemKey}`);
      reverseMarkerItems.add(markerItemKey);
    }
  }
}
assert.deepEqual([...reverseMarkerItems].sort(), [...forwardMarkerItems].sort());
console.log(`Item acquisition data passed: ${sourcedItems} items, ${Object.values(counts).reduce((sum, count) => sum + count, 0)} sources, ${markersByMap.size} linked maps.`);
