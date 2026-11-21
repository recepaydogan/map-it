const kinds = new Set(['pickable', 'pickable-item', 'mine-rock', 'tree', 'tree-log', 'destructible', 'drop-on-destroyed'])

/** Resource prefabs have internal ids, not display-name tokens in Valheim. */
export function resourceSourceLabel(
  kind: string | undefined,
  itemName: string,
  translate: (key: string, options: { item: string }) => string,
): string {
  const labelKind = kind && kinds.has(kind) ? kind : 'unknown'
  return translate(`itemSources.resourceKinds.${labelKind}`, { item: itemName })
}
