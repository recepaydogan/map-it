export interface NearbyCreatureCatalogEntry {
  prefab: string
  label: string
  nameToken: string | null
}

export const normalizeCreaturePrefab = (prefab: string) => prefab.trim().toLowerCase()

/** Valheim names can contain Unity rich-text such as <color=orange>…</color>. */
export const cleanCreatureLabel = (label: string) => label
  .replace(/<[^>]*>/g, '')
  .replace(/\s+/g, ' ')
  .trim()

export const readableCreaturePrefab = (prefab: string) => prefab
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase())

export function createNearbyCreatureCatalog(
  creatures: readonly { prefab: string; nameToken?: string | null; label?: string | null }[],
): NearbyCreatureCatalogEntry[] {
  return creatures
    .map((creature) => ({
      prefab: creature.prefab,
      label: cleanCreatureLabel(creature.label || readableCreaturePrefab(creature.prefab)),
      nameToken: creature.nameToken ?? null,
    }))
    .sort((first, second) => first.label.localeCompare(second.label, 'en'))
}
