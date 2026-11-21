import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const registered = new Set(readRegisteredMapIds(fs.readFileSync(path.join(root, "src/features/map/map-registry.ts"), "utf8")));
const rasters = new Map(read("map-sources/config/bc3-maps.json").maps.map((map) => [map.id, map]));
const placements = new Map(read("map-sources/config/placement-maps.json").maps.map((map) => [map.id, map]));
const levels = read("map-sources/catalog/world-map.json").levels;
const visits = [
  {
    mapId: "astral-plane-creche", level: "CRE_Main_A", layers: 1,
    arrival: "b73922c5-5ac4-4551-b492-ce85e01175d1", position: { x: 1803.1907, y: 42.71631, z: 366.5187 },
    exits: ["87ca4464-d8ab-4fd2-b578-678b64666939"],
    story: "Act1b_CRE_ChainOfCommand.txt", arrivalCall: "PROC_TeleportPartiesTo(S_CRE_AstralPlaneEntrance_",
  },
  {
    mapId: "astral-plane-intermezzo", level: "INT_Main_A", layers: 3,
    exits: ["d16098eb-cb90-4ef9-a66b-86eac687e547"],
  },
  {
    mapId: "astral-plane-finale", level: "END_Main", layers: 3,
    arrival: "66edc6ed-1584-47ac-983c-c6119ea7ddd4", position: { x: 127.95926, y: -2.62145, z: 3263.6785 },
    exits: ["2a62d420-290b-47e5-a224-71b5cda70f50", "b86aadd0-1cdd-460b-8c02-63c01a9a612e"],
    story: "Act3c_END_IllithidOptions.txt", arrivalCall: "PROC_TeleportPartiesTo(S_END_ToAstralPlanePoint_",
  },
];
for (const visit of visits) {
  const { mapId, level } = visit;
  assert.ok(registered.has(mapId), `${mapId} has its own registered scene`);
  const raster = rasters.get(mapId);
  const sources = raster.layers ?? [raster];
  assert.equal(sources.length, visit.layers, `${mapId} uses the accessible area for this visit`);
  const config = placements.get(mapId);
  assert.equal(config.levelPattern, `^${level}$`, `${mapId} cannot borrow another visit's objects`);
  const patches = levels.find((entry) => entry.module === "GustavDev" && entry.level === level).patches;
  for (const source of sources) {
    const patch = patches.find((entry) => source.source.endsWith(`${entry.gTex}_0.dds`));
    assert.ok(patch && config.sourcePatchIds.includes(patch.id), `${mapId} source is an original patch from its own scene`);
    assert.equal(patch.floor, 0, `${mapId} does not flatten a different floor into the walking surface`);
    assert.deepEqual(source.worldBounds, patch.worldBounds, `${mapId} retains native patch placement`);
  }
  const locations = read(`public/maps/${mapId}/locations.json`).locations;
  const entities = new Map(Object.values(read(`public/maps/${mapId}/content.json`).entities).map((entity) => [entity.id, entity]));
  assert.ok(locations.length > 0, `${mapId} is not an empty thumbnail`);
  for (const id of [visit.arrival, ...visit.exits].filter(Boolean)) {
    const marker = locations.find((location) => location.contentId === id);
    assert.equal(marker?.category, "transition", `${mapId}/${id} is a visible passage`);
    for (const other of visits.filter((entry) => entry !== visit)) {
      assert.equal(read(`public/maps/${other.mapId}/locations.json`).locations.some((location) => location.contentId === id), false,
        `${mapId}/${id} does not leak into ${other.mapId}`);
    }
  }
  if (visit.arrival) {
    const story = fs.readFileSync(path.join(root, "map-sources/extracted/story-goals/GustavDev", visit.story), "utf8");
    assert.ok(story.includes(`${visit.arrivalCall}${visit.arrival}`), `${mapId} is reached by an actual party teleport`);
    assert.deepEqual(entities.get(visit.arrival).worldPosition, visit.position, `${mapId} keeps its authored arrival coordinates`);
  }
}
console.log("Astral Plane coverage passed: three separate playable visits with native scene-specific rasters and passage markers.");
