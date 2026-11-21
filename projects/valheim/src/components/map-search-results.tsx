import { ChevronDown, MapPin, PackageOpen } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { itemAcquisitionSources, itemSourceMapCount } from '../lib/item-acquisition'
import { buildTextSearchIndex, matchLocationSearch } from '../lib/location-search'
import { ItemAcquisitionSections, type ItemSourceViewProps } from './item-acquisition-sections'
import type { LocationRecord } from '../types/game-data'
import type { GeneratedLocationMarker } from '../lib/valheim/location-generator'
import type { CharacterMapPin } from '../lib/valheim/character-save-format'
import { formatLocationName, locationNameLabelKey, locationCategoryLabelKey } from '../lib/location-presentation'
import { LocationMarkerVisual } from './location-marker-visual'
import { getLocationMarkerVisual, PIN_TYPE_ICONS, MAP_ICONS } from '../lib/location-marker-style'
import { playerPinDisplayName } from '../lib/player-pin-presentation'
import { customMarkerType, type CustomMarker } from '../store/custom-marker-store'
import { CustomMarkerVisual } from './custom-marker-visual'
import { markerBackgroundColor, useMarkerSizes } from '../lib/map-marker-sizes'

interface MapResultProps {
  query: string
  locations: LocationRecord[]
  markers: GeneratedLocationMarker[]
  matchingLocationIds: ReadonlySet<string>
  pins: CharacterMapPin[]
  customMarkers?: CustomMarker[]
  translatePinToken: (token: string) => string | null
  onSelectLocation: (location: LocationRecord, markers: GeneratedLocationMarker[]) => void
  onSelectPin: (pin: CharacterMapPin) => void
  onSelectCustomMarker?: (marker: CustomMarker) => void
}

interface LocationSearchGroup {
  name: string
  category: string
  entries: Array<{ location: LocationRecord; marker: GeneratedLocationMarker }>
}

function LocationResultGroup({ group, onSelect }: { group: LocationSearchGroup; onSelect: MapResultProps['onSelectLocation'] }) {
  const { t } = useTranslation()
  const first = group.entries[0]
  return <button type="button" title={t('map.searchShowOnMap')} onClick={() => onSelect(first.location, group.entries.map((entry) => entry.marker))} className="mb-1 flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] bg-white/[0.025] p-2.5 text-left hover:bg-white/[0.065] focus-visible:outline focus-visible:outline-[var(--accent)]">
    <LocationMarkerVisual visual={getLocationMarkerVisual(first.location)} size={24} className="shrink-0 text-[var(--accent-text)]" />
    <span className="min-w-0 flex-1"><strong className="block text-xs text-[var(--text)]">{group.name}</strong><span className="mt-1 block text-[10px] text-[var(--muted)]">{group.category} · {t('map.searchSpots', { count: group.entries.length })}</span></span>
    <MapPin size={14} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
  </button>
}

export function MapSearchResults({ query, locations, markers, matchingLocationIds, pins, customMarkers = [], translatePinToken, onSelectLocation, onSelectPin, onSelectCustomMarker, ...sourceProps }: ItemSourceViewProps & MapResultProps) {
  const { t } = useTranslation()
  const customMarkerColor = markerBackgroundColor('custom', useMarkerSizes())
  const [limit, setLimit] = useState(20)
  const [locationLimit, setLocationLimit] = useState(6)
  const [pinLimit, setPinLimit] = useState(20)
  const locationResults = useMemo(() => {
    const byId = new Map(locations.map((location) => [location.id, location]))
    const groups = new Map<string, LocationSearchGroup>()
    for (const marker of markers) {
      const location = byId.get(marker.locationId)
      if (!location || !matchingLocationIds.has(location.id)) continue
      const name = t(locationNameLabelKey(location.prefabName), { defaultValue: formatLocationName(location.prefabName) })
      const category = t(locationCategoryLabelKey(location))
      const key = `${category}:${name}`
      const group = groups.get(key) ?? { name, category, entries: [] }
      group.entries.push({ location, marker })
      groups.set(key, group)
    }
    const needle = query.trim().toLocaleLowerCase()
    const rank = (name: string) => {
      const folded = name.toLocaleLowerCase()
      return folded === needle ? 0 : folded.startsWith(needle) ? 1
        : folded.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(needle)) ? 2
          : folded.includes(needle) ? 3 : 4
    }
    return [...groups.values()].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
  }, [locations, markers, matchingLocationIds, query, t])
  const pinResults = useMemo(() => {
    const entries = pins.map((pin, index) => ({ pin, id: String(index), name: playerPinDisplayName(pin, translatePinToken) }))
    const matches = matchLocationSearch(buildTextSearchIndex(entries.map((entry) => ({ id: entry.id, terms: [entry.name, entry.pin.name] }))), query)
    return entries.filter((entry) => matches?.has(entry.id))
  }, [pins, query, translatePinToken])
  const customResults = useMemo(() => {
    const entries = customMarkers.map((marker) => ({ id: marker.id, terms: [marker.name, marker.description ?? '', t(customMarkerType(marker.category).labelKey)] }))
    const matches = matchLocationSearch(buildTextSearchIndex(entries), query)
    return customMarkers.filter((marker) => matches?.has(marker.id))
  }, [customMarkers, query, t])
  const items = useMemo(() => Object.values(sourceProps.catalog?.intelligence.items ?? {}), [sourceProps.catalog])
  const index = useMemo(() => buildTextSearchIndex(items.map((item) => ({ id: item.prefabName, terms: [item.name, item.prefabName] }))), [items])
  const results = useMemo(() => {
    const matches = matchLocationSearch(index, query)
    const needle = query.trim().toLowerCase()
    const rank = (name: string) => name.toLowerCase() === needle ? 0 : name.toLowerCase().startsWith(needle) ? 1 : 2
    return items.filter((item) => matches?.has(item.prefabName) && sourceProps.catalog
      && itemAcquisitionSources(item, sourceProps.catalog).some((source) =>
        itemSourceMapCount(item, source, sourceProps.markerCounts, sourceProps.resourceIndex) > 0))
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
  }, [index, items, query, sourceProps.catalog, sourceProps.markerCounts, sourceProps.resourceIndex])

  return <section aria-label={t('map.searchResultsTitle')} className="pointer-events-auto flex min-h-0 w-[360px] max-w-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--panel-background)] shadow-2xl shadow-black/40 backdrop-blur-xl">
    <header className="shrink-0 border-b border-[var(--border)] px-3 py-2.5">
      <h2 className="text-[11px] font-semibold text-[var(--text)]">{t('map.searchResultsTitle')}</h2>
      <p className="mt-1 text-[10px] text-[var(--muted)]" role="status">{t('map.searchResultsCount', { items: results.length, locations: locationResults.length, pins: pinResults.length + customResults.length })}</p>
    </header>
    <div className="min-h-0 overflow-y-auto overscroll-contain p-2">
      {locationResults.length > 0 ? <h3 className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{t('map.searchLocations')}</h3> : null}
      {locationResults.slice(0, locationLimit).map((group) => <LocationResultGroup key={`${group.category}:${group.name}`} group={group} onSelect={onSelectLocation} />)}
      {locationResults.length > locationLimit ? <button type="button" onClick={() => setLocationLimit((value) => value + 6)} className="w-full cursor-pointer p-2 text-xs text-[var(--accent-text)]">{t('map.searchMore', { count: locationResults.length - locationLimit })}</button> : null}
      {pinResults.length > 0 ? <h3 className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{t('map.searchPins')}</h3> : null}
      {pinResults.slice(0, pinLimit).map(({ pin, id, name }) => <button key={id} type="button" onClick={() => onSelectPin(pin)} className="mb-1 flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] bg-white/[0.025] p-2.5 text-left hover:bg-white/[0.065] focus-visible:outline focus-visible:outline-[var(--accent)]">
        <img src={PIN_TYPE_ICONS[pin.type] ?? MAP_ICONS.pin} alt="" className="size-6 shrink-0 object-contain" />
        <span className="min-w-0 flex-1"><strong className="block break-words text-xs text-[var(--text)]">{name || t(`map.pins.types.${pin.type}`)}</strong><span className="mt-1 block text-[10px] text-[var(--muted)]">{t(`map.pins.types.${pin.type}`)}</span></span>
        <MapPin size={14} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
      </button>)}
      {pinResults.length > pinLimit ? <button type="button" onClick={() => setPinLimit((value) => value + 20)} className="w-full cursor-pointer p-2 text-xs text-[var(--accent-text)]">{t('map.searchMore', { count: pinResults.length - pinLimit })}</button> : null}
      {results.length > 0 ? <h3 className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{t('itemSources.searchTitle')}</h3> : null}
      {customResults.length > 0 ? <h3 className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{t('customMarkers.yourMarkers')}</h3> : null}
      {customResults.map((marker) => <button key={marker.id} type="button" onClick={() => onSelectCustomMarker?.(marker)} className="mb-1 flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] bg-white/[0.025] p-2.5 text-left hover:bg-white/[0.065] focus-visible:outline focus-visible:outline-[var(--accent)]"><CustomMarkerVisual marker={marker} size={24} backgroundColor={customMarkerColor} /><span className="min-w-0 flex-1"><strong className="block break-words text-xs text-[var(--text)]">{marker.name}</strong><span className="mt-1 block text-[10px] text-[var(--muted)]">{t(customMarkerType(marker.category).labelKey)}</span></span><MapPin size={14} className="text-[var(--muted)]" /></button>)}
      {!sourceProps.catalog ? <p className="p-2 text-xs text-[var(--muted)]">{t(sourceProps.sourceError ? 'itemSources.loadError' : 'common.loading')}</p>
        : !results.length && !locationResults.length && !pinResults.length && !customResults.length ? <p className="p-2 text-xs leading-relaxed text-[var(--muted)]" role="status">{t(sourceProps.mapLoading ? 'itemSources.findingSpots' : 'map.searchNoResults')}</p> : null}
      {results.slice(0, limit).map((item) => <details key={item.prefabName} open={results.length === 1 ? true : undefined} className="group mb-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-white/[0.025] last:mb-0">
        <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-[var(--radius-md)] p-2.5 hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-[var(--accent)] [&::-webkit-details-marker]:hidden">
          <span className="grid size-10 shrink-0 place-items-center rounded bg-black/25">{item.icon ? <img src={item.icon} alt="" className="size-8 object-contain" /> : <PackageOpen size={20} aria-hidden="true" />}</span>
          <span className="min-w-0 flex-1"><strong className="block text-xs font-semibold text-[var(--text)]">{item.name}</strong></span>
          <ChevronDown size={14} className="shrink-0 text-[var(--muted)] transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-[var(--border)] p-2.5">
          <ItemAcquisitionSections item={item} {...sourceProps} mapOnly paginateResources />
        </div>
      </details>)}
      {results.length > limit ? <button type="button" onClick={() => setLimit((value) => value + 20)} className="w-full cursor-pointer rounded px-3 py-2 text-xs text-[var(--accent-text)] hover:bg-white/5">{t('itemSources.more', { count: results.length - limit })}</button> : null}
    </div>
  </section>
}
