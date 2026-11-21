import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, ChevronRight, MapPin, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { contentUrl } from "../../lib/content-url";
import { getPortalRoot } from "../../lib/portal";
import { hasMapDefinition } from "../map/map-registry";
import MapPointIcon from "../map/map-point-icon";
import { requestMapPointInMain } from "../map/map-window-bridge";
import type { ItemSourceMapLocation } from "./item-source-map-links";
import { cn } from "../../lib/cn";

const actionClass = "cursor-pointer rounded-[var(--radius-sm)] underline-offset-3 transition-colors hover:text-white hover:underline focus-visible:text-white focus-visible:underline focus-visible:outline-2";
const mapActionClass = cn(actionClass, "text-forever-blue focus-visible:outline-forever-blue");

export default function ItemSourceRow({ name, icon, artwork, region, faction, details, locations, chance, reference, onOpenMap, mapActionAtEnd }: {
  name: string;
  icon: LucideIcon;
  artwork?: string;
  region?: string;
  faction?: string;
  details?: string;
  locations: ItemSourceMapLocation[];
  chance?: string;
  reference?: { label: string; open: () => void };
  onOpenMap?: (mapId: string, markerId: string) => void;
  mapActionAtEnd?: boolean;
}) {
  const { t } = useTranslation();
  const gameText = useGameText();
  const targets = locations.filter((location) => hasMapDefinition(location.mapId));
  const openMap = (location: ItemSourceMapLocation) => onOpenMap
    ? onOpenMap(location.mapId, location.markerId) : requestMapPointInMain(location.markerId, location.mapId);
  const locationLabel = (location: ItemSourceMapLocation) => location.region ? gameText(location.region) : undefined;
  const locationDetails = region ?? (targets.length === 1 ? locationLabel(targets[0]) : undefined);
  const mapButtonClass = cn("inline-flex items-center gap-1.5", mapActionClass, mapActionAtEnd
    ? "min-h-8 text-start text-xs" : "py-0.5 text-[11px]");
  const mapLabel = <>
    <MapPin size={12} className="shrink-0" aria-hidden="true" />
    <span>{t("database.itemResearch.openMap")}</span>
  </>;
  const mapAction = targets.length === 1 ? <button type="button" onClick={() => openMap(targets[0])}
    aria-label={t("database.acquisition.searchOnMap", { name })} className={mapButtonClass}>{mapLabel}</button>
    : targets.length > 1 ? <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className={mapButtonClass}>
        {mapLabel}<ChevronDown size={12} className="shrink-0" aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={getPortalRoot()}>
        <DropdownMenu.Content align={mapActionAtEnd ? "end" : "start"} sideOffset={4} collisionBoundary={getPortalRoot()} collisionPadding={8}
          className="pointer-events-auto z-[1600] w-max max-w-[min(240px,var(--radix-dropdown-menu-content-available-width))] max-h-[min(240px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto overscroll-contain rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-xl shadow-black/50">
          {targets.map((location, index) => <DropdownMenu.Item key={`${location.mapId}:${location.markerId}`} onSelect={() => openMap(location)}
            className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[11px] text-white outline-none data-[highlighted]:bg-surface-hover">
            <MapPin size={12} className="shrink-0 text-forever-blue" aria-hidden="true" />
            <span className="min-w-0 break-words">{[locationLabel(location), t("database.itemResearch.locationNumber", { number: index + 1 })].filter(Boolean).join(" · ")}</span>
          </DropdownMenu.Item>)}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root> : null;
  const inlineMapAction = mapActionAtEnd ? null : mapAction;
  return <div className="border-b border-border last:border-b-0">
    <div className={cn("grid w-full min-w-0 grid-cols-[24px_minmax(0,1fr)_auto] items-center px-3 py-3.5 text-start",
      mapActionAtEnd ? "gap-x-4" : "gap-x-3")}>
      <span className="grid size-6 place-items-center text-subtle">
        <MapPointIcon fallback={icon} source={artwork ? contentUrl(artwork) : undefined}
          size={artwork ? 24 : 17} className="object-contain" />
      </span>
      <div className="min-w-0">
        <span className={cn("block break-words font-semibold leading-5 text-white", mapActionAtEnd ? "text-sm" : "text-[13px]")}>{name}</span>
        {(locationDetails || faction || inlineMapAction) && <div className={cn("flex flex-wrap items-center gap-x-2 leading-5",
          mapActionAtEnd ? "mt-1 text-xs" : "mt-0.5 text-[11px]")}>
          {locationDetails && <span className="min-w-0 break-words text-zinc-300">{locationDetails}</span>}
          {faction && <span className={cn("text-subtle", locationDetails && "border-s border-border ps-2")}>{faction}</span>}
          {locationDetails && inlineMapAction && <span className="text-subtle" aria-hidden="true">·</span>}
          {inlineMapAction}
        </div>}
        {details && <span className="mt-0.5 block text-[12px] leading-5 text-zinc-300">{details}</span>}
      </div>
      {(chance || (mapActionAtEnd && mapAction)) && <div className="flex max-w-36 flex-col items-end gap-1">
        {chance && <span className="shrink-0 text-end">
          <span className="block text-[13px] font-semibold tabular-nums text-white">{chance}</span>
          <span className="mt-1 block text-[11px] text-zinc-300">{t("database.itemResearch.dropChance")}</span>
        </span>}
        {mapActionAtEnd && mapAction}
      </div>}
    </div>
    {reference && <button type="button" onClick={reference.open} className={`mb-3 ml-11 inline-flex max-w-[calc(100%-3.5rem)] items-center gap-1 px-1 py-1 text-left text-[12px] text-zinc-300 focus-visible:outline-accent ${actionClass}`}>
      <span className="min-w-0 break-words">{reference.label}</span><ChevronRight size={13} className="shrink-0" aria-hidden="true" />
    </button>}
  </div>;
}
