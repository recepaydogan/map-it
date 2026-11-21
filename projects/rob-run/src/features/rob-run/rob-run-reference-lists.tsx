
import { Laptop, Store } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import ItemCatalog, { type ItemCatalogRow } from "../../components/layout/item-catalog";
import { contentUrl } from "../../lib/content-url";
import { getCargoSellPrice, getItemVariantKey, getRarityKey, getShipmentCashCost, loadRobRunEconomy, loadRobRunItems, type CatalogItem, type Cargo, type Economy } from "./rob-run-data";
import { DetailFacts, DetailItemLink, DetailRecordLink, DetailSection } from "./rob-run-detail";
import RobRunWikiWorkspace from "./rob-run-wiki-workspace";
import { openRobRunWikiRecord } from "./rob-run-catalog-navigation";
import { itemRarityClass, RobRunItemIcon } from "./rob-run-rarity";

export type RobRunReferencePage = "cargo" | "collections" | "vendors";

const readableId = (id: string) => id.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const sprite = (icon?: string) => icon
  ? <img src={contentUrl(icon)} className="size-7 object-contain" alt="" loading="lazy" />
  : undefined;

const collectionGroups = [
  { key: "basic", start: 0, count: 7, unlock: "collection_table" },
  { key: "additional", start: 7, count: 7, unlock: "collection_upgrade_1" },
  { key: "special", start: 14, count: 10, unlock: "collection_upgrade_2" },
  { key: "unique", start: 24, count: 10, unlock: "collection_upgrade_3" },
] as const;

export default function RobRunReferenceLists({ page, initialId, preview }: {
  page: RobRunReferencePage; initialId?: string; preview?: { vendorItemId?: string };
}) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<{ economy: Economy; items: CatalogItem[] }>();
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initialId);
  useEffect(() => {
    let active = true;
    void Promise.all([loadRobRunEconomy(), loadRobRunItems()]).then(([economy, items]) => {
      if (active) setData({ economy, items });
    }, () => {
      if (active) setError(true);
    });
    return () => { active = false; };
  }, []);

  const format = useMemo(() => new Intl.NumberFormat(i18n.resolvedLanguage), [i18n.resolvedLanguage]);
  const items = useMemo(() => new Map(data?.items.map((item) => [item.gameId ?? item.id, item])), [data]);
  const cargo = useMemo(() => new Map(data?.economy.cargo.map((row) => [row.id, row])), [data]);
  const label = (key: string) => t("robRun.economy." + key);
  const wiki = (key: string) => t("robRun.wiki." + key);
  const money = useMemo(() => new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }), [i18n.resolvedLanguage]);
  const term = query.trim().toLocaleLowerCase();
  const matches = (...fields: string[]) => !term || fields.some((field) => field.toLocaleLowerCase().includes(term));
  const duration = (milliseconds: number) => milliseconds % 60000 === 0
    ? t("robRun.economy.minutes", { amount: format.format(milliseconds / 60000) })
    : t("robRun.economy.seconds", { amount: format.format(milliseconds / 1000) });
  const itemName = (id: string) => items.get(id)?.name ?? readableId(id);
  const cargoName = (id: string) => cargo.get(id)?.name ?? readableId(id);

  let rows: ItemCatalogRow[];
  let columns: { label: string; numeric?: boolean }[];
  let detail: ReactNode;

  if (page === "cargo") {
    const cargoRarity = (row: Cargo) => {
      const rarity = getRarityKey(row.rarity, row.reference?.rarity);
      return rarity ? t(`robRun.rarity.${rarity}`) : "";
    };
    columns = [{ label: t("robRun.wiki.rarity") }, { label: label("exchange"), numeric: true }, { label: label("openTime") }];
    rows = [...cargo.values()]
      .filter((row) => matches(row.id, row.name, row.openWorkbench ?? "", cargoRarity(row)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((row) => ({
        id: row.id, label: row.name, nameClassName: itemRarityClass(row),
        icon: <RobRunItemIcon item={row} loading="lazy" />,
        subtitle: cargoRarity(row) || row.openWorkbench || undefined,
        cells: [<span className={itemRarityClass(row)}>{cargoRarity(row) || "—"}</span>,
          format.format(row.exchangeCoins), row.openWorkbench ? duration(row.openTimeMs) : "—"],
      }));
    const selected = selectedId ? cargo.get(selectedId) : undefined;
    if (selected) detail = <>
      <header className="rob-run-detail-header">
        <RobRunItemIcon item={selected} size={76} />
        <div><h1 className={itemRarityClass(selected)}>{selected.name}</h1>
          {cargoRarity(selected) && <p className="rob-run-detail-eyebrow"><span className={itemRarityClass(selected)}>{cargoRarity(selected)}</span></p>}
          {selected.description && <p>{selected.description.replace(/<\/?color(?:=[^>]*)?>/g, "")}</p>}
        </div>
      </header>
      <div className="rob-run-detail-content">
      <div className="rob-run-detail-column">
        <DetailSection title={wiki("exchangeCargo")}>
          <DetailFacts rows={[[label("exchange"), format.format(selected.exchangeCoins)],
            ...(selected.reference?.sellPrice != null && selected.reference.sellPrice !== selected.exchangeCoins
              ? [[t("robRun.catalog.sellPrice"), format.format(selected.reference.sellPrice)] as [string, string]] : []),
            [label("seizure"), format.format(selected.seizureCoins)],
            ...(selected.exchangePoints > 0 ? [[wiki("exchangePoints"), format.format(selected.exchangePoints)] as [string, string]] : [])]} />
          {getCargoSellPrice(selected) !== undefined && <button type="button" className="rob-run-detail-action mt-2"
            onClick={() => openRobRunWikiRecord({ page: "loot", id: `cargo:${selected.id}`, calculator: true })}>{wiki("calculate")}</button>}
        </DetailSection>
        <DetailSection title={wiki("rewardDuration")}>
          <DetailFacts rows={[
            [wiki("takeTime"), duration(selected.takeTimeMs)],
            ...(selected.exchangeTimeMs > 0 ? [[wiki("exchangeTime"), duration(selected.exchangeTimeMs)] as [string, string]] : []),
          ]} />
        </DetailSection>
      </div><div className="rob-run-detail-column">
      {selected.openWorkbench && <DetailSection title={wiki("openCargo")}>
        <DetailFacts rows={[[label("workbench"), selected.openWorkbench], [label("openTime"), duration(selected.openTimeMs)]]} />
      </DetailSection>}
      {selected.exchangeCargo && <section className="space-y-2"><h2 className="font-semibold">{label("exchangeOutput")}</h2>
        <DetailRecordLink target={{ page: "cargo", id: selected.exchangeCargo, name: cargoName(selected.exchangeCargo) }}
          icon={sprite(cargo.get(selected.exchangeCargo)?.icon)} />
      </section>}
      {selected.improvedExchangeCargo && <section className="space-y-2"><h2 className="font-semibold">{label("improvedExchange")}</h2>
        <DetailRecordLink target={{ page: "cargo", id: selected.improvedExchangeCargo, name: cargoName(selected.improvedExchangeCargo) }}
          icon={sprite(cargo.get(selected.improvedExchangeCargo)?.icon)} />
      </section>}
      </div></div>
    </>;
  } else if (page === "collections") {
    columns = [{ label: label("reward") }, { label: label("itemTypes"), numeric: true }];
    const entries = data?.economy.collections ?? [];
    const collectionName = (index: number) => t("robRun.economy.collectionNumber", { number: index + 1 });
    rows = entries.filter((entry) => matches(collectionName(entry.index), cargoName(entry.reward),
      ...entry.requires.map(({ item }) => itemName(item))))
      .map((entry) => ({
        id: entry.id, label: collectionName(entry.index), icon: sprite(cargo.get(entry.reward)?.icon),
        cells: [cargoName(entry.reward), entry.requires.length],
      }));
    const selected = entries.find((entry) => entry.id === selectedId);
    if (selected) {
      const group = [...collectionGroups].reverse().find((entry) => entry.start <= selected.index)!;
      const reward = cargo.get(selected.reward);
      const unlock = items.get(group.unlock);
      const research = data?.economy.shipments.at(-1)?.nodes.find((node) => node.item === unlock?.gameId && node.enabled);
      const ingredients = selected.requires.map((entry) => ({ ...entry, catalog: items.get(entry.item) }));
      const ingredientValue = ingredients.every((entry) => entry.catalog?.sellPrice != null)
        ? ingredients.reduce((total, entry) => total + entry.catalog!.sellPrice! * entry.amount, 0) : undefined;
      detail = <>
        <header className="rob-run-detail-header">
          {reward?.icon && <img src={contentUrl(reward.icon)} alt="" />}
          <div><p className="rob-run-detail-eyebrow">{wiki(`collectionGroup.${group.key}`)} · {selected.index - group.start + 1} / {group.count}</p>
            <h1>{collectionName(selected.index)}</h1></div>
        </header>
        <div className="rob-run-detail-content">
          <div className="rob-run-detail-column">
            <DetailSection title={label("collectionItems")}>
              <ul className="rob-run-detail-stock">{ingredients.map(({ item, amount, slot, catalog }) =>
                <li key={slot}>{catalog ? <DetailItemLink item={catalog} meta={`×${format.format(amount)}`} />
                  : <div className="px-2 py-2 text-sm">{itemName(item)} · {format.format(amount)}</div>}</li>)}</ul>
            </DetailSection>
            {unlock && <DetailSection title={wiki("unlockPath")}>
              <div className="rob-run-detail-stock">
                <DetailItemLink item={unlock} meta={unlock.basePrice !== undefined ? money.format(unlock.basePrice) : undefined} />
                {research && <DetailRecordLink target={{ page: "shipments", id: research.id, name: unlock.name }}
                  label={wiki("openResearch")} meta={money.format(getShipmentCashCost(research))} />}
              </div>
            </DetailSection>}
          </div><div className="rob-run-detail-column">
            {reward && <DetailSection title={label("reward")}>
              <DetailRecordLink target={{ page: "cargo", id: reward.id, name: reward.name }}
                icon={sprite(reward.icon)} meta={money.format(reward.exchangeCoins)} />
              {ingredientValue !== undefined && <DetailFacts rows={[
                [wiki("ingredientValue"), money.format(ingredientValue)],
                [wiki("rewardGain"), money.format(reward.exchangeCoins - ingredientValue)],
              ]} />}
            </DetailSection>}
            {reward && <DetailSection title={wiki("rewardValues")}>
              <DetailFacts rows={(data?.economy.notoriety ?? []).map((level) => [
                t("robRun.economy.notorietyLevel", { level: level.index + 1 }),
                money.format(Math.round(reward.exchangeCoins * (1 + level.cargoBonus))),
              ])} />
            </DetailSection>}
          </div>
        </div>
      </>;
    }
  } else {
    columns = [{ label: label("itemTypes"), numeric: true }, { label: label("purchaseMultiplier"), numeric: true }];
    const vendorName = (id: string) => t("robRun.economy.vendor." + id, { defaultValue: readableId(id) });
    const entries = (data?.economy.vendors ?? [])
      .map((entry) => ({ ...entry, allItems: [...new Set([...entry.items, ...entry.tiers.flatMap(({ items }) => items)])] }))
      .filter(({ allItems }) => allItems.length > 0);
    const alternate = data?.economy.shipmentVariants;
    rows = entries.filter((entry) => matches(vendorName(entry.id), ...entry.allItems.map(itemName),
      ...(alternate?.additionalStock[entry.id] ?? []).map(itemName)))
      .map((entry) => ({
        id: entry.id, label: vendorName(entry.id),
        icon: entry.id === "laptop" ? <Laptop size={19} aria-hidden="true" /> : sprite(items.get(entry.allItems[0])?.icon),
        cells: [entry.allItems.length, format.format(entry.buyMultiplier) + "×"],
      }));
    const selected = entries.find((entry) => entry.id === selectedId);
    if (selected) {
      const focusedItem = preview?.vendorItemId;
      const alternateItems = (alternate?.additionalStock[selected.id] ?? []).filter((id) => !focusedItem || id === focusedItem);
      const tiers = [{ tierIndex: null, items: selected.items }, ...selected.tiers].map((row) => ({
        ...row, items: focusedItem ? row.items.filter((id) => id === focusedItem) : row.items,
      })).filter((row) => row.items.length);
      const research = selected.shipmentLocked && focusedItem
        ? data?.economy.shipments.at(-1)?.nodes.find((node) => node.item === focusedItem && node.enabled)
        : undefined;
      const VendorIcon = selected.id === "laptop" ? Laptop : Store;
      detail = <>
        <header className="rob-run-detail-header">
          <VendorIcon size={24} className="shrink-0 text-muted" aria-hidden="true" />
          <div><h1>{vendorName(selected.id)}</h1>
            {selected.buyMultiplier > 1 && <p>{t("robRun.economy.purchaseTerms", { factor: format.format(selected.buyMultiplier) })}</p>}
            {selected.shipmentLocked && <p>{label("shipmentLocked")}</p>}
          </div>
        </header>
        <div className="rob-run-detail-content">
          {tiers.map((row) => <DetailSection key={row.tierIndex ?? "any"} title={row.tierIndex != null
            ? t("robRun.economy.tierNumber", { count: row.tierIndex + 1 })
            : focusedItem ? label("purchase") : label(selected.shipmentLocked ? "vendorBaseStock" : "vendorItems")}>
            <ul className="rob-run-detail-stock">{row.items.map((id) => {
              const item = items.get(id);
              const rarity = getRarityKey(item?.rarity, item?.reference?.rarity);
              const variant = item && getItemVariantKey(item);
              return <li key={id}>{item ? <DetailItemLink item={item}
                subtitle={[rarity && t(`robRun.rarity.${rarity}`), variant && wiki(variant)].filter(Boolean).join(" · ")}
                meta={item.basePrice !== undefined ? money.format(item.basePrice * selected.buyMultiplier) : undefined} />
                : readableId(id)}</li>;
            })}</ul>
          </DetailSection>)}
          {alternate && alternateItems.length > 0 && <DetailSection title={t("robRun.economy.stockInVersion", { version: alternate.version })}>
            <ul className="rob-run-detail-stock">{alternateItems.map((id) => {
              const item = items.get(id);
              const tier = selected.shipmentLocked ? alternate.nodes.find((node) => node.item === id)?.tierIndex : undefined;
              return <li key={id}>{item ? <DetailItemLink item={item}
                subtitle={tier != null ? t("robRun.economy.tierNumber", { count: tier + 1 }) : undefined}
                meta={item.basePrice !== undefined ? money.format(item.basePrice * selected.buyMultiplier) : undefined} />
                : readableId(id)}</li>;
            })}</ul>
          </DetailSection>}
          {research && <section>
            <DetailRecordLink target={{ page: "shipments", id: research.id, name: itemName(research.item) }}
              label={wiki("openResearch")} />
          </section>}
        </div>
      </>;
    }
  }

  if (preview) return detail ? <article className="rob-run-detail">{detail}</article>
    : <p role="status" className="p-4 text-sm text-muted">{label(data ? "empty" : error ? "error" : "loading")}</p>;

  return <ItemCatalog label={label(page)} rows={rows} columns={columns}
    search={{ query, onChange: setQuery, label: label("search"), clearLabel: t("map.search.clear") }}
    onOpen={setSelectedId} onBack={() => setSelectedId(undefined)} backLabel={label("back")} backInToolbar
    detail={detail && <RobRunWikiWorkspace key={selectedId} title={rows.find((row) => row.id === selectedId)?.label ?? label(page)}>
      <article className="rob-run-detail">{detail}</article>
    </RobRunWikiWorkspace>}
    emptyMessage={label(data ? "empty" : error ? "error" : "loading")} />;
}

