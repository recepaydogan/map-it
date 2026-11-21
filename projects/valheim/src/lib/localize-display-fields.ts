/** Translate human-readable fields while keeping prefab IDs and other keys intact. */
export function localizeDisplayFields<Value>(value: Value, translate: (text: string) => string): Value {
  if (Array.isArray(value)) {
    return value.map((entry) => localizeDisplayFields(entry, translate)) as Value
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      (key === 'name' || key === 'description' || key === 'label' || key === 'bossName' || key === 'forsakenPowerBoss') && typeof entry === 'string'
        ? translate(entry)
        : localizeDisplayFields(entry, translate),
    ])) as Value
  }
  return value
}
