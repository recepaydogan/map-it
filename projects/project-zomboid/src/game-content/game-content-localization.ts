import type { MapMetadata } from "../features/map/types";

export interface GameContentLocaleOverlay {
  items: Record<string, string>;
  recipes: Record<string, string>;
  vehicles: Record<string, string>;
  professions: Record<string, string>;
  towns: Record<string, string>;
}

export const applyGameContentLocale = (
  metadata: MapMetadata,
  overlay: GameContentLocaleOverlay,
): MapMetadata => {
  const townName = (townId: string, fallback: string) => overlay.towns[townId] ?? fallback;
  return {
    ...metadata,
    towns: metadata.towns.map((town) => ({
      ...town,
      name: townName(town.id, town.name),
    })),
    locations: metadata.locations.map((location) => ({
      ...location,
      town: townName(location.townId, location.town),
    })),
    ...(metadata.items && {
      items: metadata.items.map((item) => ({
        ...item,
        name: overlay.items[item.id] ?? item.name,
      })),
    }),
    ...(metadata.crafting && {
      crafting: {
        ...metadata.crafting,
        recipes: metadata.crafting.recipes.map((recipe) => ({
          ...recipe,
          name: overlay.recipes[recipe.id] ?? recipe.name,
        })),
      },
    }),
    ...(metadata.lootProfiles && {
      lootProfiles: Object.fromEntries(Object.entries(metadata.lootProfiles).map(([profileId, profile]) => [
        profileId,
        {
          ...profile,
          items: profile.items.map((item) => ({
            ...item,
            name: overlay.items[item.id] ?? item.name,
          })),
        },
      ])),
    }),
    ...(metadata.vehicleSpawns && {
      vehicleSpawns: {
        ...metadata.vehicleSpawns,
        definitions: metadata.vehicleSpawns.definitions.map((definition) => ({
          ...definition,
          vehicles: definition.vehicles.map((vehicle) => ({
            ...vehicle,
            name: overlay.vehicles[vehicle.id] ?? vehicle.name,
          })),
        })),
      },
    }),
    ...(metadata.spawnPoints && {
      spawnPoints: {
        ...metadata.spawnPoints,
        points: metadata.spawnPoints.points.map((point) => ({
          ...point,
          town: townName(point.townId, point.town),
        })),
        professions: metadata.spawnPoints.professions.map((profession) => ({
          ...profession,
          label: overlay.professions[profession.id] ?? profession.label,
        })),
      },
    }),
  };
};
