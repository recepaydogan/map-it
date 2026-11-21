/** Match physical direction signs to independently positioned client places. */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const survey = await readJson("data/client-research/map-placement-survey.json");
const models = await readJson("data/client-research/world-object-model-family.json");
const settlements = await readJson("data/client-research/published-settlement-poi-evidence.json");
const points = await readJson("data/client-research/published-point-of-interest-evidence.json");
const overlays = await readJson("data/client-research/published-marker-evidence.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");

if (survey.source.build !== models.source.build
  || survey.source.build !== settlements.source.build
  || survey.source.build !== points.source.build
  || survey.source.build !== overlays.source.build
  || survey.source.build !== atlas.source.build
  || survey.source.tables.find(({ name }) => name === "GameObjects")?.sha256
    !== models.source.gameObjects.sha256
  || survey.source.tables.find(({ name }) => name === "AreaPOI")?.sha256
    !== settlements.source.sha256
  || points.source.sha256 !== settlements.source.sha256) {
  throw new Error("The signposts and place positions do not come from the same client build.");
}

const modelsByDisplayId = new Map(models.models.map((model) => [model.displayId, model]));
const project = createClientWorldProjector(atlas);
const placesByName = new Map();
for (const place of [...settlements.markers, ...points.markers,
  ...overlays.markers.filter(({ category }) => ["city", "town"].includes(category))]) {
  const mapId = place.mapId ?? place.sourceIds?.worldMapId;
  const key = `${mapId}:${place.name}`;
  const candidates = placesByName.get(key) ?? [];
  candidates.push(place);
  placesByName.set(key, candidates);
}
const ambiguousPlaceNames = [...placesByName].filter(([, candidates]) =>
  candidates.length > 1).map(([key, candidates]) => ({ key,
  poiIds: candidates.map(({ poiId }) => poiId) }));

const sourceMatches = survey.maps.filter(({ mapId }) => mapId === 0 || mapId === 1)
  .flatMap(({ mapId, gameObjects }) => gameObjects.flatMap((object) => {
    const candidates = placesByName.get(`${mapId}:${object.name}`) ?? [];
    const place = candidates.length === 1 ? candidates[0] : null;
    const model = modelsByDisplayId.get(object.displayId);
    if (!place || model?.modelMagic !== "MD21"
      || !model.modelNameHints.some((name) => /sign.*pointer/i.test(name))) return [];
    const atlasPosition = project(mapId, object.worldPosition);
    if (!Number.isFinite(atlasPosition?.x) || !Number.isFinite(atlasPosition?.y)) {
      throw new Error(`Physical sign ${object.objectId} has no projected position.`);
    }
    return [{ objectId: object.objectId, name: object.name, mapId,
      worldPosition: object.worldPosition, atlasPosition,
      displayId: object.displayId, modelFileDataId: model.modelFileDataId,
      modelNameHints: model.modelNameHints,
      placeLocationId: place.locationId ?? `client-place-poi-${place.poiId}`,
      placePoiId: place.poiId ?? place.sourceIds?.areaPoiId }];
  })).sort((left, right) => left.objectId - right.objectId);
if (new Set(sourceMatches.map(({ objectId }) => objectId)).size !== sourceMatches.length) {
  throw new Error("A physical direction sign has been duplicated.");
}
const inBounds = ({ atlasPosition: { x, y } }) =>
  x >= atlas.bounds.minX && x <= atlas.bounds.maxX
  && y >= atlas.bounds.minY && y <= atlas.bounds.maxY;
const tileCache = new Map();
const terrainCheck = async (sign) => {
  const layer = atlas.terrainLayers.find(({ id }) => id === `map-${sign.mapId}`);
  if (!layer) throw new Error(`World map ${sign.mapId} lacks native terrain.`);
  const sourceX = (sign.atlasPosition.x - layer.originX) / layer.scaleX;
  const sourceY = (sign.atlasPosition.y - layer.originY) / layer.scaleY;
  const tileX = Math.floor(sourceX / layer.tileSize);
  const tileY = Math.floor(sourceY / layer.tileSize);
  const tile = `${tileX},${tileY}`;
  if (!layer.tileCoverage[0].includes(tile)) return { tile, alpha: null };
  const tilePath = resolve(root, "public/maps/world-atlas", layer.basePath,
    `tiles/0/tile${tileX}x${tileY}.webp`);
  if (!tileCache.has(tilePath)) {
    tileCache.set(tilePath, await sharp(tilePath).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true }));
  }
  const { data, info } = tileCache.get(tilePath);
  const pixelX = Math.floor(sourceX - tileX * layer.tileSize);
  const pixelY = Math.floor(sourceY - tileY * layer.tileSize);
  return { tile, alpha: data[(pixelY * info.width + pixelX) * info.channels + 3] };
};
const projected = await Promise.all(sourceMatches.filter(inBounds).map(async (sign) => ({
  ...sign, nativeTerrain: await terrainCheck(sign),
})));
const signs = projected.filter(({ nativeTerrain }) => nativeTerrain.alpha > 0);
const outsideAtlas = sourceMatches.filter((sign) => !inBounds(sign));
const outsideNativeTerrain = projected.filter(({ nativeTerrain }) =>
  nativeTerrain.alpha === null || nativeTerrain.alpha === 0);

// Signs within one short client-world step form a physical post. This reduces
// overlapping pins while keeping each source object and its destination visible.
const maxPostRadius = 10;
const groups = [];
const assigned = new Set();
for (const sign of signs) {
  if (assigned.has(sign.objectId)) continue;
  const queue = [sign];
  const members = [];
  assigned.add(sign.objectId);
  while (queue.length) {
    const current = queue.pop();
    members.push(current);
    for (const candidate of signs) {
      if (assigned.has(candidate.objectId) || candidate.mapId !== current.mapId) continue;
      const distance = Math.hypot(candidate.worldPosition[0] - current.worldPosition[0],
        candidate.worldPosition[1] - current.worldPosition[1]);
      if (distance > maxPostRadius) continue;
      assigned.add(candidate.objectId);
      queue.push(candidate);
    }
  }
  members.sort((left, right) => left.objectId - right.objectId);
  const destinations = [...new Set(members.map(({ placeLocationId }) =>
    placeLocationId))].map((locationId) => {
    const relevant = members.filter(({ placeLocationId }) =>
      placeLocationId === locationId);
    return { placeLocationId: locationId, placePoiId: relevant[0].placePoiId,
      name: relevant[0].name, objectIds: relevant.map(({ objectId }) => objectId) };
  }).sort((left, right) => left.name.localeCompare(right.name));
  groups.push({ signpostId: `client-world-signpost-${members[0].objectId}`,
    mapId: sign.mapId,
    worldPosition: members[0].worldPosition.slice(0, 2),
    atlasPosition: members[0].atlasPosition,
    destinations, members });
}
if (assigned.size !== signs.length || groups.some(({ members, destinations }) =>
  !members.length || !destinations.length)) {
  throw new Error("The physical direction signs were not completely grouped.");
}

const result = {
  source: { product: survey.source.product, build: survey.source.build,
    gameObjects: models.source.gameObjects, displayInfo: models.source.displayInfo,
    areaPoi: { fileDataId: settlements.source.fileDataId,
      sha256: settlements.source.sha256 } },
  rule: "A named, positioned GameObjects record on world Map 0 or 1 uses a client model with a sign-pointer name. Its exact text matches one independently positioned, published AreaPOI place on the same map, including overlay-backed city and town pins. Signs within 10 client world units form one physical post.",
  caveat: "A posted name points toward a place. It does not prove a route, arrival point, service, NPC, or travel time.",
  maxPostRadius,
  physicalSignCount: sourceMatches.length,
  atlasSignCount: projected.length,
  nativeTerrainSignCount: signs.length,
  outsideAtlas,
  outsideNativeTerrain,
  ambiguousPlaceNames,
  signpostCount: groups.length,
  linkedPlaceCount: new Set(signs.map(({ placeLocationId }) =>
    placeLocationId)).size,
  multipleDestinationPostCount: groups.filter(({ destinations }) =>
    destinations.length > 1).length,
  signposts: groups,
};
await writeFile(join(root, "data/client-research/world-signpost-relations.json"),
  `${JSON.stringify(result, null, 2)}\n`);
console.log(`Traced ${result.physicalSignCount} physical signs as ${result.signpostCount} posts pointing to ${result.linkedPlaceCount} places.`);
