// Build-time acquisition links. Only outputs belong here: keys, offerings,
// recipe ingredients and vendor currency are not items a location gives you.
export function createLocationSearchData({ items, characters, traders, resourceNodes, rooms = [], creatureTransitions = {} }) {
  const nameOf = (pointer) => typeof pointer?.name === 'string' ? pointer.name : null
  const cleanPrefab = (name) => name?.replace(/\s*\(\d+\)$/, '').toLowerCase()
  const cache = new Map()

  function termsFor(contents, visiting = new Set()) {
    if (!contents || visiting.has(contents)) return { searchTerms: [], itemSources: [] }
    if (cache.has(contents)) return cache.get(contents)
    visiting.add(contents)
    const terms = new Set()
    const itemSources = new Map()
    const addSource = (source) => itemSources.set(`${source.itemPrefab.toLowerCase()}:${source.kind}:${source.sourcePrefab.toLowerCase()}`, source)
    const add = (text) => { if (text) terms.add(text) }
    const addItem = (prefab, kind, sourcePrefab) => {
      if (!prefab) return
      add(prefab)
      add(items[prefab.toLowerCase()]?.name)
      if (kind) addSource({ itemPrefab: prefab, kind, sourcePrefab: sourcePrefab || prefab })
    }
    const addTable = (table, kind, sourcePrefab) => {
      if (!table || table.dropChance === 0 || table.dropMax === 0) return
      for (const drop of table.drops ?? []) {
        if (drop.stackMax !== 0) addItem(nameOf(drop.item), kind, sourcePrefab)
      }
    }
    const visitedCreatures = new Set()
    const addCreature = (prefab) => {
      if (!prefab || visitedCreatures.has(prefab.toLowerCase())) return
      visitedCreatures.add(prefab.toLowerCase())
      add(prefab)
      const creature = characters[prefab.toLowerCase()]
      add(creature?.name)
      for (const drop of creature?.drops ?? []) {
        if (drop.chance !== 0 && drop.amountMax !== 0 && !characters[drop.prefabName.toLowerCase()]) addItem(drop.prefabName, creature.boss ? 'boss' : 'creature', creature.prefabName ?? prefab)
      }
      for (const target of creatureTransitions[prefab.toLowerCase()] ?? []) addCreature(target)
    }
    const addNode = (prefab) => {
      const node = resourceNodes[cleanPrefab(prefab)]
      for (const item of node?.items ?? []) {
        if (item.chance > 0 && item.amountMax > 0) addItem(item.prefabName,
          node.kind?.startsWith('pickable') ? 'pickable' : 'destructible', node.prefabName ?? prefab)
      }
    }
    for (const reference of contents.referencedAssets ?? []) {
      const key = cleanPrefab(reference.name)
      const trader = traders[key]
      if (trader) {
        add(trader.prefabName)
        add(trader.name)
        for (const item of trader.items) addItem(item.prefabName, 'trader', trader.prefabName)
      }
      if (characters[key]) addCreature(key)
      addNode(key)
    }
    for (const component of contents.semanticComponents ?? []) {
      const data = component.data ?? {}
      const kind = component.kind
      addNode(component.objectName)
      if (kind === 'creature-spawner') addCreature(nameOf(data.creaturePrefab))
      if (kind === 'spawn-area' || (kind === 'other' && data.prefabs &&
        (data.spawnInterval !== undefined || data.spawnIntervalSec !== undefined))) {
        for (const entry of data.prefabs ?? []) addCreature(nameOf(entry.prefab))
      }
      if (kind === 'spawner') addCreature(nameOf(data.spawn))
      if (kind === 'boss-altar' && !component.objectName?.toLowerCase().includes('memorial')) {
        addCreature(component.objectName === 'offeraltar_FrozenKing' ? 'FrozenKing' : nameOf(data.bossPrefab))
        addItem(nameOf(data.itemPrefab), 'pickable', component.objectName)
      }
      if (kind === 'pickable' || kind === 'pickable-item' ||
        (kind === 'other' && data.randomItemPrefabs && data.itemPrefab)) {
        addItem(nameOf(data.itemPrefab), 'pickable', component.objectName)
        addTable(data.extraDrops, 'pickable', component.objectName)
        for (const entry of data.randomItemPrefabs ?? []) addItem(nameOf(entry.itemPrefab), 'pickable', component.objectName)
      }
      // Older extraction dumps classified containers and dungeon generators as
      // "other"; recognize their distinctive fields without indexing all refs.
      if (kind === 'container' || (kind === 'other' && data.width && data.height && data.defaultItems)) {
        addTable(data.defaultItems, 'loot', component.objectName)
      }
      if (['drop-on-destroyed', 'tree', 'tree-log'].includes(kind)) addTable(data.dropWhenDestroyed, 'destructible', component.objectName)
      if (kind === 'mine-rock') addTable(data.dropItems, 'destructible', component.objectName)
      if (kind === 'destructible') {
        const spawned = nameOf(data.spawnWhenDestroyed)
        addNode(spawned)
        if (characters[cleanPrefab(spawned)]) addCreature(spawned)
        if (items[cleanPrefab(spawned)]) addItem(spawned, 'destructible', component.objectName)
      }
      if (kind === 'tree') addNode(nameOf(data.logPrefab))
      if (kind === 'tree-log') addNode(nameOf(data.subLogPrefab))
      if (kind === 'dungeon' || (kind === 'other' && data.themes !== undefined && data.maxRooms !== undefined)) {
        for (const room of rooms) {
          if ((room.themes & data.themes) === 0 || room.enabled === false) continue
          const nested = termsFor(room, visiting)
          for (const term of nested.searchTerms) add(term)
          for (const source of nested.itemSources) addSource(source)
        }
      }
    }
    visiting.delete(contents)
    const result = {
      searchTerms: [...terms].sort((a, b) => a.localeCompare(b, 'en')),
      itemSources: [...itemSources.values()].sort((a, b) => `${a.itemPrefab}:${a.kind}:${a.sourcePrefab}`.localeCompare(`${b.itemPrefab}:${b.kind}:${b.sourcePrefab}`, 'en')),
    }
    cache.set(contents, result)
    return result
  }
  return (contents) => termsFor(contents)
}

export function createLocationSearchTerms(catalog) {
  const dataFor = createLocationSearchData(catalog)
  return (contents) => dataFor(contents).searchTerms
}
