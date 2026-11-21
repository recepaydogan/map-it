import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { MAP_ICONS, PIN_TYPE_ICONS } from '../lib/location-marker-style'
import { playerPinDisplayName } from '../lib/player-pin-presentation'
import { markerBackgroundColor, markerScale, useMarkerSizes } from '../lib/map-marker-sizes'
import { mapMarkerZoomScale } from '../lib/map-marker-zoom'
import type { CharacterMapPin, MapPinType } from '../lib/valheim/character-save-format'

const WORLD_DIAMETER = 21_000
const MAX_RENDERED_PINS = 400


/**
 * The player's own map pins from the character save, drawn with the game's
 * own pin sprites and the player's labels. Checked pins get the game's red
 * cross and render dimmed.
 */
export function PlayerPinLayer({
  pins,
  zoom,
  visibleTypes,
  translatePinToken,
}: {
  pins: CharacterMapPin[]
  zoom: number
  visibleTypes: ReadonlySet<MapPinType>
  translatePinToken: (token: string) => string | null
}) {
  const { t } = useTranslation()
  const markerSizes = useMarkerSizes()
  const zoomScale = mapMarkerZoomScale(zoom)
  // Counter-scale the map stage, then apply the overview size to each pin.
  return (
    <>
      {pins.filter((pin) => visibleTypes.has(pin.type)).slice(0, MAX_RENDERED_PINS).map((pin, index) => {
        const size = 24 * markerScale(`pin:${pin.type}`, markerSizes) * zoomScale
        const markerColor = markerBackgroundColor(`pin:${pin.type}`, markerSizes)
        const icon = PIN_TYPE_ICONS[pin.type] ?? MAP_ICONS.pin
        const label = playerPinDisplayName(pin, translatePinToken)
        return (
          <div
            key={`${pin.x}:${pin.z}:${index}`}
            className={cn('pointer-events-none absolute z-[70] flex items-center gap-1', pin.checked && 'opacity-45')}
            style={{
              left: `${(pin.x / WORLD_DIAMETER + 0.5) * 100}%`,
              top: `${(0.5 - pin.z / WORLD_DIAMETER) * 100}%`,
              transform: `translate(${-size / 2}px, -50%) scale(${1 / zoom})`,
              transformOrigin: `${size / 2}px center`,
            }}
            title={`${label} · ${t(`map.pins.types.${pin.type}`)}`}
          >
            <span className={cn('relative grid place-items-center', markerColor && 'rounded-full border border-white/70')}
              style={{ width: size, height: size, backgroundColor: markerColor }}>
              <img
                src={icon}
                alt=""
                draggable={false}
                className="max-h-full max-w-full object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
                aria-hidden="true"
              />
              {pin.checked ? (
                <img
                  src={MAP_ICONS.checked}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
                  aria-hidden="true"
                />
              ) : null}
            </span>
            {label ? (
              <span
                className={cn('whitespace-nowrap rounded-[3px] bg-black/60 px-1 font-semibold text-white', pin.checked && 'line-through')}
                style={{ fontSize: 11, lineHeight: 1.4 }}
              >
                {label}
              </span>
            ) : null}
          </div>
        )
      })}
    </>
  )
}
