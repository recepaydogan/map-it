import { Box, Check, Map as MapIcon, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { MapProjectionMode } from "./map-projection";

interface MapViewPanelProps {
  projection: MapProjectionMode;
  renderedCells: number;
  totalCells: number;
  coverageComplete: boolean;
  onProjectionChange: (mode: MapProjectionMode) => void;
  onClose: () => void;
}

/**
 * Projection picker. The toolbar only mounts it when an isometric render
 * exists, so both modes are always a real choice here.
 */
const MapViewPanel = ({
  projection,
  renderedCells,
  totalCells,
  coverageComplete,
  onProjectionChange,
  onClose,
}: MapViewPanelProps) => {
  const { t } = useTranslation();
  const coverage = Math.min(100, Math.round(renderedCells / Math.max(1, totalCells) * 100));

  const modes = [
    { id: "top" as const, icon: MapIcon, label: t("map.view.atlas"), hint: t("map.view.atlasHint") },
    { id: "isometric" as const, icon: Box, label: t("map.view.isometric"), hint: t("map.view.isometricHint") },
  ];

  return (
    <section
      aria-label={t("map.view.title")}
      className="pointer-events-auto flex max-h-[calc(100vh-2rem)] w-[19rem] flex-col rounded-[var(--radius-lg)] border border-border bg-surface/95 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl animate-fade-in"
    >
      <header className="flex shrink-0 items-start gap-2 pb-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold text-zinc-100">{t("map.view.title")}</h2>
          <p className="mt-0.5 truncate text-[12px] text-zinc-400">
            {t(projection === "isometric" ? "map.view.isometric" : "map.view.atlas")}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("map.view.close")}
          className="-mr-1 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </header>

      <div className="flex shrink-0 flex-col gap-1.5">
        {modes.map(({ id, icon: Icon, label, hint }) => {
          const active = projection === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onProjectionChange(id)}
              aria-pressed={active}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border px-2.5 py-2 text-left transition-colors",
                active
                  ? "border-accent/50 bg-accent-soft"
                  : "border-border bg-white/[0.03] hover:bg-surface-hover",
              )}
            >
              <span
                className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] transition-colors",
                  active ? "bg-accent/20 text-accent" : "bg-white/8 text-zinc-400",
                )}
              >
                <Icon size={15} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-zinc-100">{label}</span>
                <span className="mt-0.5 block truncate text-[12px] text-zinc-400">{hint}</span>
              </span>
              {active && <Check size={15} className="shrink-0 text-accent" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {projection === "isometric" && !coverageComplete && (
        <div
          role="status"
          className="mt-2.5 shrink-0 rounded-[var(--radius-md)] border border-accent/25 bg-accent-soft/60 px-2.5 py-2"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] font-medium text-zinc-200">{t("map.view.coverage")}</span>
            <span className="text-[12px] tabular-nums text-zinc-400">{coverage}%</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-[var(--radius-full)] bg-white/10">
            <div className="h-full rounded-[var(--radius-full)] bg-accent" style={{ width: `${coverage}%` }} />
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-zinc-400">
            {t("map.view.coverageStatus", { rendered: renderedCells, total: totalCells })}
            {" — "}
            {t("map.view.coverageNote")}
          </p>
        </div>
      )}

    </section>
  );
};

export default MapViewPanel;
