import { useTranslation } from "react-i18next";
import { SPAWN_POINT_ICON } from "./map-spawn-point-config";
import { getSpawnPointProfessions } from "./map-spawn-point-utils";
import { getMapTooltipPlacement, MAP_TOOLTIP_WIDTH } from "./map-tooltip-placement";
import type { MapSpawnData, MapSpawnPoint } from "./types";

interface MapSpawnPointTooltipProps {
  point: MapSpawnPoint;
  data: MapSpawnData;
  /** Cursor position inside the viewport. */
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Enough to show the shape of the list without turning into a wall of chips. */
const PROFESSION_LIMIT = 10;

/**
 * Cursor card for the player spawn overlay. Same job and same shape as the
 * vehicle one: the canvas cannot carry a hover name plate of its own, so the
 * map renders one beside the cursor.
 */
const MapSpawnPointTooltip = ({
  point,
  data,
  left,
  top,
  width,
  height,
}: MapSpawnPointTooltipProps) => {
  const { t } = useTranslation();
  const professions = getSpawnPointProfessions(data, point);
  const shown = professions.slice(0, PROFESSION_LIMIT);
  const remaining = professions.length - shown.length;
  const placement = getMapTooltipPlacement(left, top, width, height);

  return (
    <div
      className="map-hover-card map-spawn-point-tooltip"
      style={{ left: placement.left, top: placement.top, width: MAP_TOOLTIP_WIDTH }}
      role="tooltip"
      aria-hidden="true"
    >
      <header>
        <i className="map-spawn-point-tooltip-pin">
          <img src={SPAWN_POINT_ICON} alt="" width={13} height={13} />
        </i>
        <strong>{point.town}</strong>
      </header>
      <small>
        {t("map.spawnPoints.coordinate", { x: point.x, y: point.y, level: point.z })}
      </small>
      <div className="map-hover-card-chips">
        {shown.map(({ id, label }) => <span key={id}>{label}</span>)}
        {remaining > 0 && (
          <span className="map-hover-card-chip-more">
            {t("map.spawnPoints.moreProfessions", { count: remaining })}
          </span>
        )}
      </div>
      {/* The card itself cannot be clicked — it follows the cursor — so the
          full list lives in the panel the point opens. */}
      <p>{t("map.spawnPoints.clickHint")}</p>
    </div>
  );
};

export default MapSpawnPointTooltip;
