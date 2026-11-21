// Public marker IDs are persistent user-data keys, not coordinates. A reviewed
// replacement changes the source anchor while retaining the published identity.
export const createReviewedDestinationCorrections = (corrections = [], catalog) => {
  const playable = new Set(catalog.scriptedDestinations.map(({ character, anchor }) => `${character.id}/${anchor.id}`));
  const identities = new Set();
  const mapActors = new Set();
  for (const correction of corrections) {
    if (correction.contentId !== `${correction.characterId}:destination:${correction.previousAnchorId}`
      || !correction.sourceMapId || !correction.reason || !correction.destinations?.length || identities.has(correction.contentId)) {
      throw new Error("Invalid or duplicate reviewed destination correction");
    }
    identities.add(correction.contentId);
    if (correction.presentation && (correction.presentation.kind !== "point-of-interest" || correction.presentation.omitGameplay !== true)) {
      throw new Error("Unsupported reviewed destination presentation");
    }
    for (const target of correction.destinations) {
      const key = `${target.mapId}/${correction.characterId}`;
      if (!target.mapId || mapActors.has(key) || !playable.has(`${correction.characterId}/${target.anchorId}`)) {
        throw new Error(`Correction requires a unique, normal-source destination: ${key}/${target.anchorId}`);
      }
      mapActors.add(key);
    }
  }
  const forMap = (mapId) => corrections.flatMap((correction) => correction.destinations
    .filter((target) => target.mapId === mapId).map((target) => ({ ...correction, ...target })));
  const covers = (mapId, entity) => corrections.some((correction) => correction.sourceMapId === mapId
    && correction.contentId === entity.id && correction.characterId === entity.storyDestination?.characterContentId
    && correction.previousAnchorId === entity.storyDestination?.anchorContentId);
  const participatingMaps = (correction) => new Set([correction.sourceMapId, ...correction.destinations.map(({ mapId }) => mapId)]);
  const assertRebuildScope = (requested, readEntities) => {
    for (const correction of corrections) {
      const participants = participatingMaps(correction);
      if (![...participants].some((mapId) => requested.has(mapId))) continue;
      const previous = readEntities(correction.sourceMapId).find(({ id }) => id === correction.contentId);
      if (previous?.storyDestination?.anchorContentId !== correction.previousAnchorId) continue;
      const missing = [...participants].filter((mapId) => !requested.has(mapId));
      if (missing.length) throw new Error(`Rebuild the complete correction together before replacing ${correction.contentId}: ${missing.join(", ")}`);
    }
  };
  const assertPublished = (requested, readEntities) => {
    for (const correction of corrections) {
      if (![...participatingMaps(correction)].some((mapId) => requested.has(mapId))) continue;
      for (const target of correction.destinations) {
        const entity = readEntities(target.mapId).find(({ id }) => id === correction.contentId);
        if (entity?.storyDestination?.anchorContentId !== target.anchorId
          || entity.storyDestination.characterContentId !== correction.characterId) {
          throw new Error(`Corrected marker missing at ${target.mapId}/${correction.contentId}; do not consider this rebuild complete`);
        }
      }
      if (!correction.destinations.some(({ mapId }) => mapId === correction.sourceMapId)
        && readEntities(correction.sourceMapId).some(({ id }) => id === correction.contentId)) {
        throw new Error(`Obsolete source appearance remains at ${correction.sourceMapId}/${correction.contentId}`);
      }
    }
  };
  return { forMap, covers, assertRebuildScope, assertPublished };
};
