import type { MapItemCatalogEntry, MapLocation, MapLootProfile, MapMetadata } from "./types";

const LOW_VALUE_LOOT_ITEM_IDS = new Set([
  "Base.BathTowel",
  "Base.BusinessCard",
  "Base.DishCloth",
  "Base.Doodle",
  "Base.DoodleKids",
  "Base.Flier",
  "Base.GenericMail",
  "Base.IDcard",
  "Base.IDcard_Blank",
  "Base.IDcard_Female",
  "Base.IDcard_Male",
  "Base.LetterHandwritten",
  "Base.Newspaper",
  "Base.Note",
  "Base.OfficialDocument",
  "Base.Paperwork",
  "Base.ParkingTicket",
  "Base.Phonebook",
  "Base.Photo",
  "Base.Postcard",
  "Base.Receipt",
  "Base.SpeedingTicket",
  "Base.Sponge",
  "Base.ToiletBrush",
]);

const isUsefulLocationHighlight = (item: MapItemCatalogEntry | undefined) =>
  !item || !LOW_VALUE_LOOT_ITEM_IDS.has(item.id);

export const getLocationLootProfileIds = (location: MapLocation) => location.lootProfileIds
  ?? (location.lootProfileId ? [location.lootProfileId] : []);

export const createMapItemLookup = (items: MapItemCatalogEntry[] | undefined) => new Map(
  (items ?? []).map((item) => [item.id, item]),
);

export const mergeLocationLootProfile = (
  location: MapLocation,
  data: Pick<MapMetadata, "items" | "lootProfiles">,
): MapLootProfile | undefined => {
  if (!data.lootProfiles) return undefined;
  const profileIds = [...new Set(getLocationLootProfileIds(location))];
  const itemLookup = createMapItemLookup(data.items);
  const scores = new Map<string, number>();
  let matchedDistributions = 0;
  for (const profileId of profileIds) {
    const profile = data.lootProfiles[profileId];
    if (!profile) continue;
    matchedDistributions += profile.matchedDistributions;
    // Probability controls ordering only. A low score can identify the rare
    // item a player is specifically looking for, so it must remain discoverable.
    for (const item of profile.items) {
      if (!isUsefulLocationHighlight(itemLookup.get(item.id))) continue;
      scores.set(item.id, Math.max(scores.get(item.id) ?? 0, item.weight));
    }
  }
  if (scores.size === 0) return undefined;
  return {
    id: `building:${location.id}`,
    matchedDistributions,
    items: [...scores]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([id, weight]) => ({
        id,
        name: itemLookup.get(id)?.name ?? id.replace(/^.*[.]/, ""),
        weight,
      })),
  };
};
