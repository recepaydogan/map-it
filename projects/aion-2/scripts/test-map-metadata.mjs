import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const mapsDirectory = path.resolve("public/maps");
const mapEntries = await readdir(mapsDirectory, { withFileTypes: true });
let checkedLocations = 0;

for (const entry of mapEntries) {
  if (!entry.isDirectory()) continue;
  const metadataPath = path.join(mapsDirectory, entry.name, "metadata.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const layerFiles = (await readdir(path.join(mapsDirectory, entry.name)))
    .filter((name) => name.endsWith(".json") && name !== "metadata.json");
  const extraLocations = [];
  for (const file of layerFiles) {
    const layer = JSON.parse(await readFile(path.join(mapsDirectory, entry.name, file), "utf8"));
    assert.ok(Array.isArray(layer.locations), `${entry.name}/${file} needs a locations array`);
    extraLocations.push(...layer.locations);
  }
  const { locations } = metadata;
  const bounds = metadata.navigationBounds ?? metadata.bounds;

  assert.ok(bounds && Number.isFinite(bounds.minX) && Number.isFinite(bounds.maxX));
  assert.ok(Number.isFinite(bounds.minY) && Number.isFinite(bounds.maxY));
  assert.ok(Array.isArray(locations), `${entry.name} needs a locations array`);

  const ids = new Set();
  for (const location of [...locations, ...extraLocations]) {
    assert.ok(typeof location.id === "string" && location.id, `${entry.name} has a location without an id`);
    assert.ok(!ids.has(location.id), `${entry.name} has duplicate location id ${location.id}`);
    ids.add(location.id);
    assert.ok(
      (typeof location.name === "string" && location.name)
        || (typeof location.nameKey === "string" && location.nameKey),
      `${location.id} needs a name or translation key`,
    );
    assert.ok(typeof location.category === "string" && location.category, `${location.id} needs a category`);
    assert.ok(Number.isFinite(location.x) && location.x >= bounds.minX && location.x <= bounds.maxX,
      `${location.id} has an invalid X coordinate`);
    assert.ok(Number.isFinite(location.y) && location.y >= bounds.minY && location.y <= bounds.maxY,
      `${location.id} has an invalid Y coordinate`);
    checkedLocations += 1;
  }
}

console.log(`Map metadata valid: ${checkedLocations} locations across ${mapEntries.filter((entry) => entry.isDirectory()).length} maps.`);
