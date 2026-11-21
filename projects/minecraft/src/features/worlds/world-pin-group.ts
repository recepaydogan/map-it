export const CUSTOM_WORLD_PIN_GROUP_PREFIX = "custom:";

export const createCustomWorldPinGroup = (name: string): string | null => {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, 60);
  return trimmed ? `${CUSTOM_WORLD_PIN_GROUP_PREFIX}${trimmed}` : null;
};

export const customWorldPinGroupName = (group: string): string | null =>
  group.startsWith(CUSTOM_WORLD_PIN_GROUP_PREFIX)
    ? group.slice(CUSTOM_WORLD_PIN_GROUP_PREFIX.length)
    : null;
