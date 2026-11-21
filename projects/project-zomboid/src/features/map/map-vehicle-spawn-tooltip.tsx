import { useTranslation } from "react-i18next";
import { getMapTooltipPlacement, MAP_TOOLTIP_WIDTH } from "./map-tooltip-placement";
import { VEHICLE_SPAWN_APPEARANCE, VEHICLE_SPAWN_ICON } from "./map-vehicle-spawn-config";
import type { MapVehicleSpawnDefinition } from "./types";

interface MapVehicleSpawnTooltipProps {
  definition: MapVehicleSpawnDefinition;
  /** Cursor position inside the viewport. */
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The whole spawn pool, not a preview of it: knowing a zone can produce a
 * specific car is the point of the overlay. Capped only so a modded pool cannot
 * grow the card past the map.
 */
const VEHICLE_LIMIT = 10;

/**
 * Cursor-following card for the vehicle spawn overlay. It answers "what am I
 * pointing at?" without making the eye travel across the map, the same job the
 * marker name plate does for pins.
 */
const MapVehicleSpawnTooltip = ({
  definition,
  left,
  top,
  width,
  height,
}: MapVehicleSpawnTooltipProps) => {
  const { t } = useTranslation();
  const appearance = VEHICLE_SPAWN_APPEARANCE[definition.category];
  const vehicles = definition.vehicles.slice(0, VEHICLE_LIMIT);
  const remaining = definition.vehicles.length - vehicles.length;
  const stats = [
    definition.baseVehicleQuality !== undefined
      && t("map.vehicleSpawns.quality", { value: definition.baseVehicleQuality }),
    definition.chanceToSpawnBurnt !== undefined
      && t("map.vehicleSpawns.burnt", { value: definition.chanceToSpawnBurnt }),
    definition.chanceToSpawnKey !== undefined
      && t("map.vehicleSpawns.keys", { value: definition.chanceToSpawnKey }),
  ].filter((entry): entry is string => Boolean(entry));
  const placement = getMapTooltipPlacement(left, top, width, height);

  return (
    <div
      className="map-hover-card map-vehicle-spawn-tooltip"
      style={{ left: placement.left, top: placement.top, width: MAP_TOOLTIP_WIDTH }}
      role="tooltip"
      aria-hidden="true"
    >
      <header>
        <i style={{ background: appearance.dot, borderColor: appearance.stroke }}>
          <img src={VEHICLE_SPAWN_ICON} alt="" width={13} height={13} />
        </i>
        <strong>{definition.label}</strong>
      </header>
      <small>{t(`map.vehicleSpawns.categories.${definition.category}`)}</small>
      {vehicles.length > 0 ? (
        <ul>
          {vehicles.map((vehicle) => (
            <li key={vehicle.id}>
              <span>{vehicle.name}</span>
              <small>{vehicle.spawnChance}%</small>
            </li>
          ))}
          {remaining > 0 && (
            <li className="map-hover-card-more">{t("map.vehicleSpawns.more", { count: remaining })}</li>
          )}
        </ul>
      ) : (
        <p>{t("map.vehicleSpawns.fixedZone")}</p>
      )}
      {stats.length > 0 && (
        <div className="map-hover-card-stats">
          {stats.map((entry) => <span key={entry}>{entry}</span>)}
        </div>
      )}
    </div>
  );
};

export default MapVehicleSpawnTooltip;
