const SPIRIT_ASH_BLOCKED_CATEGORIES = new Set([
  "evergaol-boss",
  "invasion",
]);

// Sources disagree on whether the Forlorn Hound Evergaol's unique summon
// exception extends from Blaidd to Spirit Ashes. Keep the advice visible rather
// than hiding a potentially valid option.
const SPIRIT_ASH_PERMISSIVE_MARKERS = new Set([
  "boss:1044350800",
  "er-boss-1044350800",
]);

/**
 * Remains permissive unless the encounter type is known to disable Spirit Ashes.
 * Unknown and ordinary boss categories stay enabled to avoid hiding valid advice.
 */
export const canRecommendSpiritAsh = (category: string, markerId: string): boolean =>
  SPIRIT_ASH_PERMISSIVE_MARKERS.has(markerId) || !SPIRIT_ASH_BLOCKED_CATEGORIES.has(category);
