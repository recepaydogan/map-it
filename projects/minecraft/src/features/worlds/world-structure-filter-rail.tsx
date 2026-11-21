import { Check, CheckCheck, ChevronDown, Eye, EyeOff, Minus, PanelLeftClose, Search, SlidersHorizontal, Star, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { GAME_STRUCTURE_GROUPS, GAME_STRUCTURE_TYPES } from "../../game-config";
import { cn } from "../../lib/cn";
import type { StructureViewportState } from "../generation/structure-viewport-stream";
import MapPointIcon from "../map/map-point-icon";
import type { StructureFilterState } from "./world-structure-filter-state";
import { structureIcon, type StructureIconName } from "./world-structure-icons";

const categoryIds = GAME_STRUCTURE_TYPES.map(type => type.id);
const categoryLabel = (id: string) => `structureMap.types.${id}`;
const groupLabel = (id: string) => `structureMap.groups.${id}`;
interface Props {
  filter: StructureFilterState;
  state: Readonly<StructureViewportState> | null;
  onClose: () => void;
  onChange: (filter: StructureFilterState) => void;
  beforeGroups?: ReactNode;
  onOnlyStructure?: () => void;
  onSetAllStructureVisibility?: (visible: boolean) => void;
}

const ProgressToggle = ({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Star; label: string; onClick: () => void }) =>
  <button type="button" aria-pressed={active} aria-label={label} title={label} onClick={onClick} className={cn(
    "flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border px-2 py-1.5 text-xs font-medium transition-colors",
    active ? "border-accent/60 bg-accent-soft text-accent" : "border-border bg-white/5 text-zinc-200 hover:bg-white/10") }>
    <Icon size={13} className="shrink-0" aria-hidden="true" /><span className="truncate">{label}</span>
  </button>;

const WorldStructureFilterRail = ({ filter, state, onClose, onChange, beforeGroups, onOnlyStructure,
  onSetAllStructureVisibility }: Props) => {
  const { t, i18n } = useTranslation();
  const active = new Set(filter.visibleCategories), unsupported = new Set(state?.unsupported ?? []);
  const availableCategoryIds = categoryIds.filter(id => !unsupported.has(id));
  const query = filter.search.trim().toLocaleLowerCase(i18n.language);
  const setCategories = (ids: readonly string[]) => onChange({ ...filter,
    visibleCategories: availableCategoryIds.filter(id => ids.includes(id)) });
  const toggleCategory = (id: string) => setCategories(active.has(id) ? filter.visibleCategories.filter(key => key !== id) : [...filter.visibleCategories, id]);

  return <section id="world-structure-filter-panel" data-tour="filters" data-structure-filter="expanded" aria-label={t("structureMap.filters.title")} className="pointer-events-auto flex max-h-full w-[19rem] max-w-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/90 shadow-[var(--panel-shadow)] backdrop-blur-xl">
    <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
      <SlidersHorizontal size={16} className="text-accent" aria-hidden="true" />
      <h2 className="flex-1 text-sm font-semibold text-white">{t("structureMap.filters.title")}</h2>
      <button type="button" onClick={onClose} aria-label={t("structureMap.filters.collapse")}
        className="grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/5 hover:text-white">
        <PanelLeftClose size={16} aria-hidden="true" />
      </button>
    </header>
    <div className="flex shrink-0 gap-2 px-4 pt-3">
      <button type="button" aria-label={t("structureMap.filters.showAll")} onClick={() => { onSetAllStructureVisibility?.(true); setCategories(availableCategoryIds); }} className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-white/5 px-2 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/10"><Eye size={13} aria-hidden="true" />{t("structureMap.filters.showAll")}</button>
      <button type="button" aria-label={t("structureMap.filters.hideAll")} onClick={() => { onSetAllStructureVisibility?.(false); setCategories([]); }} className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-white/5 px-2 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/10"><EyeOff size={13} aria-hidden="true" />{t("structureMap.filters.hideAll")}</button>
    </div>
    <div className="flex shrink-0 gap-2 px-4 pt-2">
      <ProgressToggle active={filter.hideFound} icon={CheckCheck} label={t("structureMap.filters.hideFound")} onClick={() => onChange({ ...filter, hideFound: !filter.hideFound })} />
      <ProgressToggle active={filter.favoritesOnly} icon={Star} label={t("structureMap.filters.favoritesOnly")} onClick={() => onChange({ ...filter, favoritesOnly: !filter.favoritesOnly })} />
    </div>
    <div className="shrink-0 px-4 pb-2 pt-2">
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-black/25 px-2.5 py-1.5 focus-within:border-accent">
        <Search size={14} className="shrink-0 text-zinc-400" aria-hidden="true" />
        <input value={filter.search} maxLength={512} onChange={event => onChange({ ...filter, search: event.target.value })} aria-label={t("structureMap.filters.search")}
          placeholder={t("structureMap.filters.search")} className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-100 placeholder:text-zinc-400 focus:outline-none" />
        {filter.search && <button type="button" onClick={() => onChange({ ...filter, search: "" })} aria-label={t("structureMap.filters.clear")}
          className="grid h-4 w-4 cursor-pointer place-items-center rounded-[var(--radius-full)] text-zinc-400 hover:text-white"><X size={13} aria-hidden="true" /></button>}
      </div>
    </div>
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-1">
      <div className="w-[calc(17rem_-_2px)]">
        {beforeGroups}
        {GAME_STRUCTURE_GROUPS.map(group => {
          const categories = GAME_STRUCTURE_TYPES.filter(type => type.group === group.id && !unsupported.has(type.id));
          if (!categories.length) return null;
          const matches = categories.filter(type => !query || t(categoryLabel(type.id)).toLocaleLowerCase(i18n.language).includes(query));
          if (query && !matches.length && !t(groupLabel(group.id)).toLocaleLowerCase(i18n.language).includes(query)) return null;
          const visible = query && t(groupLabel(group.id)).toLocaleLowerCase(i18n.language).includes(query) ? categories : matches;
          const activeCount = categories.filter(type => active.has(type.id)).length;
          const allOn = activeCount === categories.length, noneOn = activeCount === 0;
          const expanded = query ? true : filter.expandedGroup === group.id;
          return <div key={group.id} data-structure-group={group.id} className="border-b border-border/60 last:border-0">
            <div className="group/hdr flex items-center gap-1">
              <button type="button" onClick={() => setCategories(allOn ? filter.visibleCategories.filter(id => !categories.some(type => type.id === id)) : [...filter.visibleCategories, ...categories.map(type => type.id)])}
                aria-label={t(allOn ? "structureMap.filters.hideGroup" : "structureMap.filters.showGroup", { group: t(groupLabel(group.id)) })}
                className={cn("grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border", allOn ? "border-accent bg-accent text-on-accent" : noneOn ? "border-zinc-500" : "border-accent bg-accent/30 text-accent") }>
                {allOn ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : !noneOn ? <Minus size={11} strokeWidth={3} aria-hidden="true" /> : null}
              </button>
              <button type="button" onClick={() => onChange({ ...filter, expandedGroup: expanded ? null : group.id })} aria-expanded={expanded}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 text-left">
                <MapPointIcon source={group.artwork} fallback={structureIcon(group.icon as StructureIconName)} size={24}
                  className={noneOn ? "opacity-55 grayscale" : undefined} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-100">{t(groupLabel(group.id))}</span>
              </button>
              <button type="button" onClick={() => { onOnlyStructure?.(); setCategories(categories.map(type => type.id)); }} className="invisible rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent hover:bg-accent-soft group-hover/hdr:visible group-focus-within/hdr:visible">{t("structureMap.filters.only")}</button>
              <button type="button" onClick={() => onChange({ ...filter, expandedGroup: expanded ? null : group.id })} aria-expanded={expanded} aria-label={t(groupLabel(group.id))} className="flex cursor-pointer items-center gap-1 py-2">
                <ChevronDown size={15} className={cn("text-zinc-400 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
              </button>
            </div>
            {expanded && <div className="flex flex-col gap-0.5 pb-2 pl-1">{visible.map(type => {
              const isActive = active.has(type.id);
              return <div key={type.id} data-structure-category={type.id}
                className={cn("group/cat flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5", !isActive && "opacity-70") }>
                <button type="button" onClick={() => toggleCategory(type.id)} aria-pressed={isActive} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-full)] border bg-surface" style={{ color: type.color, borderColor: type.color }}>
                    <MapPointIcon source={type.artwork} fallback={structureIcon(type.icon)}
                      size={Math.round(22 * ("iconScale" in type ? type.iconScale : 1))} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-200">{t(categoryLabel(type.id))}</span>
                </button>
                <button type="button" onClick={() => { onOnlyStructure?.(); setCategories([type.id]); }} className="invisible rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent hover:bg-accent-soft group-hover/cat:visible group-focus-within/cat:visible">{t("structureMap.filters.only")}</button>
                <button type="button" onClick={() => toggleCategory(type.id)} aria-pressed={isActive} aria-label={t(isActive ? "structureMap.filters.hideCategory" : "structureMap.filters.showCategory", { category: t(categoryLabel(type.id)) })}
                  className={cn("grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border", isActive ? "border-accent bg-accent text-on-accent" : "border-zinc-500")}>{isActive && <Check size={11} strokeWidth={3} aria-hidden="true" />}</button>
              </div>;
            })}</div>}
          </div>;
        })}
      </div>
    </div>
  </section>;
};
export default WorldStructureFilterRail;
