import {
  Compass,
  LoaderCircle,
  MapPin,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocationDetails } from '../hooks/use-location-details'
import { useGameLocalization } from '../hooks/use-localization-table'
import { useMarkerIntelligence } from '../hooks/use-marker-intelligence'
import {
  findBossPrefab,
  formatLocationName,
  getLocationPanelFeatures,
  locationNameLabelKey,
  locationCategoryLabelKey,
} from '../lib/location-presentation'
import { getLocationDetailVisual, getLocationMarkerStyle } from '../lib/location-marker-style'
import type { GeneratedLocationMarker } from '../lib/valheim/location-generator'
import type { LocationRecord } from '../types/game-data'
import type { CharacterIntel, MarkerItemIntel } from '../types/marker-intelligence'
import { BossIntelligencePanel } from './boss-intelligence-panel'
import { CharacterDetailPanel } from './character-detail-panel'
import { ItemDetailPanel } from './item-detail-panel'
import { LocationFeatureList } from './location-feature-list'
import { LocationMarkerVisual } from './location-marker-visual'
import { TraderInventoryPanel } from './trader-inventory-panel'
import { MarkerProgressActions } from './marker-progress-actions'
import { locationProgressId } from '../lib/marker-progress'

interface LocationDetailPanelProps {
  progressWorldKey?: string
  leftOffset: number
  location: LocationRecord
  marker: GeneratedLocationMarker | null
  onClose: () => void
  topOffset: number
}

const formatDistance = (value: number) => value >= 1_000
  ? `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)} km`
  : `${Math.round(value)} m`

export function LocationDetailPanel({
  progressWorldKey,
  leftOffset,
  location,
  marker,
  onClose,
  topOffset,
}: LocationDetailPanelProps) {
  const { t } = useTranslation()
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterIntel | null>(null)
  const [selectedItem, setSelectedItem] = useState<MarkerItemIntel | null>(null)
  const [itemHistory, setItemHistory] = useState<MarkerItemIntel[]>([])
  const details = useLocationDetails(location)
  const gameLocalization = useGameLocalization()
  const intelligence = useMarkerIntelligence()
  const resolvedLocation = details.location
  const categoryKey = locationCategoryLabelKey(resolvedLocation)
  const markerStyle = getLocationMarkerStyle(resolvedLocation)
  const markerVisual = getLocationDetailVisual(resolvedLocation)
  const features = getLocationPanelFeatures(resolvedLocation)
  const bossPrefab = findBossPrefab(resolvedLocation.contents?.semanticComponents ?? [])
  const bossKey = bossPrefab?.toLowerCase() ?? ''
  const boss = intelligence.catalog?.characters[bossKey]
  const bossOffering = intelligence.catalog?.bossOfferings[bossKey]
  const bossPower = intelligence.catalog?.bossPowers[bossKey]
  const referencedNames = new Set(
    (resolvedLocation.contents?.referencedAssets ?? []).map((reference) => reference.name.toLowerCase()),
  )
  const trader = Object.values(intelligence.catalog?.traders ?? {}).find((entry) => (
    referencedNames.has(entry.prefabName.toLowerCase())
  ))
  const title = boss?.name ?? trader?.name ?? t(locationNameLabelKey(resolvedLocation.prefabName), {
    defaultValue: gameLocalization?.translateText(formatLocationName(resolvedLocation.prefabName)) ?? formatLocationName(resolvedLocation.prefabName),
  })
  const biomes = resolvedLocation.placement.biomes?.map((biome) => gameLocalization?.translateText(biome) ?? biome).join(', ') || t('map.anyBiome')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (selectedItem && itemHistory.length) {
        setSelectedItem(itemHistory[itemHistory.length - 1])
        setItemHistory((history) => history.slice(0, -1))
      } else if (selectedItem) setSelectedItem(null)
      else if (selectedCharacter) setSelectedCharacter(null)
      else onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [itemHistory, onClose, selectedCharacter, selectedItem])

  const selectStandaloneItem = (item: MarkerItemIntel) => {
    setSelectedCharacter(null)
    setItemHistory([])
    setSelectedItem((current) => current?.prefabName === item.prefabName ? null : item)
  }

  const selectCharacter = (character: CharacterIntel) => {
    setSelectedItem(null)
    setItemHistory([])
    setSelectedCharacter((current) => current?.prefabName === character.prefabName ? null : character)
  }

  const selectCharacterItem = (item: MarkerItemIntel) => {
    setItemHistory([])
    setSelectedItem(item)
  }

  const selectRelatedItem = (item: MarkerItemIntel) => {
    if (selectedItem) setItemHistory((history) => [...history, selectedItem])
    setSelectedItem(item)
  }

  const backFromItem = () => {
    if (itemHistory.length) {
      setSelectedItem(itemHistory[itemHistory.length - 1])
      setItemHistory((history) => history.slice(0, -1))
      return
    }
    setSelectedItem(null)
  }

  const closeCompanion = () => {
    setSelectedItem(null)
    setSelectedCharacter(null)
    setItemHistory([])
  }

  const worldFacts = marker ? [
    [t('map.coordinates'), `${marker.x.toFixed(0)}, ${marker.y.toFixed(0)}`],
    [t('map.altitude'), `${(marker.height - 30).toFixed(0)} m`],
    [t('map.centerDistance'), formatDistance(Math.hypot(marker.x, marker.y))],
  ] : []

  return (
    <>
      {!selectedItem && !selectedCharacter ? <aside
        data-map-selection-panel="generated"
        className="pointer-events-auto absolute z-[25] flex w-[360px] max-w-[calc(100%-4rem)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-2xl shadow-black/60"
        style={{ left: leftOffset, top: topOffset, maxHeight: `calc(100% - ${topOffset + 8}px)` }}
        aria-label={t('map.detailsPanel')}
      >
      <header className="relative flex shrink-0 items-start gap-3 border-b border-[var(--border)] bg-[var(--surface)] p-4">
        <span
          className="grid size-14 shrink-0 place-items-center rounded-[var(--radius-md)] border bg-black/30 text-[var(--accent-text)]"
          style={{ borderColor: markerStyle.border, backgroundColor: markerStyle.background }}
        >
          <LocationMarkerVisual
            visual={markerVisual}
            size={markerVisual.kind === 'glyph' ? 40 : 48}
            className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]"
          />
        </span>
        <div className="min-w-0 flex-1 pr-7">
          <h2 className="truncate text-base font-semibold leading-tight text-[var(--text)]">{title}</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">{t(categoryKey)}</p>
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--muted)]">
            <MapPin size={11} className="text-[var(--accent-text)]" aria-hidden="true" />
            {biomes}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 grid size-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          aria-label={t('map.closeDetails')}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      {marker && progressWorldKey ? <MarkerProgressActions worldKey={progressWorldKey} markerId={locationProgressId(marker)} /> : null}

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {details.loading ? (
          <p className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--muted)]">
            <LoaderCircle className="animate-spin" size={15} aria-hidden="true" />
            {t('map.loadingFullDetails')}
          </p>
        ) : null}
        {details.error ? (
          <p className="border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--danger)]">{t('map.fullDetailsError')}</p>
        ) : null}

        {boss ? (
          <BossIntelligencePanel
            boss={boss}
            offering={bossOffering}
            power={bossPower}
            onSelectItem={selectStandaloneItem}
          />
        ) : null}

        {trader ? (
          <TraderInventoryPanel
            trader={trader}
            onSelectItem={selectStandaloneItem}
          />
        ) : null}

        {worldFacts.length ? (
          <section className="border-t border-[var(--border)] px-4 py-3.5">
            <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              <Compass size={13} aria-hidden="true" />{t('map.worldLocation')}
            </h3>
            <dl className="grid grid-cols-3 gap-1.5">
              {worldFacts.map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-[var(--radius-sm)] bg-white/[0.035] px-2 py-2">
                  <dt className="truncate text-[9px] uppercase tracking-wide text-[var(--muted)]">{label}</dt>
                  <dd className="mt-0.5 truncate text-[11px] font-semibold tabular-nums text-[var(--text)]">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {!boss && !trader && features.length > 0 ? (
          <section className="border-t border-[var(--border)] px-4 py-3.5">
            <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">{t('map.whatYouWillFind')}</h3>
            <LocationFeatureList
              features={features}
              characters={intelligence.catalog?.characters}
              items={intelligence.catalog?.items}
              onSelectCharacter={selectCharacter}
              onSelectItem={selectStandaloneItem}
            />
          </section>
        ) : null}
      </div>
      </aside> : null}
      {selectedItem ? (
        <ItemDetailPanel
          backLabel={itemHistory[itemHistory.length - 1]?.name ?? selectedCharacter?.name ?? title}
          item={selectedItem}
          items={intelligence.catalog?.items}
          leftOffset={leftOffset}
          topOffset={topOffset}
          onBack={backFromItem}
          onClose={closeCompanion}
          onSelectItem={selectRelatedItem}
        />
      ) : selectedCharacter ? (
        <CharacterDetailPanel
          backLabel={title}
          character={selectedCharacter}
          leftOffset={leftOffset}
          topOffset={topOffset}
          onBack={() => setSelectedCharacter(null)}
          onClose={() => setSelectedCharacter(null)}
          onSelectItem={selectCharacterItem}
        />
      ) : null}
    </>
  )
}
