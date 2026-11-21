import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getItemDisplayName } from "../../lib/item-display-name";
import { useGameText } from "../../i18n/game-text";
import ItemIcon from "../database/item-icon";
import { createSearchSourceContext, type SearchItemResult, type SearchLocation, type SearchSourceContext } from "./map-global-search";
import { groupSearchSources, moreRowId, SOURCE_PREVIEW, sourceRowId } from "./map-search-rows";
import { getLocalizedMapPointDisplayName } from "./map-point-display-name";
import MapSearchLocationIcon from "./map-search-location-icon";

export default function MapItemSearchResults({ items, locations, limits, activeRowId, onHover, onSelect, onMore }: {
  items: SearchItemResult[]; locations: SearchLocation[]; limits: Record<string, number>; activeRowId: string | null;
  onHover: (id: string) => void; onSelect: (target: SearchLocation, context?: SearchSourceContext) => void; onMore: (id: string) => void;
}) {
  const { t } = useTranslation();
  const gameText = useGameText();
  if (!items.length) return null;
  const rowClass = (id: string) => cn("flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent", activeRowId === id ? "bg-white/10" : "hover:bg-surface-hover");
  return <>
    <div role="presentation" className="border-t border-border px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-subtle">{t("map.search.globalItems")}</div>
    {items.map(item => {
      return <div key={item.id} role="group" aria-label={getItemDisplayName(item.name)} className="pb-2">
        <div role="presentation" className="flex items-center gap-2.5 px-2.5 py-2">
          <ItemIcon icon={item.icon} name={getItemDisplayName(item.name)} size={32} />
          <strong className="min-w-0 flex-1 text-[12px] font-semibold text-zinc-100">{gameText(getItemDisplayName(item.name), `ItemSparse:${item.id}:4`)}</strong>
        </div>
        <div className="ml-6 border-l border-border pl-1">
          {groupSearchSources(item).map(group => {
            const limit = limits[group.id] ?? SOURCE_PREVIEW;
            const hidden = group.entries.length - limit;
            return <div key={group.id} role="group" aria-label={t(`map.search.sourceGroups.${group.kind}`)}>
              <div role="presentation" className="px-2.5 pb-1 pt-2 text-[10px] font-semibold text-zinc-400">
                {t(`map.search.sourceGroups.${group.kind}`)}
              </div>
          {group.entries.slice(0, limit).map(({ source, index }) => {
            const target = locations[source.location];
            if (!target) return null;
            const id = sourceRowId(item.id, index);
            return <button key={id} id={`map-search-row-${id}`} type="button" role="option" aria-selected={activeRowId === id}
              onMouseEnter={() => onHover(id)} onClick={() => onSelect(target, createSearchSourceContext(item, source))} className={rowClass(id)}>
              <MapSearchLocationIcon point={target.point} compact />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-medium text-zinc-100">{getLocalizedMapPointDisplayName(target.point, gameText)}</span>
                <span className="block text-[10px] text-subtle">{gameText(target.point.region || target.mapName)}</span>
              </span>
            </button>;
          })}
          {hidden > 0 && <button id={`map-search-row-${moreRowId(group.id)}`} type="button" role="option" aria-selected={activeRowId === moreRowId(group.id)}
            onMouseEnter={() => onHover(moreRowId(group.id))} onClick={() => onMore(group.id)} className={cn(rowClass(moreRowId(group.id)), "text-[11px] text-subtle")}>
            <ChevronDown size={13} aria-hidden="true" />{t("map.search.globalMoreSources", { count: hidden })}
          </button>}
            </div>;
          })}
        </div>
      </div>;
    })}
  </>;
}
