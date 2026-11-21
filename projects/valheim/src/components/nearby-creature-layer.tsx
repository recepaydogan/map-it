import { PawPrint } from 'lucide-react'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { NearbyCreature } from '../lib/live-tracking/creature-types.ts'
import { cleanCreatureLabel, readableCreaturePrefab } from '../lib/live-tracking/creature-catalog.ts'
import { markerBackgroundColor, markerScale, useMarkerSizes } from '../lib/map-marker-sizes'
import { mapMarkerZoomScale } from '../lib/map-marker-zoom'

const WORLD_DIAMETER = 21_000

const toLeftTop = (x: number, z: number) => ({
  left: (x / WORLD_DIAMETER + 0.5) * 100,
  top: (0.5 - z / WORLD_DIAMETER) * 100,
})

/** Stable, named live markers; moving creatures never merge/unmount as clusters. */
export const NearbyCreatureLayer = memo(function NearbyCreatureLayer({
  creatures,
  zoom,
  translateToken,
  onFocus,
}: {
  creatures: readonly NearbyCreature[]
  zoom: number
  mapSize: number
  translateToken: (token: string) => string | null
  onFocus: (x: number, y: number, zoom: number) => void
}) {
  const { t } = useTranslation()
  const markerSizes = useMarkerSizes()
  const sizeScale = markerScale('creatures', markerSizes) * mapMarkerZoomScale(zoom)
  const markerColor = markerBackgroundColor('creatures', markerSizes)
  const markers = useMemo(() => creatures.map((creature) => ({
    creature,
    point: toLeftTop(creature.x, creature.z),
    name: cleanCreatureLabel(
      (creature.name ? translateToken(creature.name) : null) ?? readableCreaturePrefab(creature.prefab),
    ),
  })), [creatures, translateToken])
  return (
    <>
      {markers.map(({ creature, point, name }) => (
          <button
            key={creature.id}
            type="button"
            className="group absolute z-[20] flex cursor-pointer items-center gap-1.5 hover:z-[110] focus-visible:z-[110]"
            style={{
              left: `${point.left}%`,
              top: `${point.top}%`,
              transform: `translate(${-12 * sizeScale}px, -50%) scale(${1 / zoom})`,
              transformOrigin: `${12 * sizeScale}px center`,
            }}
            onClick={() => onFocus(point.left / 100, point.top / 100, Math.min(48, Math.max(zoom * 2, 24)))}
            aria-label={t('map.nearbyCreatures.markerLabel', { name, level: creature.level })}
          >
            <span className="grid shrink-0 place-items-center rounded-[var(--radius-full)] border border-white/80 bg-[var(--danger)] text-white shadow-[0_0_0_3px_rgba(159,52,52,0.18),0_2px_8px_rgba(0,0,0,0.68)]" style={{ width: 24 * sizeScale, height: 24 * sizeScale, backgroundColor: markerColor }}>
              <PawPrint size={13 * sizeScale} strokeWidth={2.5} aria-hidden="true" />
            </span>
            <span className="max-w-32 truncate whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)]/95 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-[var(--text)] shadow-lg">
              {name}
            </span>
            <span className="pointer-events-none absolute left-7 top-full mt-1 hidden whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2 py-1 text-[9.5px] text-[var(--text)] shadow-xl group-hover:block group-focus-visible:block">
              {t(creature.tamed ? 'map.nearbyCreatures.tamedDetail' : 'map.nearbyCreatures.levelDetail', { level: creature.level })}
            </span>
          </button>
      ))}
    </>
  )
})
