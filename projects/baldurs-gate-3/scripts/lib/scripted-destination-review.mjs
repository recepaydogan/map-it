const identity = (characterId, anchorId) => `${characterId}/${anchorId}`;

export const createScriptedDestinationReview = (catalog) => {
  const playable = new Set((catalog.scriptedDestinations ?? [])
    .map(({ character, anchor }) => identity(character.id, anchor.id)));
  const debug = Map.groupBy(catalog.excludedScriptedDestinations ?? [], ({ character, anchor }) => identity(character.id, anchor.id));
  return (destination) => {
    const key = identity(destination.characterContentId, destination.anchorContentId);
    const excludedSourceStatements = debug.get(key) ?? [];
    return { status: playable.has(key) ? "has-playable-source-statement"
      : excludedSourceStatements.length ? "requires-source-rule-review" : "missing-catalog-relation",
    excludedSourceStatements };
  };
};

// Losing debug evidence does not prove an existing location is fictitious.
// Require a reviewed decision before any generator can silently remove it.
export const assertScriptedDestinationsReviewed = (mapId, entities, review, excludedObjectIds = [], corrections) => {
  const exclusions = new Set(excludedObjectIds);
  const pending = entities.filter(({ id, storyDestination }) => storyDestination
    && !exclusions.has(id) && !corrections?.covers(mapId, { id, storyDestination })
    && review(storyDestination).status !== "has-playable-source-statement");
  if (pending.length) throw new Error(`Source-rule review required before rebuilding ${mapId}: ${pending.map(({ id }) => id).join(", ")}. Verify normal story anchors or record an explicit reviewed exclusion; do not silently remove these existing markers.`);
};
