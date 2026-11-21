import { ChevronDown, ChevronRight, MapPin, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { hasMapDefinition } from "../map/map-registry";
import { requestMapPointInMain } from "../map/map-window-bridge";
import type { ItemSourceMapLocation } from "./item-source-map-links";
import { cn } from "../../lib/cn";

const actionClass = "cursor-pointer rounded-[var(--radius-sm)] underline-offset-3 transition-colors hover:text-white hover:underline focus-visible:text-white focus-visible:underline focus-visible:outline-2";
const mapActionClass = cn(actionClass, "text-forever-blue focus-visible:outline-forever-blue");

export default function ItemSourceRow({ name, icon: Icon, details, locations, chance, reference, onOpenMap }: {
  name: string;
  icon: LucideIcon;
  details?: string;
  locations: ItemSourceMapLocation[];
  chance?: string;
  reference?: { label: string; open: () => void };
  onOpenMap?: (mapId: string, markerId: string) => void;
}) {
  const { t } = useTranslation();
  const gameText = useGameText();
  const targets = locations.filter((location) => hasMapDefinition(location.mapId));
  const openMap = (location: ItemSourceMapLocation) => onOpenMap
    ? onOpenMap(location.mapId, location.markerId) : requestMapPointInMain(location.markerId, location.mapId);
  const locationLabel = (location: ItemSourceMapLocation) => location.region ? gameText(location.region) : undefined;
  const locationDetails = targets.length === 1 ? locationLabel(targets[0]) : undefined;
  const mapAction = <>
    <MapPin size={12} className="shrink-0" aria-hidden="true" />
    {t(targets.length > 1 ? "database.itemResearch.viewLocations" : "database.itemResearch.openMap", { count: targets.length })}
    {targets.length > 1 && <ChevronDown size={12} aria-hidden="true" />}
  </>;
  return <div className="border-b border-border last:border-b-0">
    <div className="grid w-full min-w-0 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-3.5 text-left">
      <Icon size={17} className="shrink-0 self-center text-subtle" aria-hidden="true" />
      <div className="min-w-0">
        <span className="block break-words text-[13px] font-semibold leading-5 text-white">{name}</span>
        {(locationDetails || targets.length > 0) && <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] leading-5">
          {locationDetails && <span className="text-zinc-300">{locationDetails}</span>}
          {locationDetails && targets.length > 0 && <span className="text-subtle" aria-hidden="true">·</span>}
          {targets.length === 1 && <button type="button" onClick={() => openMap(targets[0])}
            aria-label={t("database.acquisition.searchOnMap", { name })}
            className={`inline-flex items-center gap-1 py-0.5 text-[11px] ${mapActionClass}`}>{mapAction}</button>}
          {targets.length > 1 && <details className="min-w-0 open:w-full">
            <summary className={`inline-flex list-none items-center gap-1 py-0.5 text-[11px] [&::-webkit-details-marker]:hidden ${mapActionClass}`}>{mapAction}</summary>
            <div className="mt-1 space-y-1">
              {targets.map((location, index) => <button key={`${location.mapId}:${location.markerId}`} type="button" onClick={() => openMap(location)}
                className={`flex w-full items-center gap-2 py-1.5 text-left text-[11px] ${mapActionClass}`}>
                <MapPin size={12} className="shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 break-words">{[locationLabel(location), t("database.itemResearch.locationNumber", { number: index + 1 })].filter(Boolean).join(" · ")}</span>
                <ChevronRight size={12} className="shrink-0" aria-hidden="true" />
              </button>)}
            </div>
          </details>}
        </div>}
        {details && <span className="mt-0.5 block text-[12px] leading-5 text-zinc-300">{details}</span>}
      </div>
      {chance && <span className="shrink-0 text-right">
        <span className="block text-[13px] font-semibold tabular-nums text-white">{chance}</span>
        <span className="mt-1 block text-[11px] text-zinc-300">{t("database.itemResearch.dropChance")}</span>
      </span>}
    </div>
    {reference && <button type="button" onClick={reference.open} className={`mb-3 ml-11 inline-flex max-w-[calc(100%-3.5rem)] items-center gap-1 px-1 py-1 text-left text-[12px] text-zinc-300 focus-visible:outline-accent ${actionClass}`}>
      <span className="min-w-0 break-words">{reference.label}</span><ChevronRight size={13} className="shrink-0" aria-hidden="true" />
    </button>}
  </div>;
}
