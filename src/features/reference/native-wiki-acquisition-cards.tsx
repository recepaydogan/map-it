import { ChevronRight, Coins, MapPin, Package } from "lucide-react";
import { useTranslation } from "react-i18next";
import ProgressiveList from "../../components/progressive-list";
import { contentUrl } from "../../lib/content-url";
import DatabaseSectionTitle from "../database/database-section-title";
import { getMapDisplayName } from "../map/map-display-name";
import { nativeEntryName } from "./native-wiki-presentation";
import { useReferenceNavigation } from "./reference-navigation-context";
import { useNativeJson, useNativeWikiIndex, type NativeAcquisition, type NativeWikiEntry, type NativeWikiLocation } from "./use-native-wiki";
import { simpleAcquisitionRewards, simpleAcquisitionSources, type SimpleAcquisitionSource, type SimpleSourceKind } from "./native-wiki-simple-acquisition-model";
import NativeWikiValues from "./native-wiki-values";

type Props = { rows: NativeAcquisition[]; entryId: string; itemPage: boolean; locations: NativeWikiLocation[]; onOpenMap: (mapId: string, markerId: string) => void };
const card = "flex w-full min-w-0 items-center gap-3 rounded-[var(--radius-md)] border border-border px-3 py-3 text-left";
const action = "cursor-pointer transition-colors hover:border-accent/40 hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent";
const grid = "grid gap-2 @min-[540px]:grid-cols-2 @min-[1050px]:grid-cols-3";
const uniqueLocations = (locations: NativeWikiLocation[]) => [...new Map(locations.map(location => [`${location.mapId}:${location.markerId}`, location])).values()];

const AcquisitionMapLinks = ({ locations, onOpenMap, compact = false }: Pick<Props, "locations" | "onOpenMap"> & { compact?: boolean }) => {
  const { t } = useTranslation();
  return <div className="flex flex-wrap gap-2">{uniqueLocations(locations).map(location => <button type="button" key={`${location.mapId}:${location.markerId}`} onClick={() => onOpenMap(location.mapId, location.markerId)}
    className="inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border px-3 py-2 text-left text-xs text-zinc-100 transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent">
    <MapPin size={15} aria-hidden="true" className="shrink-0 text-subtle" />{!compact && <span>{getMapDisplayName(location.mapId)}</span>}
    <span className="text-subtle">{!compact && "· "}{t("wiki.acquisitionView.openMap")}</span>
  </button>)}</div>;
};

const AcquisitionSourceCard = ({ source, locations, onOpenMap }: Pick<Props, "locations" | "onOpenMap"> & { source: SimpleAcquisitionSource }) => {
  const { t, i18n } = useTranslation();
  const open = useReferenceNavigation();
  const actor = source.actors.length === 1 ? source.actors[0] : undefined;
  const actorState = useNativeJson<NativeWikiEntry>(actor ? `data/wiki/entries/${actor.id}.json` : undefined);
  const spawnIds = new Set(source.rows.flatMap(row => row.spawn_ids ?? []));
  const directLocations = locations.filter(location => source.rows.some(row => row.containerId === location.markerId)
    || spawnIds.has(location.spawnId ?? location.markerId));
  const actorLocations = actorState.status === "ready" ? actorState.data.locations.filter(location => !spawnIds.size || spawnIds.has(location.spawnId ?? location.markerId)) : [];
  const resolvedLocations = uniqueLocations([...directLocations, ...actorLocations]);
  const knownIds = new Set(locations.map(location => `${location.mapId}:${location.markerId}`));
  const mapLocations = source.kind === "foundIn" ? resolvedLocations.filter(location => !knownIds.has(`${location.mapId}:${location.markerId}`)) : resolvedLocations;
  // The item's known map points are already shown above. Do not repeat their container cards.
  if (source.kind === "foundIn" && locations.length > 0 && mapLocations.length === 0) return null;
  const title = source.kind === "foundIn" ? mapLocations.length === 1 ? getMapDisplayName(mapLocations[0].mapId)
    : t("wiki.simpleAcquisition.mapLocation") : source.kind === "shops" && !source.actors.length ? t("wiki.simpleAcquisition.shop")
      : !source.actors.length ? t("wiki.simpleAcquisition.unknownLocation") : undefined;
  const quantity = source.quantity;
  const number = (value: number) => value.toLocaleString(i18n.language);
  return <div className="space-y-3 rounded-[var(--radius-md)] border border-border p-4">
    <div className="flex items-start gap-3">
      {actor?.icon && source.kind !== "foundIn" ? <img src={contentUrl(actor.icon)} alt="" loading="lazy" className="h-10 w-10 shrink-0 object-contain" />
        : <MapPin size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-subtle" />}
      <div className="min-w-0 flex-1 space-y-2">
        {title ? <p className="text-[13px] font-medium leading-snug text-zinc-100">{title}</p>
          : source.actors.map(target => <button type="button" key={target.id} onClick={() => open(target)} className="flex cursor-pointer items-center gap-2 text-left text-[13px] font-medium text-zinc-100 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">{nativeEntryName(target)}<ChevronRight size={14} aria-hidden="true" /></button>)}
      </div>
      {quantity && <span className="shrink-0 text-xs tabular-nums text-subtle">×{quantity.min === quantity.max ? number(quantity.min) : `${number(quantity.min)}–${number(quantity.max)}`}</span>}
    </div>
    {mapLocations.length > 0 && <AcquisitionMapLinks locations={mapLocations} onOpenMap={onOpenMap} compact={source.kind === "foundIn" && mapLocations.length === 1} />}
    {source.dust !== undefined && <p className="flex flex-wrap items-baseline gap-2 text-[13px]"><span className="text-subtle">{t("wiki.simpleAcquisition.price")}</span><span className="tabular-nums text-zinc-100">{number(source.dust)} {t("wiki.creatureLoot.dust")}</span></p>}
    {source.materials !== undefined && <NativeWikiValues value={source.materials} field="ConsumeMaterials" />}
  </div>;
};

const NativeWikiAcquisitionCards = ({ rows, entryId, itemPage, locations, onOpenMap }: Props) => {
  const { t, i18n } = useTranslation();
  const open = useReferenceNavigation();
  const index = useNativeWikiIndex();
  if (index.status !== "ready") return <p role={index.status === "error" ? "alert" : "status"} className="text-sm text-subtle">{t(index.status === "error" ? "reference.error" : "reference.loading")}</p>;
  if (!itemPage) {
    const rewards = simpleAcquisitionRewards(rows, index.data.itemsByNativeId);
    return <div className="native-wiki-simple-acquisition space-y-5">
      {locations.length > 0 && <AcquisitionMapLinks locations={locations} onOpenMap={onOpenMap} />}
      {rewards.length > 0 && <section><DatabaseSectionTitle>{t("wiki.simpleAcquisition.rewards")}</DatabaseSectionTitle>
        <div className="@container"><ProgressiveList className={grid} initialCount={12} pageSize={12}>{rewards.map(reward => {
          const name = reward.target ? nativeEntryName(reward.target) : reward.currency ? t("wiki.creatureLoot.dust") : t("wiki.unnamedEntries.items");
          const content = <>
            {reward.target?.icon ? <img src={contentUrl(reward.target.icon)} alt="" loading="lazy" className="h-10 w-10 shrink-0 object-contain" /> : reward.currency ? <Coins size={24} aria-hidden="true" className="m-2 text-subtle" /> : <Package size={24} aria-hidden="true" className="m-2 text-subtle" />}
            <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-zinc-100">{name}</span>
            {reward.quantity && <span className="shrink-0 text-xs tabular-nums text-subtle">×{reward.quantity.min.toLocaleString(i18n.language)}{reward.quantity.min !== reward.quantity.max && `–${reward.quantity.max.toLocaleString(i18n.language)}`}</span>}
            {reward.target && <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-subtle" />}
          </>;
          return reward.target ? <button type="button" key={reward.id} onClick={() => open(reward.target!)} className={`${card} ${action}`}>{content}</button> : <div key={reward.id} className={card}>{content}</div>;
        })}</ProgressiveList></div>
      </section>}
    </div>;
  }
  const knownLocations = uniqueLocations(locations);
  const sources = simpleAcquisitionSources(rows).filter(source => !(knownLocations.length > 0 && source.kind === "other"
    && !source.actors.length && source.dust === undefined && source.materials === undefined));
  const kinds: SimpleSourceKind[] = ["foundIn", "droppedBy", "encounters", "shops", "other"];
  return <div className="native-wiki-simple-acquisition space-y-6">{kinds.map(kind => {
    const group = sources.filter(source => source.kind === kind);
    const showKnownLocations = kind === "foundIn" && knownLocations.length > 0;
    if (!group.length && !showKnownLocations) return null;
    return <section key={`${entryId}:${kind}`}><DatabaseSectionTitle>{t(`wiki.simpleAcquisition.${kind}`)}</DatabaseSectionTitle>
      {showKnownLocations && <div className="mb-3"><AcquisitionMapLinks locations={knownLocations} onOpenMap={onOpenMap} /></div>}
      <div className="@container"><ProgressiveList className={grid} initialCount={6}>{group.map(source => <AcquisitionSourceCard key={source.id} source={source} locations={locations} onOpenMap={onOpenMap} />)}</ProgressiveList></div>
    </section>;
  })}</div>;
};
export default NativeWikiAcquisitionCards;
