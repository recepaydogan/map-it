const evidenceKey = ({ sourcePath, sourceLine, statement }) => `${sourcePath}:${sourceLine}:${statement}`;

export const mergeStoryDestinationEvidence = (evidence) => [...new Map(evidence.map((entry) => [evidenceKey(entry), entry])).values()];

// Callers supply only source-validated anchors that belong to this map/floor.
// Alternate locations must never contribute evidence to the selected location.
export const createStoryDestinationProfile = ({ characterId, anchorId, anchorName, relations, correctedFromAnchorId }) => {
  if (relations.some(({ character }) => character.id !== characterId)) throw new Error("Mixed characters in destination profile");
  const selected = relations.filter(({ anchor }) => anchor.id === anchorId);
  const evidence = mergeStoryDestinationEvidence(selected.flatMap(({ evidence }) => evidence));
  if (!selected.length || !evidence.length) throw new Error(`Missing source evidence for destination ${characterId}/${anchorId}`);
  const camps = [...new Set(selected.map(({ camp }) => camp).filter(Boolean))];
  const contexts = (field) => [...new Map(selected.filter((relation) => relation[field])
    .map((relation) => [JSON.stringify(relation[field]), relation[field]])).values()];
  const campEntryContexts = contexts("campEntryContext"), campResidentContexts = contexts("campResidentContext");
  const alternate = relations.filter(({ anchor }) => anchor.id !== anchorId);
  return {
    characterContentId: characterId,
    anchorContentId: anchorId,
    anchorName,
    ...(correctedFromAnchorId ? { correctedFromAnchorId } : {}),
    ...(camps.length ? { camps } : {}),
    ...(campEntryContexts.length ? { campEntryContexts } : {}),
    ...(campResidentContexts.length ? { campResidentContexts } : {}),
    kinds: [...new Set(selected.map(({ kind }) => kind))],
    ...(selected.every(({ arrivalState }) => arrivalState === "corpse") ? {
      arrivalState: "corpse",
      arrivalEvidence: mergeStoryDestinationEvidence(selected.flatMap(({ arrivalEvidence }) => arrivalEvidence ?? [])),
    } : {}),
    otherAnchorContentIds: [...new Set(alternate.map(({ anchor }) => anchor.id))],
    alternateDestinations: alternate.map(({ anchor, kind, evidence }) => ({ anchorContentId: anchor.id, kind, evidence })),
    evidence,
  };
};
