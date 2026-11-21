import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMarkerIntelligence } from '../hooks/use-marker-intelligence'
import ItemCatalog, { ItemCatalogCategory } from './layout/item-catalog'
import type { MarkerItemIntel } from '../types/marker-intelligence'
import { DatabaseItemDetail } from './database-item-detail'
import type { ItemSourceViewProps } from './item-acquisition-sections'

type DatabaseCategory = 'all' | 'weapons' | 'armor' | 'food' | 'materials' | 'craftable'
const CATEGORY_ITEMS: Readonly<Partial<Record<DatabaseCategory, string>>> = {
  weapons: 'SwordIron',
  armor: 'HelmetIron',
  food: 'CookedMeat',
  materials: 'Wood',
  craftable: 'Hammer',
}

const WEAPON_TYPES = new Set(['oneHandedWeapon', 'twoHandedWeapon', 'bow', 'polearm', 'torch', 'tool', 'ammo'])
const ARMOR_TYPES = new Set(['helmet', 'chestArmor', 'legArmor', 'handArmor', 'shoulderArmor', 'shield'])
const FOOD_TYPES = new Set(['consumable', 'fish'])

const matchesCategory = (item: MarkerItemIntel, category: DatabaseCategory) => {
  if (category === 'all') return true
  if (category === 'weapons') return WEAPON_TYPES.has(item.type ?? '')
  if (category === 'armor') return ARMOR_TYPES.has(item.type ?? '')
  if (category === 'food') return FOOD_TYPES.has(item.type ?? '') && Boolean(item.food || item.foodStamina || item.foodEitr)
  if (category === 'materials') return item.type === 'material'
  return Boolean(item.craftedBy?.length)
}

interface DatabasePanelProps extends ItemSourceViewProps {
  onAddToPlanner?: (prefabName: string) => void
}

export function DatabasePanel({ onAddToPlanner, ...sourceProps }: DatabasePanelProps) {
  const { i18n, t } = useTranslation()
  const intelligence = useMarkerIntelligence()
  const [category, setCategory] = useState<DatabaseCategory>('all')
  const [query, setQuery] = useState('')
  const [selectedPrefab, setSelectedPrefab] = useState<string | null>(null)
  const items = useMemo(() => Object.values(intelligence.catalog?.items ?? {})
    .filter((item) => item.name && item.icon)
    .sort((first, second) => first.name.localeCompare(second.name)), [intelligence.catalog])
  const categories = useMemo(() => (
    (['all', 'weapons', 'armor', 'food', 'materials', 'craftable'] as const).map((key) => {
      const matches = items.filter((item) => matchesCategory(item, key))
      const representative = matches.find((item) => item.prefabName === CATEGORY_ITEMS[key]) ?? matches[0]
      return { key, count: matches.length, icon: representative?.icon }
    })
  ), [items])
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return items.filter((item) => matchesCategory(item, category) && (
      !normalizedQuery || item.name.toLowerCase().includes(normalizedQuery) ||
      item.description.toLowerCase().includes(normalizedQuery)
    ))
  }, [category, items, query])
  const selected = items.find((item) => item.prefabName === selectedPrefab)
    ?? null

  const selectItem = (item: MarkerItemIntel) => {
    setSelectedPrefab(item.prefabName)
    if (!matchesCategory(item, category)) setCategory('all')
    if (query && !item.name.toLowerCase().includes(query.toLowerCase())) setQuery('')
  }

  const selectCategory = (key: DatabaseCategory) => { setCategory(key); setSelectedPrefab(null) }

  return (
    <ItemCatalog
      label={t('database.title')} gameName="Valheim" artwork="/item-catalog-art.webp"
      search={{ query, label: t('database.search'), clearLabel: t('database.clearSearch'),
        onChange: (value) => { setQuery(value); setSelectedPrefab(null) } }}
      categoryLabel={t('database.categories')}
      landingCategories={categories.map(({ key, icon, count }) => ({
        id: key, label: t('database.categoriesList.' + key),
        icon: icon && <img src={icon} alt="" width={52} height={52} draggable={false} />,
        count: count.toLocaleString(i18n.language), onSelect: () => selectCategory(key),
      }))}
      categories={categories.map(({ key, count }) => (
        <ItemCatalogCategory key={key} label={t('database.categoriesList.' + key)}
          count={count.toLocaleString(i18n.language)} active={category === key} onSelect={() => selectCategory(key)} />
      ))}
      columns={[{ label: t('database.categories') }]}
      rows={filtered.map((item) => {
        const type = t('item.types.' + item.type, { defaultValue: item.type ?? t('database.item') })
        return { id: item.prefabName, label: item.name, subtitle: type, cells: [type],
          icon: <img src={item.icon ?? ''} alt="" loading="lazy" className="size-8 object-contain" /> }
      })}
      onOpen={setSelectedPrefab} onBack={() => setSelectedPrefab(null)}
      backLabel={t('database.categoriesList.all')}
      detail={selected && <DatabaseItemDetail key={selected.prefabName} item={selected}
        items={intelligence.catalog?.items ?? {}} onSelectItem={selectItem} onAddToPlanner={onAddToPlanner} {...sourceProps} />}
      emptyMessage={t(intelligence.loading ? 'common.loading' : 'database.noResults')}
    />
  )
}
