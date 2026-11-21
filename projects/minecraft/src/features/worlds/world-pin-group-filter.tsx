import { Check, ChevronDown, MapPinned, Minus, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GAME_OBSERVED_PORTAL_APPEARANCE } from "../../game-config";
import { cn } from "../../lib/cn";
import { MARKER_GROUPS } from "../map/marker-group-config";
import { customWorldPinGroupName } from "./world-pin-group";

const WorldPinGroupFilter = ({ hidden, counts, query, expanded, onExpandedChange, onSetHidden, onOnly }: {
  hidden: readonly string[];
  counts: Readonly<Record<string, number>>;
  query: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSetHidden: (groups: string[]) => void;
  onOnly: (group?: string) => void;
}) => {
  const { t, i18n } = useTranslation();
  const fixedIds = new Set<string>(MARKER_GROUPS.map(item => item.id));
  const groups = [
    ...MARKER_GROUPS.filter(item => (counts[item.id] ?? 0) > 0)
      .map(item => ({ ...item, label: t(`map.markerGroups.${item.id}`) })),
    ...Object.keys(counts).filter(id => !fixedIds.has(id) && counts[id] > 0)
      .map(id => ({ id, icon: Tag, label: customWorldPinGroupName(id) ?? id })),
  ];
  if (groups.length === 0) return null;
  const title = t("map.markerGroups.title");
  const normalizedQuery = query.trim().toLocaleLowerCase(i18n.language);
  const titleMatches = title.toLocaleLowerCase(i18n.language).includes(normalizedQuery);
  const matches = groups.filter(item => item.label.toLocaleLowerCase(i18n.language).includes(normalizedQuery));
  if (normalizedQuery && !titleMatches && matches.length === 0) return null;
  const visibleGroups = normalizedQuery && !titleMatches ? matches : groups;
  const activeCount = groups.filter(item => !hidden.includes(item.id)).length;
  const allOn = activeCount === groups.length, noneOn = activeCount === 0;
  const isExpanded = normalizedQuery ? true : expanded;
  const setAll = (visible: boolean) => onSetHidden(visible ? [] : groups.map(item => item.id));

  return <div data-structure-group="personal-markers" className="border-b border-border/60 last:border-0">
    <div className="group/hdr flex items-center gap-1">
      <button type="button" onClick={() => setAll(!allOn)}
        aria-label={t(allOn ? "structureMap.filters.hideGroup" : "structureMap.filters.showGroup", { group: title })}
        className={cn("grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border",
          allOn ? "border-accent bg-accent text-on-accent" : noneOn ? "border-zinc-500" : "border-accent bg-accent/30 text-accent")}>
        {allOn ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : !noneOn ? <Minus size={11} strokeWidth={3} aria-hidden="true" /> : null}
      </button>
      <button type="button" onClick={() => onExpandedChange(!isExpanded)} aria-expanded={isExpanded}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 text-left">
        <span className={cn("grid h-6 w-6 shrink-0 place-items-center text-accent", noneOn && "opacity-55 grayscale")}>
          <MapPinned size={17} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-100">{title}</span>
      </button>
      <button type="button" onClick={() => onOnly()}
        className="invisible rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent hover:bg-accent-soft group-hover/hdr:visible group-focus-within/hdr:visible">
        {t("structureMap.filters.only")}
      </button>
      <button type="button" onClick={() => onExpandedChange(!isExpanded)} aria-expanded={isExpanded} aria-label={title}
        className="flex cursor-pointer items-center gap-1 py-2">
        <ChevronDown size={15} className={cn("text-zinc-400 transition-transform", isExpanded && "rotate-180")} aria-hidden="true" />
      </button>
    </div>
    {isExpanded && <div className="flex flex-col gap-0.5 pb-2 pl-1">{visibleGroups.map(({ id, icon: Icon, label }) => {
      const active = !hidden.includes(id);
      const toggle = () => onSetHidden(active ? [...hidden, id] : hidden.filter(item => item !== id));
      return <div key={id} data-structure-category={id}
        className={cn("group/cat flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5", !active && "opacity-70")}>
        <button type="button" onClick={toggle} aria-pressed={active} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-full)] border border-accent bg-surface text-accent">
            {id === GAME_OBSERVED_PORTAL_APPEARANCE.group
              ? <img src={GAME_OBSERVED_PORTAL_APPEARANCE.artwork} alt="" className="h-[21px] w-[21px]" />
              : <Icon size={15} aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-200">{label}</span>
        </button>
        <button type="button" onClick={() => onOnly(id)}
          className="invisible rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent hover:bg-accent-soft group-hover/cat:visible group-focus-within/cat:visible">
          {t("structureMap.filters.only")}
        </button>
        <button type="button" onClick={toggle} aria-pressed={active}
          aria-label={t(active ? "structureMap.filters.hideCategory" : "structureMap.filters.showCategory", { category: label })}
          className={cn("grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border",
            active ? "border-accent bg-accent text-on-accent" : "border-zinc-500")}>
          {active && <Check size={11} strokeWidth={3} aria-hidden="true" />}
        </button>
      </div>;
    })}</div>}
  </div>;
};

export default WorldPinGroupFilter;
