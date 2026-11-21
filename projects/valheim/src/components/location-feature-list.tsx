import {
  ChevronRight,
  DoorOpen,
  Gem,
  PackageOpen,
  PawPrint,
  ScrollText,
  Skull,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGameLocalization } from '../hooks/use-localization-table'
import { cn } from '../lib/cn'
import type { LocationFeature, LocationFeatureKind } from '../lib/location-presentation'
import type { CharacterIntel, MarkerItemIntel } from '../types/marker-intelligence'

interface LocationFeatureListProps {
  characters?: Record<string, CharacterIntel>
  features: LocationFeature[]
  items?: Record<string, MarkerItemIntel>
  onSelectCharacter?: (character: CharacterIntel) => void
  onSelectItem?: (item: MarkerItemIntel) => void
  selectedEntityPrefab?: string | null
}

const iconByKind = {
  boss: Skull,
  creature: PawPrint,
  door: DoorOpen,
  drop: PackageOpen,
  pickable: Gem,
  runestone: ScrollText,
} satisfies Record<LocationFeatureKind, typeof Skull>

type FeatureGroupKey = 'bosses' | 'creatures' | 'loot' | 'pointsOfInterest'

const featureGroupByKind: Record<LocationFeatureKind, FeatureGroupKey> = {
  boss: 'bosses',
  creature: 'creatures',
  pickable: 'loot',
  drop: 'loot',
  door: 'pointsOfInterest',
  runestone: 'pointsOfInterest',
}

const featureGroupOrder: readonly FeatureGroupKey[] = [
  'bosses',
  'creatures',
  'loot',
  'pointsOfInterest',
]

export function LocationFeatureList({
  characters,
  features,
  items,
  onSelectCharacter,
  onSelectItem,
  selectedEntityPrefab,
}: LocationFeatureListProps) {
  const { i18n, t } = useTranslation()
  const gameLocalization = useGameLocalization()

  if (!features.length) {
    return <p className="text-[13px] leading-relaxed text-[var(--muted)]">{t('map.noKnownFeatures')}</p>
  }

  const groups = featureGroupOrder
    .map((key) => ({ key, features: features.filter((feature) => featureGroupByKind[feature.kind] === key) }))
    .filter((group) => group.features.length > 0)
  const showGroupLabels = groups.length > 1

  const renderFeature = (feature: LocationFeature) => {
    const offerings = Number(feature.values?.offerings ?? 0)
    const keyItem = String(feature.values?.keyItem ?? '')
    const day = feature.values?.day === true
    const night = feature.values?.night === true
    const prefabName = String(feature.values?.prefabName ?? '').toLowerCase()
    const itemPrefabName = String(
      feature.kind === 'door' ? feature.values?.keyItemPrefab ?? '' : feature.values?.prefabName ?? '',
    ).toLowerCase()
    const character = prefabName ? characters?.[prefabName] : undefined
    const Icon = character?.boss ? Skull : iconByKind[feature.kind]
    const item = itemPrefabName ? items?.[itemPrefabName] : undefined
    const displayName = character?.name ?? item?.name ?? gameLocalization?.translateText(feature.name) ?? feature.name
    const displayedKeyItem = item?.name ?? gameLocalization?.translateText(keyItem) ?? keyItem
    const selectableCharacter = feature.kind === 'creature' && character && onSelectCharacter
    const selectableItem = item && onSelectItem
    const selectable = Boolean(selectableCharacter || selectableItem)
    const selectedPrefab = character?.prefabName ?? item?.prefabName
    const selected = Boolean(
      selectable && selectedPrefab && selectedEntityPrefab &&
      selectedPrefab.toLowerCase() === selectedEntityPrefab.toLowerCase(),
    )
    const spawnTime = t(day && night ? 'map.featureSpawnAnyTime' : night ? 'map.featureSpawnNight' : 'map.featureSpawnDay')
    const encounterDrops = character?.encounterDrops ?? character?.drops ?? []
    const dropNames = encounterDrops.slice(0, 3).map((drop) => drop.name).join(', ')
    const rowClassName = cn(
      'flex w-full items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-2.5 text-left transition-colors',
      selected
        ? 'border-[var(--accent)] bg-transparent'
        : selectable
          ? 'cursor-pointer border-transparent bg-white/[0.035] hover:bg-white/[0.065]'
          : 'border-transparent bg-white/[0.035]',
    )
    const contents = (
      <>
        <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-black/25 text-[var(--accent-text)]">
          {item?.icon ? (
            <img
              src={item.icon}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-7 object-contain"
              aria-hidden="true"
            />
          ) : (
            <Icon size={16} aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[var(--text)]">{displayName}</p>
          <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
            {feature.kind === 'boss' && offerings > 0
              ? t('map.featureBossOfferings', { count: offerings })
              : feature.kind === 'creature'
                ? character?.health
                  ? t('map.featureCreatureHealth', {
                      spawnTime,
                      health: new Intl.NumberFormat(i18n.language).format(character.health),
                    })
                  : spawnTime
                : feature.kind === 'pickable'
                  ? t('map.featureCollectible')
                  : feature.kind === 'drop'
                    ? t('map.featureDestructionDrop')
                    : feature.kind === 'runestone'
                      ? t(feature.values?.revealsMap ? 'map.featureRunestoneReveal' : 'map.featureRunestone')
                      : keyItem
                        ? t('map.featureLockedDoor', { item: displayedKeyItem })
                        : t('map.featureDoor')}
          </p>
          {feature.kind === 'creature' && dropNames ? (
            <p className="mt-1 truncate text-[10px] text-[var(--muted)]">
              {t('map.featureCreatureDrops', {
                items: dropNames,
                more: Math.max(0, encounterDrops.length - 3),
                context: encounterDrops.length > 3 ? 'more' : undefined,
              })}
            </p>
          ) : null}
        </div>
        {feature.count > 1 ? (
          <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--accent-text)]">×{feature.count}</span>
        ) : null}
        {selectable ? <ChevronRight className="shrink-0 text-[var(--muted)]" size={15} aria-hidden="true" /> : null}
      </>
    )

    return selectable ? (
      <button
        key={`${feature.kind}:${feature.name}`}
        type="button"
        className={rowClassName}
        aria-label={t('map.openFeatureDetails', { name: displayName })}
        aria-pressed={selected}
        onClick={() => {
          if (selectableCharacter) onSelectCharacter(character)
          else if (selectableItem) onSelectItem(item)
        }}
      >
        {contents}
      </button>
    ) : (
      <div key={`${feature.kind}:${feature.name}`} className={rowClassName}>
        {contents}
      </div>
    )
  }

  return (
    <div className={showGroupLabels ? 'space-y-3.5' : 'space-y-1.5'}>
      {groups.map((group) => (
        <section key={group.key}>
          {showGroupLabels ? (
            <h4 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              {t(`map.featureGroups.${group.key}`)}
            </h4>
          ) : null}
          <div className="space-y-1.5">{group.features.map(renderFeature)}</div>
        </section>
      ))}
    </div>
  )
}
