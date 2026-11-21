import { Check, ChevronDown, MapPin, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { MARKER_GROUPS } from "./marker-group-config";
import MapFilterCount from "./map-filter-count";
import type { UserMarkerGroup } from "./types";

interface MapMarkerGroupFilterProps {
  counts: Partial<Record<UserMarkerGroup, number>>;
  foundCounts: Partial<Record<UserMarkerGroup, number>>;
  hiddenGroups: UserMarkerGroup[];
  open: boolean;
  query: string;
  onToggleOpen: () => void;
  onToggle: (group: UserMarkerGroup) => void;
  onSetGroup: (show: boolean) => void;
}

/** Personal marker groups share the category filter's accordion and checkbox layout. */
const MapMarkerGroupFilter = ({
  counts,
  foundCounts,
  hiddenGroups,
  open,
  query,
  onToggleOpen,
  onToggle,
  onSetGroup,
}: MapMarkerGroupFilterProps) => {
  const { t } = useTranslation();
  const label = t("map.custom.personal");
  const populatedGroups = MARKER_GROUPS.filter(({ id }) => (counts[id] ?? 0) > 0);
  const groupMatches = query && label.toLocaleLowerCase().includes(query);
  const visibleGroups = query && !groupMatches
    ? populatedGroups.filter(({ id }) => t(`map.markerGroups.${id}`).toLocaleLowerCase().includes(query))
    : populatedGroups;
  if (visibleGroups.length === 0) return null;

  const activeCount = populatedGroups.filter(({ id }) => !hiddenGroups.includes(id)).length;
  const allOn = activeCount === populatedGroups.length;
  const noneOn = activeCount === 0;
  const markerCount = populatedGroups.reduce((sum, { id }) => sum + (counts[id] ?? 0), 0);
  const foundCount = populatedGroups.reduce((sum, { id }) => sum + (foundCounts[id] ?? 0), 0);

  return (
    <div className="border-b border-border/60">
      <div className="group/hdr flex items-center gap-1">
        <button
          type="button"
          onClick={() => onSetGroup(!allOn)}
          aria-label={t(allOn ? "map.filters.hideGroup" : "map.filters.showGroup", { group: label })}
          title={t(allOn ? "map.filters.hideGroup" : "map.filters.showGroup", { group: label })}
          className={cn(
            "grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors",
            allOn ? "border-accent bg-accent text-on-accent"
              : noneOn ? "border-zinc-500 hover:border-zinc-400"
                : "border-accent bg-accent/30 text-accent",
          )}
        >
          {allOn && <Check size={11} strokeWidth={3} aria-hidden="true" />}
          {!allOn && !noneOn && <Minus size={11} strokeWidth={3} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 text-left"
        >
          <MapPin size={15} className={cn("shrink-0", noneOn ? "text-zinc-500" : "text-accent")} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-100">{label}</span>
        </button>
        <MapFilterCount found={foundCount} total={markerCount} group />
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-label={label}
          className="flex cursor-pointer items-center py-2"
        >
          <ChevronDown size={15}
            className={cn("shrink-0 text-zinc-400 transition-transform", open && "rotate-180")}
            aria-hidden="true" />
        </button>
      </div>

      {open && <div className="flex flex-col gap-0.5 pb-2 pl-1">
        {visibleGroups.map(({ id, icon: Icon }) => {
          const visible = !hiddenGroups.includes(id);
          const groupLabel = t(`map.markerGroups.${id}`);
          return <div key={id}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 transition-all hover:bg-white/5",
              !visible && "opacity-70 hover:opacity-100",
            )}>
            <button type="button" onClick={() => onToggle(id)} aria-pressed={visible}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-zinc-500 bg-[#171717]">
                <Icon size={12} className="text-zinc-200" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-200">{groupLabel}</span>
            </button>
            <MapFilterCount found={foundCounts[id] ?? 0} total={counts[id] ?? 0} />
            <button type="button" onClick={() => onToggle(id)} aria-pressed={visible}
              aria-label={t(visible ? "map.filters.hideGroup" : "map.filters.showGroup", { group: groupLabel })}
              className={cn(
                "grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors",
                visible ? "border-accent bg-accent text-on-accent" : "border-zinc-500 hover:border-zinc-400",
              )}>
              {visible && <Check size={11} strokeWidth={3} aria-hidden="true" />}
            </button>
          </div>;
        })}
      </div>}
    </div>
  );
};

export default MapMarkerGroupFilter;
