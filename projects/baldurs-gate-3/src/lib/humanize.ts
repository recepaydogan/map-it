/**
 * Turns a raw data token ("HeavyCrossbows", "Melee Main Weapon", "TWO_HANDED")
 * into readable words. Used wherever extracted game data reaches the UI without
 * a translation of its own.
 */
export const humanize = (value: string) => value
  .replaceAll("_", " ")
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replace(/\s+/g, " ")
  .trim();
