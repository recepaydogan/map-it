import { ArrowLeftRight, BookOpen, Calculator, Laptop, MapPin, Store, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import DatabaseSectionTitle from "../database/database-section-title";
import { requestMapMarkerSetInMain } from "../map/map-window-bridge";
import { ReferenceFacts } from "../reference/reference-sections";
import { getLootMarkerIds, loadCodexMap, type CodexMapFacts } from "./rob-run-codex-data";
import { openRobRunCatalogItem, openRobRunWikiRecord, useRobRunPreview } from "./rob-run-catalog-navigation";
import {
  getFillingItemId, getItemTypeKey, getItemVariantKey, getRarityKey, getShipmentCashCost, getShipmentPath, loadRobRunEconomy,
  type BarterRecipe, type CatalogItem, type Economy,
} from "./rob-run-data";
import { AlternateShipment, DetailFacts, DetailItemLink, DetailRecordLink } from "./rob-run-detail";
import { itemRarityClass, RobRunItemIcon } from "./rob-run-rarity";

export default function RobRunItemDetail({ item, items, onOpenMarker, onSelectItem,
  compact = false, embedded = false, onClose, quantity }: {
  item: CatalogItem;
  items: readonly CatalogItem[];
  onOpenMarker: (id: string) => void;
  onSelectItem?: (item: string) => void;
  compact?: boolean;
  embedded?: boolean;
  onClose?: () => void;
  quantity?: number | string;
}) {
  const { t, i18n } = useTranslation();
  const preview = useRobRunPreview();
  const Title = compact ? "h2" : "h1";
  const sectionLevel = compact ? "h3" : "h2";
  const [economy, setEconomy] = useState<Economy>();
  const [map, setMap] = useState<CodexMapFacts>();
  useEffect(() => {
    let active = true;
    void loadRobRunEconomy().then((data) => { if (active) setEconomy(data); }, () => {});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    void loadCodexMap("looty-bay").then((data) => {
      if (active) setMap(data);
    }, () => {});
    return () => { active = false; };
  }, []);
  const number = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 2 });
  const money = new Intl.NumberFormat(i18n.resolvedLanguage, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const wiki = (key: string) => t(`robRun.wiki.${key}`);
  const getItem = (id: string) => items.find((entry) => entry.gameId === id || entry.id === id);
  const nativeId = item.gameId ?? item.id;
  const reference = item.reference;
  const weaponReference = reference?.weapon;
  const weapon = item.weapon;
  const ammoId = weapon?.ammoItemId ?? weaponReference?.ammo;
  const ammunition = ammoId ? getItem(ammoId) : undefined;
  const typeKey = getItemTypeKey(item.inventoryType);
  const rarity = getRarityKey(item.rarity, reference?.rarity);
  const variant = getItemVariantKey(item);
  const lootMarkers = getLootMarkerIds(map, item.id);
  const fillingId = getFillingItemId(item.id);
  const fillingItem = getItem(fillingId);
  const variantItem = variant === "fullyFilled" ? fillingItem
    : variant === "filling" ? getItem(item.id.replace(/-cumulative$/, "-full")) : undefined;
  const fillPoints = fillingItem?.reference?.fillPoints;
  const refillLocations = Object.entries(map?.points ?? {}).flatMap(([id, marker]) => {
    const refill = marker.refills?.find((entry) => entry.item === fillingId);
    const name = marker.title ?? (marker.parent ? map?.points[marker.parent.id]?.title : undefined);
    return refill && name ? [{ id, name, points: refill.points }] : [];
  });
  const nodes = economy?.shipments.at(-1)?.nodes ?? [];
  const shipment = nodes.find((node) => node.item === nativeId);
  const goal = shipment?.enabled ? shipment : undefined;
  const path = getShipmentPath(goal, nodes);
  const pathCost = path.reduce((sum, node) => sum + getShipmentCashCost(node), 0);
  const settlementLevel = goal?.settlementLevel ?? reference?.settlementLevel;
  const researchRequirements = [
    ...(settlementLevel ? [t("robRun.wiki.settlementRequirement", { level: settlementLevel })] : []),
    ...(goal?.imprisonmentYears ? [t("robRun.economy.yearsAmount", { count: goal.imprisonmentYears })] : []),
  ];
  const vendors = (economy?.vendors ?? []).flatMap((vendor) => {
    const tier = vendor.tiers.find((row) => row.items.includes(nativeId))?.tierIndex;
    return tier !== undefined || vendor.items.includes(nativeId) ? [{ vendor, tier }] : [];
  });
  const alternate = economy?.shipmentVariants;
  const alternateVendors = Object.entries(alternate?.additionalStock ?? {})
    .flatMap(([id, stock]) => stock.includes(nativeId) ? [id] : []);
  const barters = economy?.barters ?? [];
  const recipe = barters.find((row) => row.resultItem === nativeId);
  const barterUses = new Map<string, BarterRecipe>();
  for (const row of barters) {
    if (row.requires.some((entry) => entry.item === nativeId) && !barterUses.has(row.resultItem)) {
      barterUses.set(row.resultItem, row);
    }
  }
  const usedIn = (economy?.collections ?? []).filter((row) => row.requires.some((entry) => entry.item === nativeId));
  const fact = (key: string, value: string | number) => ({ label: `robRun.wiki.${key}`, value });
  const time = (ms: number) => t("robRun.economy.seconds", { amount: number.format(ms / 1000) });
  const damage = weapon?.damage ?? weaponReference?.damage;
  const headshot = weapon?.headshotMultiplier ?? weaponReference?.headshot_multiplier;
  const rpm = weapon?.cooldownMs ? Math.round(60000 / weapon.cooldownMs) : weaponReference?.rounds_per_minute;
  const range = weapon?.fullDamageRange ?? weaponReference?.full_damage_range_m;
  const automatic = weapon ? weapon.automatic : weaponReference?.fire_mode === undefined
    ? undefined : weaponReference.fire_mode === "Auto";
  const seconds = (value?: number, fallback?: number) => value !== undefined ? time(value)
    : fallback !== undefined ? time(fallback * 1000) : undefined;
  const statValues: [string, string | number | undefined][] = [
    ["damage", damage], ["headshotDamage", damage !== undefined && headshot !== undefined ? damage * headshot : undefined],
    ["headshotMultiplier", headshot !== undefined ? `×${number.format(headshot)}` : undefined],
    ["fireRate", rpm !== undefined ? `${number.format(rpm)} RPM` : undefined],
    ["magazine", weapon?.magazine ?? weaponReference?.magazine_rounds],
    ["range", range !== undefined ? t("robRun.wiki.distance", { value: number.format(range) }) : undefined],
    ["reload", seconds(weapon?.reloadMs, weaponReference?.reload_seconds)],
    ["fastReload", weapon?.fastReloadMs !== 0 ? seconds(weapon?.fastReloadMs, weaponReference?.fast_reload_seconds) : undefined],
    ["aim", seconds(weapon?.aimMs, weaponReference?.aim_seconds)],
    ["draw", seconds(weapon?.drawMs, weaponReference?.draw_seconds)],
    ["dps", weaponReference?.dps],
    ["fireMode", automatic !== undefined ? wiki(automatic ? "automatic" : "singleShot") : undefined],
  ];
  const stats = statValues.flatMap(([key, value]) => value === undefined ? [] : [fact(key, value)]);
  const spread = Object.entries(weaponReference?.spread ?? {}).map(([stance, value]) => fact(`stance.${stance}`, value));
  const knockdown = weaponReference?.knockdown;
  const width = item.width ?? reference?.width;
  const height = item.height ?? reference?.height;
  const details = [
    ...(width && height ? [fact("footprint", t("robRun.wiki.slotCount", {
      width, height, count: width * height,
    }))] : []),
    ...(item.stackSize && item.stackSize > 1 ? [fact("stackSize", item.stackSize)] : []),
    ...(item.armor ? [fact("armorSegments", item.armor.segments),
      fact("armorBlocking", new Intl.NumberFormat(i18n.resolvedLanguage, { style: "percent" }).format(item.armor.blockingRate))] : []),
  ];
  const prices = [
    ...(item.basePrice !== undefined ? [{ label: "robRun.catalog.baseValue", value: money.format(item.basePrice) }] : []),
    ...(reference?.buyPrice !== undefined && reference.buyPrice !== item.basePrice
      ? [fact("buyPrice", money.format(reference.buyPrice))] : []),
    ...(item.sellPrice !== undefined ? [{ label: "robRun.catalog.sellPrice",
      value: item.sellPrice === null ? t("robRun.catalog.unsellable") : money.format(item.sellPrice) }] : []),
    ...(reference?.researchPrice !== undefined && !goal ? [fact("researchPrice", money.format(reference.researchPrice))] : []),
  ];
  return <div className={cn("text-left", compact && !embedded ? "flex min-h-0 flex-1 flex-col" : "block")} data-rob-run-item={compact ? "preview" : "wiki"}>
    {!embedded && <header className={cn("relative flex shrink-0 gap-3 border-b border-border", compact
      ? "items-start bg-black/15 px-4 py-4" : "items-center overflow-hidden px-6 py-5")}>
      <div className="relative"><RobRunItemIcon item={item} size={compact ? 56 : 76} /></div>
      <div className="relative min-w-0 flex-1">
        <Title className={cn("leading-snug text-zinc-100", compact ? "text-[17px] font-bold" : "font-display text-[22px] font-semibold", itemRarityClass(item))}>{item.name}</Title>
        <p className="mt-1 text-[12px] text-zinc-400">{[typeKey ? t(`robRun.itemTypes.${typeKey}`) : reference?.type ?? t(`robRun.catalog.${item.category}`),
          rarity && t(`robRun.rarity.${rarity}`), variant && wiki(variant),
          reference?.tier ? t("robRun.wiki.mark", { tier: reference.tier }) : undefined].filter(Boolean).join(" · ")}</p>
      </div>
      {onClose && <button type="button" onClick={onClose} aria-label={t("chrome.close")}
        className="-mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-subtle hover:bg-white/5 hover:text-white">
        <X size={16} aria-hidden="true" />
      </button>}
    </header>}
    <div className={cn("rob-run-detail-content", compact && "rob-run-item-preview-content",
      compact && !embedded && "scroll-slim min-h-0 flex-1 overflow-y-auto")}>
      {compact && quantity !== undefined && <p className="text-xs text-muted">{t("database.compact.quantity", { quantity })}</p>}
      {item.description && <p className="max-w-[72ch] whitespace-pre-line text-[13px] leading-relaxed text-zinc-300">
        {item.description.replace(/<\/?color(?:=[^>]*)?>/g, "")}</p>}
      {(fillPoints !== undefined || variantItem) && <section className="min-w-0 space-y-2">
        <DatabaseSectionTitle as={sectionLevel}>{wiki("fillingDetails")}</DatabaseSectionTitle>
        {fillPoints !== undefined && <DetailFacts rows={[[wiki("pointsToFill"), number.format(fillPoints)]]} />}
        {variantItem && <div className="rob-run-detail-stock"><DetailItemLink item={variantItem}
          subtitle={wiki(variant === "fullyFilled" ? "filling" : "fullyFilled")} onSelect={onSelectItem} /></div>}
      </section>}
      {refillLocations.length > 0 && <section className="min-w-0">
        <DatabaseSectionTitle as={sectionLevel}>{wiki("whereToFill")}</DatabaseSectionTitle>
        <div className="rob-run-detail-action-stack">{refillLocations.map(({ id, name, points }) =>
          <button type="button" className="rob-run-detail-action" key={id} onClick={() => onOpenMarker(id)}>
            <MapPin size={14} aria-hidden="true" /><span className="rob-run-detail-action-label">{name}</span>
            {points !== undefined && <small>{t("robRun.location.refillPoints", { count: points })}</small>}
          </button>)}</div>
      </section>}
      {stats.length > 0 && <section className="min-w-0">
        <DatabaseSectionTitle as={sectionLevel}>{wiki("weaponStats")}</DatabaseSectionTitle>
        <ReferenceFacts facts={stats} />
      </section>}
      {spread.length > 0 && <section className="min-w-0">
        <DatabaseSectionTitle as={sectionLevel}>{wiki("spread")}</DatabaseSectionTitle>
        <p className="text-xs text-muted">{wiki("spreadUnits")}</p>
        <ReferenceFacts facts={spread} />
      </section>}
      {knockdown?.length ? <section className="min-w-0">
        <DatabaseSectionTitle as={sectionLevel}>{wiki("knockdown")}</DatabaseSectionTitle>
        {range !== undefined && <p className="mb-2 text-xs text-muted">{t("robRun.wiki.knockdownContext", { range })}</p>}
        <table className="rob-run-detail-table">
          <thead><tr>{["target", "body", "head"].map((key) => <th key={key} scope="col">{wiki(key)}</th>)}</tr></thead>
          <tbody>{knockdown.map(([armor, body, head]) => <tr key={armor}>
            <th scope="row">{armor}</th><td>{body}</td><td>{head}</td>
          </tr>)}</tbody>
        </table>
      </section> : null}
      {ammunition && <section className="min-w-0">
        <DatabaseSectionTitle as={sectionLevel}>{wiki("ammo")}</DatabaseSectionTitle>
        <div className="rob-run-detail-stock"><DetailItemLink item={ammunition} onSelect={onSelectItem} /></div>
      </section>}
      {details.length > 0 && <section className="min-w-0">
        <DatabaseSectionTitle as={sectionLevel}>{t("reference.detailsTab")}</DatabaseSectionTitle>
        <ReferenceFacts facts={details} />
      </section>}
      {prices.length > 0 && <section className="min-w-0">
        <DatabaseSectionTitle as={sectionLevel}>{wiki("prices")}</DatabaseSectionTitle>
        <ReferenceFacts facts={prices} />
        {!compact && item.sellPrice != null && <button className="rob-run-detail-action mt-2"
          onClick={() => openRobRunWikiRecord({ page: "loot", id: item.id, calculator: true })} type="button">
          <Calculator size={14} aria-hidden="true" />{wiki("calculate")}</button>}
      </section>}
      {(item.markers.length > 0 || lootMarkers.length > 0) && <section className="min-w-0 space-y-2">
        <DatabaseSectionTitle as={sectionLevel}>{wiki("findOnMap")}</DatabaseSectionTitle>
        <div className="rob-run-detail-action-stack">
          {item.markers.map((marker) => <button type="button" className="rob-run-detail-action"
            key={marker.id} onClick={() => onOpenMarker(marker.id)}>
            <MapPin size={14} aria-hidden="true" />{marker.name}
          </button>)}
          {lootMarkers.length > 0 && <button type="button" className="rob-run-detail-action"
            onClick={() => requestMapMarkerSetInMain("looty-bay", item.name, lootMarkers)}>
            <MapPin size={14} aria-hidden="true" />{t("robRun.wiki.possibleSpots", { count: lootMarkers.length })}
          </button>}
        </div>
      </section>}
      {researchRequirements.length > 0 && <section className="min-w-0">
        <DatabaseSectionTitle as={sectionLevel}>{wiki("researchRequirements")}</DatabaseSectionTitle>
        <ul className="space-y-1 text-sm text-muted">{researchRequirements.map((requirement) =>
          <li key={requirement}>{requirement}</li>)}</ul>
      </section>}
      {shipment && !shipment.enabled && <section className="min-w-0">
        <DatabaseSectionTitle as={sectionLevel}>{wiki("unlockPath")}</DatabaseSectionTitle>
        <p className="text-sm text-muted">{alternate && alternateVendors.length
          ? t("robRun.economy.disabledInVersion", { version: alternate.baseVersion }) : t("robRun.economy.disabled")}</p>
      </section>}
      {!!path.length && <section className="min-w-0">
        <DatabaseSectionTitle as={sectionLevel}>{wiki("unlockPath")}</DatabaseSectionTitle>
        <ol className="rob-run-detail-stock">
          {path.map((node) => {
            const linked = getItem(node.item);
            const name = linked?.name ?? node.item;
            return <li key={node.id}><DetailRecordLink target={{ page: "shipments", id: node.id, name }}
              ariaLabel={t("robRun.wiki.viewShipment", { name, price: money.format(getShipmentCashCost(node)) })}
              icon={<RobRunItemIcon item={linked} size={24} />}
              meta={money.format(getShipmentCashCost(node))} /></li>;
          })}
        </ol>
        {path.length > 1 && <div className="mt-2">
          <ReferenceFacts facts={[fact("totalResearch", money.format(pathCost))]} />
        </div>}
      </section>}
      <AlternateShipment economy={economy} itemId={nativeId} itemName={(id) => getItem(id)?.name ?? id} format={money} />
      {alternate && alternateVendors.length > 0 && <section className="min-w-0">
        <DatabaseSectionTitle as={sectionLevel}>{t("robRun.wiki.acquisitionInVersion", { version: alternate.version })}</DatabaseSectionTitle>
        <div className="rob-run-detail-action-stack">{alternateVendors.map((id) => {
          const name = t(`robRun.economy.vendor.${id}`);
          return <DetailRecordLink key={id} target={{ page: "vendors", id, name, vendorItemId: nativeId }} />;
        })}</div>
      </section>}
      {(vendors.length > 0 || recipe || usedIn.length > 0) && <section className="min-w-0 space-y-2">
        <DatabaseSectionTitle as={sectionLevel}>{wiki("acquisition")}</DatabaseSectionTitle>
        <div className="rob-run-detail-action-stack">
          {vendors.map(({ vendor, tier }) => {
            const name = t(`robRun.economy.vendor.${vendor.id}`, { defaultValue: vendor.id });
            const VendorIcon = vendor.id === "laptop" ? Laptop : Store;
            return <DetailRecordLink key={vendor.id} target={{ page: "vendors", id: vendor.id, name, vendorItemId: nativeId }}
              icon={<VendorIcon size={15} aria-hidden="true" />}
              meta={(tier !== undefined ? t("robRun.economy.tierNumber", { count: tier + 1 })
                : vendor.buyMultiplier > 1 ? t("robRun.economy.purchaseTerms", { factor: number.format(vendor.buyMultiplier) }) : undefined)} />;
          })}
          {recipe && <DetailRecordLink target={{ page: "barters", id: recipe.id, name: item.name }}
            label={t("robRun.economy.barters")} icon={<ArrowLeftRight size={15} aria-hidden="true" />} />}
          {usedIn.map((row) => <DetailRecordLink key={row.id}
            target={{ page: "collections", id: row.id, name: t("robRun.economy.collectionNumber", { number: row.index + 1 }) }} />)}
        </div>
      </section>}
      {barterUses.size > 0 && <section className="min-w-0">
        <DatabaseSectionTitle as={sectionLevel}>{wiki("barterUses")}</DatabaseSectionTitle>
        <div className="rob-run-detail-action-stack">{[...barterUses.values()].map((row) => {
          const result = getItem(row.resultItem);
          return <DetailRecordLink key={row.id} target={{ page: "barters", id: row.id, name: result?.name ?? row.resultItem }}
            icon={<RobRunItemIcon item={result} size={24} />} />;
        })}</div>
      </section>}
    </div>
    {compact && <footer className="rob-run-preview-footer" data-embedded={embedded}>
      <button type="button" className="rob-run-detail-action" onClick={() => {
        preview?.close();
        openRobRunCatalogItem(item.id);
      }}>
        <BookOpen size={15} aria-hidden="true" />{wiki("open")}
      </button>
    </footer>}
  </div>;
}
