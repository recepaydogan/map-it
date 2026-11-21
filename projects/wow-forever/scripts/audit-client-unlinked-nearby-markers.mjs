/** Find nearby published marker pairs that may merit a source relationship review. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await readJson("src/i18n/locales/en.json");
const layerNames = ["locations-client.json", "locations-settlements.json",
  "locations-flight.json", "locations-instances.json",
  "locations-points-of-interest.json", "locations-world-objectives.json",
  "locations-boats.json", "locations-transport-signs.json",
  "locations-service-signs.json", "locations-thunder-bluff-signs.json",
  "locations-zephras-signs.json",
  "locations-wayfinding.json", "locations-world-signposts.json"];
const layers = await Promise.all(layerNames.map(async (file) => ({ file,
  data: await readJson(`public/maps/world-atlas/${file}`) })));
const localize = (key) => key.split(".").reduce((value, part) => value?.[part], english);
const markers = layers.flatMap(({ file, data }) => data.locations.map((marker) => ({
  id: marker.id, file, category: marker.category,
  name: marker.nameKey ? localize(marker.nameKey) : marker.name,
  x: marker.x, y: marker.y,
  targetIds: new Set([...(marker.linkedMarkers ?? []),
    ...(marker.linkedMarkerGroups ?? []).flatMap(({ links }) => links)]
    .filter(({ mapId }) => mapId === "azeroth").map(({ markerId }) => markerId)),
})));
const candidates = [];
for (let leftIndex = 0; leftIndex < markers.length; leftIndex += 1) {
  const left = markers[leftIndex];
  for (let rightIndex = leftIndex + 1; rightIndex < markers.length; rightIndex += 1) {
    const right = markers[rightIndex];
    if (left.category === right.category || left.targetIds.has(right.id)
      || right.targetIds.has(left.id)) continue;
    const distance = Math.hypot(left.x - right.x, left.y - right.y);
    if (distance > 180) continue;
    candidates.push({ left: { id: left.id, name: left.name, category: left.category,
      file: left.file }, right: { id: right.id, name: right.name,
      category: right.category, file: right.file },
    atlasDistance: distance,
    exactName: left.name === right.name,
    sharedNameToken: left.name.toLowerCase().split(/[^a-z0-9]+/)
      .some((token) => token.length > 4 && right.name.toLowerCase().includes(token)) });
  }
}
candidates.sort((left, right) => Number(right.exactName) - Number(left.exactName)
  || Number(right.sharedNameToken) - Number(left.sharedNameToken)
  || left.atlasDistance - right.atlasDistance);
await writeFile(join(root, "data/client-research/unlinked-nearby-marker-candidates.json"),
  `${JSON.stringify({ thresholdAtlasPixels: 180, markerCount: markers.length,
    candidateCount: candidates.length,
    rule: "Spatial proximity suggests review only; it is not evidence of service, travel, loot, or a source relationship.",
    candidates }, null, 2)}\n`);
console.log(`${markers.length} world markers; ${candidates.length} nearby unlinked cross-category pairs.`);
