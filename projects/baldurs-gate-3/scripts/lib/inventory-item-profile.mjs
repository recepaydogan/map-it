// Resolve from the exact inventory UUID, then the authored template defaults.
// Never reverse-search all Stats sharing a root and choose the highest rarity.
export const createInventoryOwnerResolver = (members) => {
  const characters = new Map(members.map((member) => [member.id, member.characterId]));
  return (entity) => entity.storyDestination?.characterContentId
    ?? characters.get(entity.partyMember?.memberId) ?? entity.id;
};

export const createInventoryItemProfiler = ({ objectForId, templateForId, statForId, fallbackTitle }) => (entry) => {
  const object = entry.objectId ? objectForId(entry.objectId) : undefined;
  const templateId = object?.templateId || entry.templateId?.toLowerCase();
  const template = templateId ? templateForId(templateId) : undefined;
  const statsId = templateId ? object?.statsId ?? template?.stats : statForId(entry.itemName)?.id;
  const gameplay = statsId ? statForId(statsId) : undefined;
  return {
    itemName: entry.itemName,
    ...(entry.objectId ? { objectId: entry.objectId } : {}),
    ...(templateId ? { templateId } : {}),
    title: object?.displayName?.en || template?.displayName?.en || fallbackTitle(statsId || entry.itemName),
    ...(statsId ? { statsId } : {}),
    ...(gameplay ? { rarity: gameplay.rarity, slot: gameplay.slot, unique: gameplay.unique } : {}),
  };
};
