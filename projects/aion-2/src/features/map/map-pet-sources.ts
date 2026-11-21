import type { MapLocation, MapPoint } from "./types";

export interface MapPetSource {
  id: string;
  name: string;
  icon: string;
  category: string;
}

export interface MapPetSourceCatalog {
  version: 1;
  pets: Record<string, MapPetSource>;
  sources: Record<string, {
    references: Record<string, string[]>;
    markers: Record<string, string[]>;
  }>;
}

export const petFilterId = (petId: string) => `pet:${petId}`;

export function attachMapPetSources(locations: MapLocation[], catalog: MapPetSourceCatalog, mapId: string): MapLocation[] {
  const sources = catalog.sources[mapId];
  return locations.map((point) => {
    // Published catalogs may still contain pets inferred from a chest at an event object.
    if (point.category === "event-object") return point;
    const ids = [...(point.reference ? sources?.references[point.reference.id] ?? [] : []),
      ...[point.id, ...point.aliasIds ?? []].flatMap(id => sources?.markers[id] ?? [])];
    const catalogPets = [...new Set(ids)].map(id => catalog.pets[id]);
    if (catalogPets.some(source => !source)) throw new Error(`Missing pet source details for ${point.id}.`);
    const petSources = [...new Map([...point.companionSources?.map(({ companion }) => companion) ?? [], ...catalogPets]
      .map(source => [source.id, source])).values()];
    if (!petSources.length) return point;
    return { ...point, petSources };
  });
}

export function getMapPetSources(point: MapPoint): MapPetSource[] {
  return "petSources" in point ? point.petSources ?? [] : [];
}

export function listMapPetSources(points: MapPoint[]): MapPetSource[] {
  const pets = new Map<string, MapPetSource>();
  for (const point of points) for (const pet of getMapPetSources(point)) pets.set(pet.id, pet);
  return [...pets.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
