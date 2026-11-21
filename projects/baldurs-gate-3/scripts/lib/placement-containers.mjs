const CHEST_FAMILY_PATTERN = /(?:^|[_\W])chests?(?:$|[_\W])/i;
export const CONTAINER_FAMILY_PATTERN = /container|chest|barrel|crate|sack|coffin|sarcophag/i;
const OTHER_CONTAINER_PATTERN = /(?:^|[_\W])(?:wardrobes?|cupboards?|cabinets?|bookshel(?:f|ves)|barrels?|crates?|coffins?|sarcophag\w*|nests?|baskets?|pots?|tanks?|vats?|cages?|safes?|box(?:es)?|display cases?)(?:$|[_\W])/i;
const words = (text) => (text ?? "").replace(/([a-z])([A-Z])/g, "$1 $2");

/** Identify the physical container, independently of extracted loot contents. */
export const isChestRecord = (record) => {
  if (record.placementKind !== "items") return false;
  if (["Armor", "Weapon"].includes(record.gameplay?.type)) return false;
  const statsIdentity = [record.stats, record.gameplay?.id].filter(Boolean).join(" ");
  if (/key/i.test(statsIdentity)) return false;
  // Destructible cupboards and barrels can reuse a chest's stat family.
  // Their authored physical identity takes precedence over that family.
  const title = words(record.displayName?.en);
  const physicalIdentity = `${words(record.internalName)} ${title}`;
  if (!CHEST_FAMILY_PATTERN.test(title) && OTHER_CONTAINER_PATTERN.test(title)) return false;
  if (!CHEST_FAMILY_PATTERN.test(physicalIdentity) && OTHER_CONTAINER_PATTERN.test(physicalIdentity)) return false;
  if (CHEST_FAMILY_PATTERN.test(statsIdentity)) return true;
  if (statsIdentity && !CONTAINER_FAMILY_PATTERN.test(statsIdentity)) return false;
  return CHEST_FAMILY_PATTERN.test(physicalIdentity);
};
