import { getItemDisplayName } from "../../lib/item-display-name";
import ProgressiveList from "../../components/progressive-list";
import { CalendarDays, ChevronRight, Hammer, MapPin, Pickaxe, ScrollText, Skull, Store, Swords } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { ACQUISITION_CREATURE_ID_PREFIX, EVENT_ATTENDANCE_SOURCE_NAME, EVENT_CANDY_FRAGMENT_ITEM_ID, EVENT_CANDY_FRAGMENT_SOURCE_NAME, EVENT_MISSIONS_REWARD_ITEM_ID } from "../../game-config";
import { useGameText } from "../../i18n/game-text";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import { useReferenceIndex } from "../reference/use-reference-data";
import DatabaseSectionTitle from "./database-section-title";
import { groupCraftingStations, groupItemDrops, type GroupedItemSource } from "./group-item-sources";
import type { ItemAcquisition, ItemAcquisitionSource } from "./item-database-types";
import { getAcquisitionRegionTarget } from "./acquisition-region-target";
import { useAcquisitionRegions } from "./use-acquisition-regions";
import { useMerchantMapLocations } from "./use-merchant-map-locations";
import { requestMapItemInMain, requestMapSearchInMain } from "../map/map-window-bridge";
import { openEventMissions } from "../events/event-mission-navigation";
import EventFragmentDungeons from "../events/event-fragment-dungeons";
import { useEventMissions } from "../events/use-event-missions";

const sourceIcon = (kind: ItemAcquisitionSource["kind"]) => {
  if (kind === "boss-drop") return Skull;
  if (kind === "enemy-drop") return Swords;
  if (kind === "gather") return Pickaxe;
  if (kind === "craft-station") return Hammer;
  if (kind === "pickup") return MapPin;
  return Store;
};

const ItemAcquisitionSection = ({
  itemId, acquisition, notes = [], onOpenMap, hideTitle = false,
}: {
  itemId?: string;
  acquisition: ItemAcquisition | null;
  notes?: string[];
  onOpenMap?: (mapId: string, markerId: string) => void;
  hideTitle?: boolean;
}) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const openReference = useReferenceNavigation();
  const index = useReferenceIndex(Boolean(acquisition?.drops.length));
  const regions = useAcquisitionRegions(acquisition?.gathering ?? [], Boolean(onOpenMap));
  const merchantMaps = useMerchantMapLocations(Boolean(acquisition?.merchants.length));
  const eventMissions = useEventMissions(itemId === EVENT_MISSIONS_REWARD_ITEM_ID);
  const missionSource = eventMissions.status === "ready" && eventMissions.data.reward.itemId === itemId;
  const creatures = useMemo(() => new Map(index.status === "ready"
    ? index.data.entries.filter((entry) => entry.category === "creatures").map((entry) => [entry.id, entry]) : []), [index]);

  const drops = groupItemDrops(acquisition?.drops ?? []);
  const crafting = groupCraftingStations(acquisition?.crafting ?? []);
  const isEventAttendanceSource = (source: ItemAcquisitionSource) => itemId === EVENT_MISSIONS_REWARD_ITEM_ID
    && source.kind === "pickup" && source.name === EVENT_ATTENDANCE_SOURCE_NAME;
  const pickups = acquisition?.pickups ?? [];
  const attendanceSources = pickups.filter(isEventAttendanceSource);
  const fragmentSource = itemId === EVENT_CANDY_FRAGMENT_ITEM_ID
    && pickups.some((source) => source.name === EVENT_CANDY_FRAGMENT_SOURCE_NAME);
  const worldPickups = pickups.filter((source) => !isEventAttendanceSource(source)
    && !(fragmentSource && source.name === EVENT_CANDY_FRAGMENT_SOURCE_NAME));

  if (!acquisition && notes.length === 0 && !missionSource) {
    if (itemId === EVENT_MISSIONS_REWARD_ITEM_ID && eventMissions.status !== "ready") return <p role={eventMissions.status === "error" ? "alert" : "status"} className="text-xs text-subtle">{t(eventMissions.status === "error" ? "reference.error" : "reference.loading")}</p>;
    return <section>{!hideTitle && <DatabaseSectionTitle>{t("database.acquisition.title")}</DatabaseSectionTitle>}<p className="text-[12px] text-zinc-500">{t("database.acquisition.none")}</p></section>;
  }

  const groups = [
    { key: "drops", sources: drops, total: drops.length },
    { key: "merchants", sources: (acquisition?.merchants ?? []).map((source) => ({ source })), total: acquisition?.merchants.length ?? 0 },
    { key: "eventAttendance", sources: attendanceSources.map((source) => ({ source })), total: attendanceSources.length },
    { key: "pickups", sources: worldPickups.map((source) => ({ source })), total: worldPickups.length },
    { key: "gathering", sources: (acquisition?.gathering ?? []).map((source) => ({ source })), total: acquisition?.gathering.length ?? 0 },
    { key: "crafting", sources: crafting, total: crafting.length },
    { key: "coinShops", sources: (acquisition?.coinShops ?? []).map((source) => ({ source })), total: acquisition?.coinShops.length ?? 0 },
    { key: "shops", sources: (acquisition?.shops ?? []).map((source) => ({ source })), total: acquisition?.shops.length ?? 0 },
  ] as const;

  const sourceRow = ({ source, minLevel, maxLevel }: GroupedItemSource, index: number) => {
    const isEventAttendance = isEventAttendanceSource(source);
    const Icon = isEventAttendance ? CalendarDays : sourceIcon(source.kind);
    const mapTarget = source.markerId ?? (source.kind === "gather" ? getAcquisitionRegionTarget(source, regions.maps) : undefined);
    const canOpenMap = source.kind !== "merchant" && Boolean(source.mapId && mapTarget && onOpenMap);
    const canSearchPickup = source.kind === "pickup" && Boolean(source.itemId && source.mapId && onOpenMap);
    const canSearchMap = source.kind === "merchant" && merchantMaps.status === "ready"
      && [source.entityId, ...(source.entityIds ?? [])].some((id) => id
        && merchantMaps.npcs[`${ACQUISITION_CREATURE_ID_PREFIX}${id}`]?.some((mapId) => !source.mapId || source.mapId === mapId));
    const creature = (source.kind === "enemy-drop" || source.kind === "boss-drop") && source.entityId
      ? creatures.get(`${ACQUISITION_CREATURE_ID_PREFIX}${source.entityId}`) : undefined;
    const price = source.price?.map(({ amount, currency }) => `${amount.toLocaleString(i18n.language)} ${gameText(currency)}`).join(" + ");
    const details = [
      source.region && gameText(source.region),
      source.kind === "merchant" ? undefined : source.shop && gameText(source.shop),
      minLevel !== undefined && maxLevel !== undefined && minLevel !== maxLevel
        ? t("database.acquisition.sourceLevelRange", { min: minLevel, max: maxLevel })
        : source.level ? t("database.acquisition.sourceLevel", { level: source.level }) : undefined,
      source.bundle && source.bundle > 1 ? t("database.acquisition.bundle", { count: source.bundle }) : undefined,
      source.markerCount ? t("database.acquisition.mapLocations", { count: source.markerCount }) : undefined,
      source.limit ? t("database.acquisition.limit", { count: source.limit }) : undefined,
    ].filter(Boolean).join(" · ");
    const content = <>
      <Icon size={16} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-zinc-100">{source.kind === "cash-shop" ? t("database.acquisition.cashShop") : getItemDisplayName(source.name, gameText(source.name))}</span>
        {isEventAttendance && <span className="mt-0.5 block text-[11px] text-zinc-400">{t("database.acquisition.eventAttendanceWhere")}</span>}
        {source.kind === "merchant" && price && <span className="mt-1 block break-words text-[12px] font-medium text-accent">{price}</span>}
        {(details || source.kind === "boss-drop" || source.kind === "enemy-drop") && <span className="mt-0.5 block text-[11px] text-zinc-400">{[source.kind === "boss-drop" ? t("database.acquisition.boss") : source.kind === "enemy-drop" ? t("database.acquisition.enemy") : undefined, details].filter(Boolean).join(" · ")}</span>}
      </span>
      {price && source.kind !== "merchant" && <span className="shrink-0 text-right text-[12px] font-medium text-amber-300">{price}</span>}
      {canOpenMap && <MapPin size={15} className="shrink-0 text-accent" aria-label={t("database.acquisition.showOnMap")} />}
      {canSearchMap && <ChevronRight size={15} className="shrink-0 text-accent" aria-hidden="true" />}
      {!canOpenMap && creature && <ChevronRight size={15} className="shrink-0 text-accent" aria-hidden="true" />}
    </>;
    const className = cn("flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-3 py-2 text-left", source.kind === "merchant" && "@min-[620px]:w-[calc(50%-3px)]");
    const key = `${source.kind}:${source.entityId ?? source.entityIds?.join(",") ?? source.name}:${source.region ?? ""}:${index}`;
    return canSearchPickup || canSearchMap || canOpenMap || creature
      ? <button key={key} type="button" onClick={() => {
        if (canSearchPickup) requestMapItemInMain(source.itemId!, source.name, source.mapId!, source.markerIds);
        else if (canSearchMap) requestMapSearchInMain(source.name);
        else if (canOpenMap) onOpenMap?.(source.mapId!, mapTarget!);
        else if (creature) openReference(creature);
      }} title={canSearchPickup || canSearchMap ? t("database.acquisition.searchOnMap", { name: getItemDisplayName(source.name, gameText(source.name)) }) : canOpenMap ? t("database.acquisition.showOnMap") : undefined} className={cn(className, "cursor-pointer transition-colors hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent")}>{content}</button>
      : <div key={key} className={className}>{content}</div>;
  };

  return <section>
    <div className="max-w-[720px] space-y-4">
      {missionSource && <div>
        {!hideTitle && <DatabaseSectionTitle>{t("database.acquisition.title")}</DatabaseSectionTitle>}
        <button type="button" onClick={openEventMissions} className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border border-accent/35 bg-accent-soft px-3 py-3 text-left hover:border-accent/60 focus-visible:outline-2 focus-visible:outline-accent">
          <ScrollText size={18} className="shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-white">{t("events.missions.itemSource")}</span><span className="mt-0.5 block text-[11px] text-zinc-200">{t("events.missions.itemSourceDetail", { count: eventMissions.data.missions.length })}</span></span>
          <ChevronRight size={15} className="shrink-0 text-accent" aria-hidden="true" />
        </button>
      </div>}
      {fragmentSource && <div>
        {!hideTitle && <DatabaseSectionTitle>{t("database.acquisition.title")}</DatabaseSectionTitle>}
        <p className="mb-3 text-[12px] leading-5 text-zinc-300">{t("events.guide.fragmentSource")}</p>
        <EventFragmentDungeons />
      </div>}
      {notes.length > 0 && <div className="space-y-1 text-[13px] leading-relaxed text-zinc-300">
        {notes.map((note) => <p key={note}>{gameText(note)}</p>)}
      </div>}
      {groups.filter(({ total }) => total > 0).map(({ key, sources }) => <div key={key} className={cn(key === "merchants" && "@container")}>
        <DatabaseSectionTitle>{t(`database.acquisition.${key}`)}</DatabaseSectionTitle>
        <ProgressiveList initialCount={3} className={key === "merchants" ? "flex flex-wrap justify-start gap-1.5" : "space-y-1.5"}>{sources.map(sourceRow)}</ProgressiveList>
      </div>)}
      {index.status === "error" && acquisition?.drops.length ? <p role="alert" className="text-xs text-subtle">{t("reference.error")}</p> : null}
      {merchantMaps.status === "error" && acquisition?.merchants.length ? <p role="alert" className="text-xs text-subtle">{t("reference.error")}</p> : null}
      {regions.error && <p role="alert" className="text-xs text-subtle">{t("reference.error")}</p>}
    </div>
  </section>;
};

export default ItemAcquisitionSection;
