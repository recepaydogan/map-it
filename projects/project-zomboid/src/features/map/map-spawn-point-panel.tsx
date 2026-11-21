import { Check, X } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { SPAWN_POINT_ICON } from "./map-spawn-point-config";
import { getSpawnPointProfessions, getTownSpawnPointCount } from "./map-spawn-point-utils";
import { getMapPinPanelPlacement } from "./map-tooltip-placement";
import type { MapSpawnData, MapSpawnPoint } from "./types";
import { useDismissable } from "./use-dismissable";

interface MapSpawnPointPanelProps {
  point: MapSpawnPoint;
  data: MapSpawnData;
  /** The point's own position inside the viewport: the panel sits on its pin. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Profession the overlay is filtered to, so the matching row reads as active. */
  professionId: string | null;
  onProfessionChange: (professionId: string | null) => void;
  /** Stable, so the dismiss listeners are not rebound on every render. */
  onClose: () => void;
}

/**
 * The full story behind a spawn point, opened by clicking it: the cursor card
 * can only preview the first handful of professions and cannot be clicked at
 * all, since it follows the pointer. Every profession that starts here is listed
 * with how many spawn points across the county share it, and selecting one
 * filters the overlay down to it.
 */
const MapSpawnPointPanel = ({
  point,
  data,
  left,
  top,
  width,
  height,
  professionId,
  onProfessionChange,
  onClose,
}: MapSpawnPointPanelProps) => {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLElement | null>(null);
  const professions = getSpawnPointProfessions(data, point);

  useDismissable(true, rootRef, onClose);

  return (
    <section
      ref={rootRef}
      data-map-ui
      style={getMapPinPanelPlacement(left, top, width, height)}
      className="pointer-events-auto absolute z-30 flex flex-col rounded-[var(--radius-lg)] border border-border bg-surface/95 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl animate-fade-in"
      aria-label={t("map.spawnPoints.detailsTitle")}
    >
      <header className="flex items-start gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-full)] border border-[rgba(139,168,155,0.9)] bg-[rgba(179,206,195,0.94)]">
          {/* The native glyph is white line art; the disc under it is pale. */}
          <img src={SPAWN_POINT_ICON} alt="" width={15} height={15} className="brightness-0 opacity-[0.86]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold break-words text-zinc-100">{point.town}</h2>
          <p className="mt-0.5 text-[12px] text-zinc-400">
            {t("map.spawnPoints.coordinate", { x: point.x, y: point.y, level: point.z })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("map.spawnPoints.close")}
          className="-mr-1 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </header>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <span className="rounded-[var(--radius-sm)] bg-white/[0.06] px-2 py-1 text-[12px] text-zinc-300">
          {t("map.spawnPoints.professionCount", { count: professions.length })}
        </span>
        <span className="rounded-[var(--radius-sm)] bg-white/[0.06] px-2 py-1 text-[12px] text-zinc-300">
          {t("map.spawnPoints.townPoints", { count: getTownSpawnPointCount(data, point.townId) })}
        </span>
      </div>

      {/* Caption row: the trailing number is a county-wide total, which reads as
          a property of this one point without a column heading over it. */}
      <div className="mt-2.5 flex items-baseline justify-between gap-2 px-0.5 pb-1.5">
        <p className="min-w-0 truncate text-[12px] font-medium text-zinc-400">
          {t("map.spawnPoints.profession")}
        </p>
        <p className="shrink-0 text-[12px] text-zinc-500">
          {t("map.spawnPoints.pointColumn")}
        </p>
      </div>
      <div
        role="listbox"
        aria-label={t("map.spawnPoints.profession")}
        className="scroll-slim min-h-0 flex-1 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-white/[0.03] p-1"
      >
        {professions.map((profession) => {
          const active = profession.id === professionId;
          return (
            <button
              key={profession.id}
              type="button"
              role="option"
              aria-selected={active}
              // Selecting the active profession again clears the filter, so the
              // panel can undo what it just did without reaching for the toolbar.
              onClick={() => onProfessionChange(active ? null : profession.id)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-white/8",
                active && "bg-accent-soft",
              )}
            >
              <span className="grid w-4 shrink-0 place-items-center">
                {active && <Check size={13} className="text-accent" aria-hidden="true" />}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 text-[12px] break-words",
                  active ? "font-medium text-zinc-100" : "text-zinc-300",
                )}
              >
                {profession.label}
              </span>
              <span
                className="shrink-0 text-[12px] tabular-nums text-zinc-400"
                title={t("map.spawnPoints.professionPointCount", { count: profession.pointCount })}
              >
                {profession.pointCount}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2.5 text-[12px] leading-snug text-zinc-400">
        {t("map.spawnPoints.filterHint")}
      </p>
      <p className="mt-1.5 text-[12px] leading-snug text-zinc-500">
        {t("map.spawnPoints.disclaimer")}
      </p>
    </section>
  );
};

export default MapSpawnPointPanel;
