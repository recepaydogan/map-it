import { Activity, Bookmark, Check, CheckCheck, ChevronDown, Minus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

/** The two layers the player's own activity paints on the map. */
export type PersonalMarkerLayer = "saved" | "completed";

interface MapPersonalMarkerFilterProps {
  counts: Record<PersonalMarkerLayer, number>;
  hiddenLayers: PersonalMarkerLayer[];
  onToggle: (layer: PersonalMarkerLayer) => void;
}

const LAYERS = [
  { id: "saved" as const, labelKey: "map.saved.filterSaved", icon: Bookmark },
  { id: "completed" as const, labelKey: "map.saved.filterCompleted", icon: CheckCheck },
];

/** Visibility switches for the saved / completed layers, styled like a category group. */
const MapPersonalMarkerFilter = ({
  counts,
  hiddenLayers,
  onToggle,
}: MapPersonalMarkerFilterProps) => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const label = t("map.categoryGroups.personal");
  const visibleLayers = LAYERS.filter(({ id }) => !hiddenLayers.includes(id));
  const allVisible = visibleLayers.length === LAYERS.length;
  const noneVisible = visibleLayers.length === 0;
  const totalCount = LAYERS.reduce((total, { id }) => total + counts[id], 0);

  const setAllVisible = (visible: boolean) => {
    LAYERS.forEach(({ id }) => {
      if (visible === hiddenLayers.includes(id)) onToggle(id);
    });
  };

  const showOnly = (layer: PersonalMarkerLayer) => {
    LAYERS.forEach(({ id }) => {
      const shouldBeVisible = id === layer;
      if (shouldBeVisible === hiddenLayers.includes(id)) onToggle(id);
    });
  };

  return (
    <div className="border-b border-border/60 last:border-b-0">
      <div className="group/hdr flex items-center gap-1">
        <button
          type="button"
          onClick={() => setAllVisible(!allVisible)}
          aria-label={t(allVisible ? "map.filters.hideGroup" : "map.filters.showGroup", { group: label })}
          title={t(allVisible ? "map.filters.hideGroup" : "map.filters.showGroup", { group: label })}
          className={cn(
            "grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors",
            allVisible
              ? "border-accent bg-accent text-on-accent"
              : noneVisible
                ? "border-zinc-500 hover:border-zinc-400"
                : "border-accent bg-accent/30 text-accent",
          )}
        >
          {allVisible && <Check size={11} strokeWidth={3} aria-hidden="true" />}
          {!allVisible && !noneVisible && <Minus size={11} strokeWidth={3} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 text-left"
        >
          <Activity
            size={15}
            className={cn("shrink-0 transition-colors", noneVisible ? "text-zinc-500" : "text-accent")}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-100">{label}</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label={label}
          className="flex cursor-pointer items-center gap-1.5 py-2"
        >
          <span className="rounded-[var(--radius-full)] bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-300">
            {totalCount.toLocaleString(i18n.language)}
          </span>
          <ChevronDown
            size={15}
            className={cn("shrink-0 text-zinc-400 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-0.5 pb-2 pl-1">
          {LAYERS.map(({ id, labelKey, icon: Icon }) => {
            const visible = !hiddenLayers.includes(id);
            const layerLabel = t(labelKey);
            return (
              <div
                key={id}
                className={cn(
                  "group/layer flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 transition-all",
                  visible ? "hover:bg-white/5" : "opacity-70 hover:bg-white/5 hover:opacity-100",
                )}
              >
                <button
                  type="button"
                  onClick={() => onToggle(id)}
                  aria-pressed={visible}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                    <Icon size={11} strokeWidth={2.5} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-200">{layerLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={() => showOnly(id)}
                  tabIndex={-1}
                  title={t("map.filters.onlyLayer", { layer: layerLabel })}
                  className="hidden cursor-pointer rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent hover:bg-accent-soft group-hover/layer:block"
                >
                  {t("map.filters.only")}
                </button>
                {counts[id] > 0 && (
                  <span className="text-[12px] tabular-nums text-zinc-400">
                    {counts[id].toLocaleString(i18n.language)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onToggle(id)}
                  aria-pressed={visible}
                  aria-label={layerLabel}
                  className={cn(
                    "grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors",
                    visible ? "border-accent bg-accent text-on-accent" : "border-zinc-500 hover:border-zinc-400",
                  )}
                >
                  {visible && <Check size={11} strokeWidth={3} aria-hidden="true" />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MapPersonalMarkerFilter;
