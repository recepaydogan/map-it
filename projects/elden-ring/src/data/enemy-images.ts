import { enemyPortraitUrl } from "../utils/assets";
import enemyImages from "./generated/er-enemy-images.json";

/**
 * Portrait screenshots for the regular enemies placed on the TEST MAP (the four
 * enemy taxonomy categories), in the same uniform 720×405 style as the boss
 * portraits. Keyed by slug(baseName(name)) — the TEST MAP renders raw MSB enemy
 * names (stable English, never localized), so the slug is a locale-proof key and
 * every location-variant of one enemy shares a single portrait.
 *
 * The webp set ships from public/ (offline-safe); refresh/extend it via
 * data/src/fetch-er-enemy-images.mjs. The base-name/slug normalization below MUST
 * stay in lockstep with that script so lookups line up with the emitted keys.
 */
const baseNameOf = (name: string): string =>
  name
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*\{[^}]*\}\s*/g, " ")
    .replace(/\s+-\s+.*$/, "")
    .replace(/\s+Both$/, "")
    .replace(/\s+Healthbar$/i, "")
    .replace(/\s+/g, " ")
    .trim();

const slugOf = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const enemyImageFor = (name: string | undefined | null): string | null => {
  if (!name) return null;
  const file = (enemyImages as Record<string, string>)[slugOf(baseNameOf(name))];
  return file ? enemyPortraitUrl(file) : null;
};
