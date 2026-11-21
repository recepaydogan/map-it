import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import { getItemDisplayName } from "../../lib/item-display-name";
import ItemIcon from "../database/item-icon";
import ItemGrade from "../database/item-grade";
import ReferenceRewardRates from "../reference/reference-reward-rates";
import { createSearchSourceContext, type SearchItemResult, type SearchLocation, type SearchSourceContext } from "./map-global-search";
import { moreRowId, SOURCE_PREVIEW, sourceRowId } from "./map-search-rows";
import MapSearchLocationIcon from "./map-search-location-icon";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import { formatGameName } from "../../lib/game-display-text";
import { getMapPointDisplayName } from "./map-point-display-name";

export default function MapItemSearchResults({ items, locations, limits, activeRowId, onHover, onSelect, onMore }: {
  items: SearchItemResult[]; locations: SearchLocation[]; limits: Record<string, number>; activeRowId: string | null;
  onHover: (id: string) => void; onSelect: (target: SearchLocation, context?: SearchSourceContext) => void; onMore: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const itemName = (item: { id: string; name: string }) => getItemDisplayName(gameText(item.name, `Wiki:${item.id}:/name`));
  const openReference = useReferenceNavigation();
  if (!items.length) return null;
  const rowClass = (id: string) => cn("flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent", activeRowId === id ? "bg-accent-soft" : "hover:bg-surface-hover");
  return <>
    <div role="presentation" className="border-t border-border px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-subtle">{t("map.search.globalItems")}</div>
    {items.map(item => {
      const limit = limits[item.id] ?? SOURCE_PREVIEW;
      const hidden = item.sources.length - limit;
      return <div key={item.id} role="group" aria-label={itemName(item)} className="pb-2">
        <div role="presentation" className="flex items-center gap-2.5 px-2.5 py-2">
          <ItemIcon icon={item.icon} name={itemName(item)} size={32} />
          <span className="min-w-0 flex-1"><button type="button" onClick={() => openReference({ category: "items", id: item.id, name: itemName(item) })} className="block cursor-pointer text-left text-[12px] font-semibold text-zinc-100 hover:text-accent hover:underline">{itemName(item)}</button>
            <span className="block text-[10px] text-subtle">{t(`wiki.groups.${item.category}`, { defaultValue: item.category })}{item.grade && !item.grade.startsWith("EItemLevel::") && <> · <ItemGrade grade={item.grade} /></>} · {t("map.search.globalSourceCount", { count: item.sourceCount })}</span></span>
        </div>
        <div className="ml-6 border-l border-border pl-1">
          {item.sources.slice(0, limit).map((source, index) => {
            const target = locations[source.location];
            if (!target) return null;
            const id = sourceRowId(item.id, index);
            return <button key={id} id={`map-search-row-${id}`} type="button" role="option" aria-selected={activeRowId === id}
              onMouseEnter={() => onHover(id)} onClick={() => onSelect(target, createSearchSourceContext(item, source))} className={rowClass(id)}>
              <MapSearchLocationIcon point={target.point} compact />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-medium text-zinc-100">{getMapPointDisplayName(target.point)}{target.count > 1 && <span className="ml-1 text-subtle">×{target.count}</span>}</span>
                <span className="block text-[10px] text-subtle">{target.point.category.startsWith("native-") ? formatGameName(t(`map.maps.names.${target.mapId}`, { defaultValue: target.mapName })) : [...new Set([target.mapName, target.point.region].filter(Boolean))].join(" · ")}</span>
                {!!source.via?.length && <span className="mt-0.5 block text-[11px] text-zinc-200">{t("map.search.globalVia", { names: source.via.map(itemName).join(" → ") })}</span>}
                {!!source.price?.length && <span className="block text-[11px] text-accent">{source.price.map(price => `${price.amount.toLocaleString(i18n.language)} ${gameText(price.currency)}`).join(" + ")}</span>}
                {!!source.rates?.length && <ReferenceRewardRates rates={source.rates} />}
              </span>
              <span className="max-w-24 shrink-0 rounded-[var(--radius-sm)] border border-border bg-elevated px-1.5 py-1 text-[10px] font-medium text-accent">
                {t(`map.search.sourceKinds.${source.kind}`)}
                {source.originKind && <span className="block text-subtle">{t(`map.search.sourceKinds.${source.originKind}`)}</span>}
              </span>
            </button>;
          })}
          {hidden > 0 && <button id={`map-search-row-${moreRowId(item.id)}`} type="button" role="option" aria-selected={activeRowId === moreRowId(item.id)}
            onMouseEnter={() => onHover(moreRowId(item.id))} onClick={() => onMore(item.id)} className={cn(rowClass(moreRowId(item.id)), "text-[11px] text-subtle")}>
            <ChevronDown size={13} aria-hidden="true" />{t("map.search.globalMoreSources", { count: hidden })}
          </button>}
        </div>
      </div>;
    })}
  </>;
}
