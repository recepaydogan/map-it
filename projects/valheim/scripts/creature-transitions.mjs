// Follow actual spawned characters, never name suffixes, equipment or VFX.
export function collectEncounterDrops(prefab, characters, transitions) {
  const visited = new Set()
  const drops = []
  const visit = (name) => {
    const key = name.toLowerCase()
    if (visited.has(key)) return
    visited.add(key)
    for (const drop of characters[key]?.drops ?? []) {
      if ((drop.chance ?? 1) > 0 && (drop.amountMax ?? drop.amountMin ?? 1) > 0) drops.push(drop)
    }
    for (const next of transitions[key] ?? []) visit(next)
  }
  visit(prefab)
  return drops
}

export function extractCreatureTransitions(characters) {
  const known = new Map(characters.map((character) => [character.prefabName.toLowerCase(), character.prefabName]))
  return Object.fromEntries(characters.map((character) => {
    const targets = new Set()
    const add = (prefab) => {
      const target = known.get(prefab?.toLowerCase())
      if (target && target !== character.prefabName) targets.add(target)
    }
    for (const component of character.components ?? []) {
      if (component.kind === 'character') {
        for (const effect of component.data?.deathEffects?.effectPrefabs ?? []) {
          if (effect.enabled !== 0 && effect.enabled !== false) add(effect.prefab?.name)
        }
      }
      if (component.kind === 'drops') {
        for (const drop of component.data?.drops ?? []) {
          if ((drop.chance ?? 1) > 0 && (drop.amountMax ?? drop.amountMin ?? 1) > 0) add(drop.prefab?.name)
        }
      }
    }
    return [character.prefabName.toLowerCase(), [...targets]]
  }).filter(([, targets]) => targets.length))
}
