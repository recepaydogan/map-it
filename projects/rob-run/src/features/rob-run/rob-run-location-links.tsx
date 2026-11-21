import { ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import DatabaseSectionTitle from "../database/database-section-title";
import DropSearchHeader from "../database/drop-search-header";
import { getCategoryConfig } from "../map/map-config";
import MapLinkedMarkers from "../map/map-linked-markers";
import MapSearchLocationIcon from "../map/map-search-location-icon";
import { isUserMapMarker, type MapLocation, type MapPoint } from "../map/types";
import { sameReferenceTarget, useSelectedReference } from "../reference/reference-navigation-context";
import { loadCodexMap, type CodexMapFacts, type CodexMarkerFacts, type CodexMarkerItem } from "./rob-run-codex-data";
import { getItemVariantKey, getRarityKey, loadRobRunItems, type CatalogItem } from "./rob-run-data";
import { itemRarityClass, RobRunItemIcon } from "./rob-run-rarity";

interface LocationLinksProps {
  point: MapLocation;
  mapId: string;
  locations: readonly MapPoint[];
  onOpenMap: (mapId: string, markerId: string) => void;
  onOpenItem: (id: string, quantity?: number, name?: string) => void;
}

const LOOT_SEARCH_THRESHOLD = 30;

function LocationItems({ point, facts, loot, onOpenItem }: Pick<LocationLinksProps, "point" | "onOpenItem"> & {
  facts?: CodexMarkerFacts;
  loot?: CodexMarkerItem[];
}) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<CatalogItem[]>([]);

  useEffect(() => {
    let active = true;
    void loadRobRunItems().then((catalog) => {
      if (active) setItems(catalog);
    }, () => {});
    return () => { active = false; };
  }, []);
  const previewLoot = !facts ? point.previewRewardIds?.map((item) => ({ item })) : undefined;
  const byId = new Map(items.map((item) => [item.id, item]));
  const format = new Intl.NumberFormat(i18n.resolvedLanguage);
  const money = new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  });
  const local = (key: string) => t(`robRun.location.${key}`);
  const stat = (label: string, value: string | number) =>
    <div key={label} className="flex justify-between gap-3"><dt className="text-muted">{label}</dt><dd className="text-right">{value}</dd></div>;
  const section = (title: string, entries: CodexMarkerItem[] | undefined, lootList = false) => {
    if (!entries?.length) return null;
    const rows = entries.flatMap((entry) => {
      const item = byId.get(entry.item);
      if (!item) return [];
      const isCash = item.gameId === "cash_1";
      const amountFormat = isCash ? money : format;
      const amount = entry.min === undefined ? undefined : entry.max !== undefined && entry.max !== entry.min
        ? `${amountFormat.format(entry.min)}–${amountFormat.format(entry.max)}` : amountFormat.format(entry.min);
      const quantityLabel = amount && !isCash ? `×${amount}` : amount;
      const rarity = getRarityKey(item.rarity, item.reference?.rarity);
      const variant = getItemVariantKey(item);
      const subtitle = lootList ? [
        rarity && t(`robRun.rarity.${rarity}`),
        variant && t(`robRun.wiki.${variant}`),
      ].filter(Boolean).join(" · ") : undefined;
      return [{ id: item.id, name: [item.name, subtitle].filter(Boolean).join(" "), element: <ItemRow key={item.id} id={item.id} item={item} subtitle={subtitle}
        onOpen={onOpenItem} quantity={entry.min !== undefined && entry.min === entry.max ? entry.min : undefined}
        meta={[quantityLabel, entry.points !== undefined ? t("robRun.location.refillPoints", { count: entry.points }) : undefined,
          entry.opens, entry.sellPrice !== undefined ? money.format(entry.sellPrice) : undefined]
          .filter(Boolean).join(" · ")} /> }];
    });
    if (!rows.length) return null;
    return lootList
      ? <LootSection title={title} rows={rows} />
      : <LocationSection title={title} count={rows.length}>{rows.map(({ element }) => element)}</LocationSection>;
  };
  const inside = Object.entries(facts?.inside ?? {}).map(([key, value]) =>
    stat(t(`robRun.location.inside.${key}`, { defaultValue: key }), format.format(value)));
  const details = [
    ...(facts?.unlockSeconds !== undefined ? [stat(local("unlockTime"),
      t("robRun.economy.seconds", { amount: format.format(facts.unlockSeconds) }))] : []),
    ...(facts?.drillSeconds !== undefined ? [stat(local("drillTime"),
      t("robRun.economy.seconds", { amount: format.format(facts.drillSeconds) }))] : []),
    ...Object.entries(facts?.facts ?? {}).map(([key, value]) => stat(key, value)),
  ];
  return <>
    {section(local(facts?.random ? "potentialLoot" : "canBeFoundHere"), loot, true)}
    {section(t("robRun.heists.previewRewards"), previewLoot)}
    {section(local("item"), facts?.requirements)}
    {!facts && point.requiredItemId && <LocationSection title={local("item")}>
      <ItemRow id={point.requiredItemId} item={byId.get(point.requiredItemId)} onOpen={onOpenItem}
        fallback={t("robRun.catalog.viewRequiredItem")} />
    </LocationSection>}
    {section(local("refills"), facts?.refills)}
    {section(local("panelKeys"), facts?.keys)}
    {inside.length > 0 && <LocationSection title={local("insideTitle")}>
      <dl className="grid gap-2 text-xs">{inside}</dl>
    </LocationSection>}
    {details.length > 0 && <LocationSection title={local(facts?.unlockSeconds !== undefined || facts?.drillSeconds !== undefined
      ? "accessDetails" : "details")}>
      <dl className="grid gap-2 text-xs">{details}</dl>
    </LocationSection>}
    {section(local("relatedItems"), facts?.relatedItems)}
    {facts?.activities?.length ? <LocationSection title={local("activities")}>
      <ul className="list-inside list-disc text-sm text-muted">{facts.activities.map((activity) => <li key={activity}>{activity}</li>)}</ul>
    </LocationSection> : null}
    {point.referenceCoordinates && <dl className="mt-4 border-t border-border pt-3 text-xs">
      {stat(local("position"), t("map.details.coordinatePair", {
        x: format.format(point.referenceCoordinates.x),
        y: format.format(point.referenceCoordinates.y),
      }))}
    </dl>}
  </>;
}

function LootSection({ title, rows }: { title: string; rows: { id: string; name: string; element: ReactNode }[] }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const searchable = rows.length > LOOT_SEARCH_THRESHOLD;
  const term = searchable ? query.trim().toLocaleLowerCase() : "";
  const matches = term ? rows.filter(({ name }) => name.toLocaleLowerCase().includes(term)) : rows;

  return <section className="mt-4" aria-label={title} data-long-loot-list={searchable ? "" : undefined}>
    <DropSearchHeader title={title} count={rows.length} titleCount={searchable ? rows.length : undefined}
      query={query} onQueryChange={setQuery} searchThreshold={LOOT_SEARCH_THRESHOLD} />
    {matches.length > 0
      ? <ul className="space-y-1.5">{matches.map(({ id, element }) =>
        <li key={id} className="[contain-intrinsic-size:auto_42px] [content-visibility:auto]">{element}</li>)}</ul>
      : <p role="status" className="text-xs text-subtle">{t("database.acquisition.noMatchingDrops")}</p>}
  </section>;
}

function LocationSection({ title, count, children }: {
  title: string; count?: number; children: ReactNode;
}) {
  return <section className="mt-4">
    <DatabaseSectionTitle className="mb-2">{title}</DatabaseSectionTitle>
    <div className={count && count > 8 ? "max-h-64 space-y-1.5 overflow-y-auto pr-1" : "space-y-1.5"}>{children}</div>
  </section>;
}

function ItemRow({ id, item, fallback, meta, subtitle, onOpen, quantity }: {
  id: string;
  item?: CatalogItem;
  fallback?: string;
  meta?: string;
  subtitle?: string;
  onOpen: LocationLinksProps["onOpenItem"];
  quantity?: number;
}) {
  const selected = useSelectedReference();
  return <button type="button"
    aria-pressed={selected !== undefined ? sameReferenceTarget(selected, { category: "items", id }) : undefined}
    onClick={() => onOpen(id, quantity, item?.name)}
    className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.025] px-2.5 py-2 text-left text-[12px] font-medium text-zinc-100 transition-colors hover:border-accent/55 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-accent aria-pressed:border-accent/60">
    <RobRunItemIcon item={item} size={24} loading="lazy" />
    <span className="min-w-0 flex-1 leading-snug">
      <span className={cn("block", itemRarityClass(item))}>{item?.name ?? fallback}</span>
      {subtitle && <span className="mt-0.5 block text-[11px] text-muted">{subtitle}</span>}
    </span>
    {meta && <span className="max-w-[52%] text-right text-xs tabular-nums text-muted">{meta}</span>}
    <ChevronRight size={14} className="shrink-0 text-accent" aria-hidden="true" />
  </button>;
}

export default function RobRunLocationLinks({ point, mapId, locations, onOpenMap, onOpenItem }: LocationLinksProps) {
  const { t, i18n } = useTranslation();
  const [mapFacts, setMapFacts] = useState<{ mapId: string; data?: CodexMapFacts }>();
  useEffect(() => {
    let active = true;
    void loadCodexMap(mapId).then((data) => {
      if (active) setMapFacts({ mapId, data });
    }, () => {
      if (active) setMapFacts({ mapId });
    });
    return () => { active = false; };
  }, [mapId]);
  const loaded = mapFacts?.mapId === mapId ? mapFacts : undefined;
  if (!loaded) return null;
  const reference = loaded.data;
  const facts = reference?.points[point.id];
  const loot = facts?.lootPool === undefined ? undefined : reference?.lootPools[facts.lootPool];
  const childIds = new Set(point.locationChildIds ?? []);
  const children = locations.filter((location): location is MapLocation => {
    if (isUserMapMarker(location)) return false;
    if (facts) return reference?.points[location.id]?.parent?.id === point.id;
    return childIds.has(location.id) || location.locationParentId === point.id;
  });
  const parentId = facts ? facts.parent?.id : point.locationParentId;
  const parent = parentId ? locations.find((location) => location.id === parentId) : undefined;
  const link = (location: MapPoint) => ({ mapId, markerId: location.id, point: location });
  const groups = new Map<string, MapLocation[]>();
  for (const child of children) {
    const category = getCategoryConfig(facts ? reference?.points[child.id]?.parent?.category ?? child.category : child.category).id;
    const group = groups.get(category) ?? [];
    group.push(child);
    groups.set(category, group);
  }

  return <>
    <LocationItems point={point} facts={facts} loot={loot} onOpenItem={onOpenItem} />
    {parent && <MapLinkedMarkers links={[link(parent)]} titleKey="robRun.location.parent" onOpenMap={onOpenMap} />}
    {children.length > 0 && <details className="group/locations mt-4 rounded-[var(--radius-sm)] border border-border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[12px] font-semibold">
        <span className="min-w-0 flex-1">{t("robRun.location.nearby")}</span>
        <span className="tabular-nums text-muted">{children.length.toLocaleString(i18n.language)}</span>
        <ChevronRight size={14} className="shrink-0 text-accent group-open/locations:rotate-90" aria-hidden="true" />
      </summary>
      <div className="grid gap-1.5 border-t border-border p-2">
        {[...groups].sort(([left], [right]) =>
          t(getCategoryConfig(left).labelKey).localeCompare(t(getCategoryConfig(right).labelKey)))
          .map(([category, entries]) => <details key={category} className="group rounded-lg border border-border">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2.5 text-[13px] font-medium">
              <MapSearchLocationIcon point={entries[0]!} compact />
              <span className="min-w-0 flex-1">{t(getCategoryConfig(category).labelKey)}</span>
              <span className="text-xs tabular-nums text-muted">{entries.length}</span>
              <ChevronRight size={14} className="shrink-0 text-accent group-open:rotate-90" aria-hidden="true" />
            </summary>
            <ul className="grid gap-1 border-t border-border p-1.5">
              {[...entries].sort((a, b) => a.y - b.y || a.x - b.x).map((entry, index) =>
                <li key={entry.id}><button type="button" onClick={() => onOpenMap(mapId, entry.id)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-accent">
                  <span className="min-w-0 flex-1">{entry.name.split(" · ").at(-1)}
                    {entries.filter((candidate) => candidate.name === entry.name).length > 1 && ` #${index + 1}`}</span>
                  <ChevronRight size={12} className="shrink-0 text-accent" aria-hidden="true" />
                </button></li>)}
            </ul>
          </details>)}
      </div>
    </details>}
  </>;
}

