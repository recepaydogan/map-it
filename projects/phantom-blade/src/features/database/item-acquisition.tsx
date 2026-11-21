import { getItemDisplayName } from "../../lib/item-display-name";
import ProgressiveList from "../../components/progressive-list";
import { ChevronRight, Hammer, MapPin, Pickaxe, Skull, Store, Swords } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { ACQUISITION_CREATURE_ID_PREFIX } from "../../game-config";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import { useReferenceIndex } from "../reference/use-reference-data";
import DatabaseSectionTitle from "./database-section-title";
import { groupCraftingStations, groupItemDrops, type GroupedItemSource } from "./group-item-sources";
import type { ItemAcquisition, ItemAcquisitionSource } from "./item-database-types";
import { getAcquisitionRegionTarget } from "./acquisition-region-target";
import { useAcquisitionRegions } from "./use-acquisition-regions";
import { useMerchantMapLocations } from "./use-merchant-map-locations";
import { requestMapSearchInMain } from "../map/map-window-bridge";
import { hasItemAcquisitionSources } from "./item-acquisition-availability";

const sourceIcon = (kind: ItemAcquisitionSource["kind"]) => {
  if (kind === "boss-drop") return Skull;
  if (kind === "enemy-drop") return Swords;
  if (kind === "gather") return Pickaxe;
  if (kind === "craft-station") return Hammer;
  if (kind === "pickup") return MapPin;
  return Store;
};

const ItemAcquisitionSection = ({
  acquisition, notes = [], onOpenMap,
}: {
  acquisition: ItemAcquisition | null;
  notes?: string[];
  onOpenMap?: (mapId: string, markerId: string) => void;
}) => {
  const { t, i18n } = useTranslation();
  const openReference = useReferenceNavigation();
  const index = useReferenceIndex(Boolean(acquisition?.drops.length));
  const regions = useAcquisitionRegions(acquisition?.gathering ?? [], Boolean(onOpenMap));
  const merchantMaps = useMerchantMapLocations(Boolean(acquisition?.merchants.length));
  const creatures = useMemo(() => new Map(index.status === "ready"
    ? index.data.entries.filter((entry) => entry.category === "creatures").map((entry) => [entry.id, entry]) : []), [index]);

  const drops = groupItemDrops(acquisition?.drops ?? []);
  const crafting = groupCraftingStations(acquisition?.crafting ?? []);

  if (!hasItemAcquisitionSources(acquisition) && notes.length === 0) return null;

  const groups = [
    { key: "drops", sources: drops, total: drops.length },
    { key: "merchants", sources: (acquisition?.merchants ?? []).map((source) => ({ source })), total: acquisition?.merchants.length ?? 0 },
    { key: "pickups", sources: (acquisition?.pickups ?? []).map((source) => ({ source })), total: acquisition?.pickups.length ?? 0 },
    { key: "gathering", sources: (acquisition?.gathering ?? []).map((source) => ({ source })), total: acquisition?.gathering.length ?? 0 },
    { key: "crafting", sources: crafting, total: crafting.length },
    { key: "coinShops", sources: (acquisition?.coinShops ?? []).map((source) => ({ source })), total: acquisition?.coinShops.length ?? 0 },
    { key: "shops", sources: (acquisition?.shops ?? []).map((source) => ({ source })), total: acquisition?.shops.length ?? 0 },
  ] as const;

  const sourceRow = ({ source, minLevel, maxLevel }: GroupedItemSource, index: number) => {
    const Icon = sourceIcon(source.kind);
    const mapTarget = source.markerId ?? (source.kind === "gather" ? getAcquisitionRegionTarget(source, regions.maps) : undefined);
    const canOpenMap = source.kind !== "merchant" && Boolean(source.mapId && mapTarget && onOpenMap);
    const canSearchMap = source.kind === "merchant" && merchantMaps.status === "ready"
      && [source.entityId, ...(source.entityIds ?? [])].some((id) => id
        && merchantMaps.npcs[`${ACQUISITION_CREATURE_ID_PREFIX}${id}`]?.some((mapId) => !source.mapId || source.mapId === mapId));
    const creature = (source.kind === "enemy-drop" || source.kind === "boss-drop") && source.entityId
      ? creatures.get(`${ACQUISITION_CREATURE_ID_PREFIX}${source.entityId}`) : undefined;
    const price = source.price?.map(({ amount, currency }) => `${amount.toLocaleString(i18n.language)} ${currency}`).join(" + ");
    const details = [
      source.region,
      source.kind === "merchant" ? undefined : source.shop,
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
        <span className="block text-[13px] font-medium text-zinc-100">{getItemDisplayName(source.name)}</span>
        {(details || source.kind === "boss-drop" || source.kind === "enemy-drop") && <span className="mt-0.5 block text-[11px] text-zinc-400">{[source.kind === "boss-drop" ? t("database.acquisition.boss") : source.kind === "enemy-drop" ? t("database.acquisition.enemy") : undefined, details].filter(Boolean).join(" · ")}</span>}
      </span>
      {price && <span className="shrink-0 text-right text-[12px] font-medium text-amber-300">{price}</span>}
      {canOpenMap && <MapPin size={15} className="shrink-0 text-accent" aria-label={t("database.acquisition.showOnMap")} />}
      {canSearchMap && <ChevronRight size={15} className="shrink-0 text-accent" aria-hidden="true" />}
      {!canOpenMap && creature && <ChevronRight size={15} className="shrink-0 text-accent" aria-hidden="true" />}
    </>;
    const className = "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-3 py-2 text-left";
    const key = `${source.kind}:${source.entityId ?? source.entityIds?.join(",") ?? source.name}:${source.region ?? ""}:${index}`;
    return canSearchMap || canOpenMap || creature
      ? <button key={key} type="button" onClick={() => {
        if (canSearchMap) requestMapSearchInMain(source.name);
        else if (canOpenMap) onOpenMap?.(source.mapId!, mapTarget!);
        else if (creature) openReference(creature);
      }} title={canSearchMap ? t("database.acquisition.searchOnMap", { name: source.name }) : canOpenMap ? t("database.acquisition.showOnMap") : undefined} className={cn(className, "cursor-pointer transition-colors hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent")}>{content}</button>
      : <div key={key} className={className}>{content}</div>;
  };

  return <section>
    <div className="max-w-[720px] space-y-4">
      {notes.length > 0 && <div className="space-y-1 text-[13px] leading-relaxed text-zinc-300">
        {notes.map((note) => <p key={note}>{note}</p>)}
      </div>}
      {groups.filter(({ total }) => total > 0).map(({ key, sources }) => <div key={key}>
        <DatabaseSectionTitle>{t(`database.acquisition.${key}`)}</DatabaseSectionTitle>
        <ProgressiveList initialCount={3} className="space-y-1.5">{sources.map(sourceRow)}</ProgressiveList>
      </div>)}
      {index.status === "error" && acquisition?.drops.length ? <p role="alert" className="text-xs text-subtle">{t("reference.error")}</p> : null}
      {merchantMaps.status === "error" && acquisition?.merchants.length ? <p role="alert" className="text-xs text-subtle">{t("reference.error")}</p> : null}
      {regions.error && <p role="alert" className="text-xs text-subtle">{t("reference.error")}</p>}
    </div>
  </section>;
};

export default ItemAcquisitionSection;
