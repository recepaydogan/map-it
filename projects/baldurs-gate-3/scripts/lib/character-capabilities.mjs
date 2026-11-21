/** Preserve authored false values; absence means unknown, not enabled. */
export const readCharacterCapabilities = (object) => {
  const fields = {};
  for (const [native, field] of [["CanFight", "canFight"], ["CanJoinCombat", "canJoinCombat"]]) {
    if (!Object.hasOwn(object, native)) continue;
    const attribute = object[native];
    if (attribute?.type !== "bool" || typeof attribute.value !== "boolean") {
      throw new Error(`Invalid native character capability: ${native}`);
    }
    fields[field] = attribute.value;
  }
  return Object.keys(fields).length ? fields : undefined;
};
