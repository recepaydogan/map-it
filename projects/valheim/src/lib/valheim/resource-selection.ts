export const MAX_SELECTED_RESOURCE_MATERIALS = 3

// SeekerBrood and IceShoreShard are internal spawn/drop ids without a usable
// item name or icon; they are not selectable materials for the player.
const HIDDEN_RESOURCE_MATERIALS = new Set(['wood', 'resin', 'stone', 'feathers', 'amberpearl', 'seekerbrood', 'iceshoreshard'])

export const isResourceFilterMaterial = (itemPrefab: string): boolean =>
  !HIDDEN_RESOURCE_MATERIALS.has(itemPrefab.toLowerCase())

/** Also normalizes selections restored from older persisted map-filter state. */
export function normalizeResourceSelection(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && isResourceFilterMaterial(entry)))]
    .slice(0, MAX_SELECTED_RESOURCE_MATERIALS)
}

/** Selecting a fourth material replaces the oldest selection. */
export function toggleResourceSelection(current: readonly string[], itemPrefab: string): string[] {
  const selected = normalizeResourceSelection(current)
  if (selected.includes(itemPrefab)) return selected.filter((item) => item !== itemPrefab)
  if (!isResourceFilterMaterial(itemPrefab)) return selected
  return [...selected, itemPrefab].slice(-MAX_SELECTED_RESOURCE_MATERIALS)
}
