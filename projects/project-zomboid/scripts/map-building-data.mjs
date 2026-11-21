import { classifyMapBuilding } from "./map-location-classifier.mjs";

const getBounds = (points) => points.reduce((bounds, [x, y]) => ({
  minX: Math.min(bounds.minX, x),
  minY: Math.min(bounds.minY, y),
  maxX: Math.max(bounds.maxX, x),
  maxY: Math.max(bounds.maxY, y),
}), {
  minX: Number.POSITIVE_INFINITY,
  minY: Number.POSITIVE_INFINITY,
  maxX: Number.NEGATIVE_INFINITY,
  maxY: Number.NEGATIVE_INFINITY,
});

const intersects = (left, right, padding = 0) => (
  left.minX <= right.maxX + padding
  && left.maxX >= right.minX - padding
  && left.minY <= right.maxY + padding
  && left.maxY >= right.minY - padding
);

const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);
const gridKey = (x, y) => `${Math.floor(x / 300)}:${Math.floor(y / 300)}`;

export const parseWorldMapBuildingFeatures = (xml) => {
  const features = [];
  for (const cellMatch of xml.matchAll(/<cell x="(-?\d+)" y="(-?\d+)">([\s\S]*?)<\/cell>/g)) {
    const cellX = Number(cellMatch[1]);
    const cellY = Number(cellMatch[2]);
    for (const featureMatch of cellMatch[3].matchAll(/<feature>([\s\S]*?)<\/feature>/g)) {
      const body = featureMatch[1];
      const properties = Object.fromEntries([...body.matchAll(
        /<property name="([^"]+)" value="([^"]*)"\/>/g,
      )].map((match) => [match[1], match[2]]));
      if (!properties.RoomTone && !properties.building) continue;
      const points = [...body.matchAll(
        /<point x="(-?\d+(?:\.\d+)?)" y="(-?\d+(?:\.\d+)?)"\/>/g,
      )].map((match) => [
        cellX * 300 + Number(match[1]),
        cellY * 300 + Number(match[2]),
      ]);
      if (points.length === 0) continue;
      const bounds = getBounds(points);
      features.push({
        id: features.length,
        subtype: properties.RoomTone || properties.building,
        buildingType: properties.building || "",
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
        bounds,
      });
    }
  }
  return features;
};

const matchBuildingsToFeatures = (buildings, features) => {
  const featureGrid = new Map();
  for (const feature of features) {
    const key = gridKey(feature.x, feature.y);
    const bucket = featureGrid.get(key) ?? [];
    bucket.push(feature);
    featureGrid.set(key, bucket);
  }
  const usedFeatures = new Set();
  return buildings.map((building) => {
    const gridX = Math.floor(building.x / 300);
    const gridY = Math.floor(building.y / 300);
    const candidates = [];
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        candidates.push(...(featureGrid.get(`${gridX + offsetX}:${gridY + offsetY}`) ?? []));
      }
    }
    const ranked = candidates
      .filter((feature) => !usedFeatures.has(feature.id))
      .map((feature) => ({
        feature,
        overlaps: intersects(building.bounds, feature.bounds, 2),
        distance: distance(building, feature),
      }))
      .filter((candidate) => candidate.overlaps || candidate.distance <= 100)
      .sort((left, right) => Number(right.overlaps) - Number(left.overlaps) || left.distance - right.distance);
    const feature = ranked[0]?.feature;
    if (feature) usedFeatures.add(feature.id);
    return { building, feature };
  });
};

export const buildMapBuildingLocations = ({ buildings, worldMapXml, towns, buildingLootProfileIds }) => {
  const features = parseWorldMapBuildingFeatures(worldMapXml);
  const matches = matchBuildingsToFeatures(buildings, features);
  const counters = new Map();
  let matchedFeatures = 0;
  const nearestTown = (x, y) => towns.reduce((nearest, town) => {
    const candidateDistance = Math.hypot(town.x - x, town.y - y);
    return candidateDistance < nearest.distance ? { town, distance: candidateDistance } : nearest;
  }, { town: towns[0], distance: Number.POSITIVE_INFINITY }).town;

  const locations = matches.map(({ building, feature }) => {
    if (feature) matchedFeatures += 1;
    const classification = classifyMapBuilding(feature?.subtype ?? "", building.roomTypes);
    const town = nearestTown(building.x, building.y);
    const counterKey = `${town.id}:${classification.label}`;
    const count = (counters.get(counterKey) ?? 0) + 1;
    counters.set(counterKey, count);
    return {
      id: building.id,
      name: `${town.name} ${classification.label}${count > 1 ? ` ${count}` : ""}`,
      category: classification.category,
      label: classification.label,
      subtype: feature?.subtype || classification.category,
      buildingType: feature?.buildingType || classification.category,
      lootProfileIds: buildingLootProfileIds.get(building.id) ?? [],
      roomTypes: building.roomTypes,
      floors: building.floors,
      roomCount: building.roomCount,
      bounds: [building.bounds.minX, building.bounds.minY, building.bounds.maxX, building.bounds.maxY],
      townId: town.id,
      town: town.name,
      x: building.x,
      y: building.y,
    };
  });
  return { locations, matchedFeatures, totalFeatures: features.length };
};
