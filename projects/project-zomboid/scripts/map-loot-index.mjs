const getLocationProfileIds = (location) => location.lootProfileIds
  ?? (location.lootProfileId ? [location.lootProfileId] : []);

export const buildMapLootIndex = (locations, lootProfiles, globalLootProfileId) => {
  const index = new Map();
  for (const location of locations) {
    const seenAtLocation = new Set();
    for (const profileId of getLocationProfileIds(location)) {
      const profile = lootProfiles[profileId];
      if (!profile) continue;
      for (const item of profile.items) {
        let entry = index.get(item.id);
        if (!entry) {
          entry = { id: item.id, bestWeight: 0, locationCount: 0, profileIds: new Set() };
          index.set(item.id, entry);
        }
        entry.bestWeight = Math.max(entry.bestWeight, item.weight);
        entry.profileIds.add(profileId);
        if (!seenAtLocation.has(item.id)) {
          entry.locationCount += 1;
          seenAtLocation.add(item.id);
        }
      }
    }
  }
  const globalProfile = globalLootProfileId ? lootProfiles[globalLootProfileId] : undefined;
  for (const item of globalProfile?.items ?? []) {
    if (index.has(item.id)) continue;
    index.set(item.id, {
      id: item.id,
      bestWeight: item.weight,
      locationCount: 0,
      profileIds: new Set([globalLootProfileId]),
    });
  }
  for (const [profileId, profile] of Object.entries(lootProfiles)) {
    for (const item of profile.items) {
      let entry = index.get(item.id);
      if (!entry) {
        entry = {
          id: item.id,
          bestWeight: 0,
          locationCount: 0,
          profileIds: new Set(),
        };
        index.set(item.id, entry);
      }
      entry.bestWeight = Math.max(entry.bestWeight, item.weight);
      entry.profileIds.add(profileId);
    }
  }
  return [...index.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((entry) => ({ ...entry, profileIds: [...entry.profileIds].sort() }));
};
