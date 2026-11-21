/**
 * ER map text dictionary — flat { englishText: localizedText } per language,
 * built by data/src/build-er-map-i18n.mjs from the game's own FMG tables.
 *
 * The test map streams its markers from public/data/er-map/ with English text
 * baked in (that data is the frozen source of truth for structure), so — like the
 * Nightreign overlay — localization is a display-time lookup by the exact English
 * string. A string with no entry keeps its English text.
 *
 * `erMapText` is a LIVE BINDING swapped by `applyErMapTextOverlay` (called from
 * data/localized-data.ts BEFORE the UI language flips, so consumers re-render with
 * the dictionary already in place).
 */
export type ErMapTextOverlay = Record<string, string>;

export let erMapText: ErMapTextOverlay | null = null;

/** Swap to a language's dictionary (or back to English with `null`). */
export const applyErMapTextOverlay = (ov: ErMapTextOverlay | null): void => {
  erMapText = ov;
};

/** Localize one baked ER-map string; English (or unknown) text passes through. */
export const localizeErMapText = (text: string): string => erMapText?.[text] ?? text;
