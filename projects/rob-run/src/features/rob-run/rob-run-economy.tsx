
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import ItemCatalog, { type ItemCatalogRow } from "../../components/layout/item-catalog";
import { requestMapMarkerSetInMain } from "../map/map-window-bridge";
import DatabaseSectionTitle from "../database/database-section-title";
import { getLootMarkerIds, loadCodexMap, type CodexMapFacts } from "./rob-run-codex-data";
import { AlternateShipment, DetailFacts, DetailItemLink, DetailRecordLink, DetailSection } from "./rob-run-detail";
import {
  getItemVariantKey, getRarityKey, getShipmentCashCost, loadRobRunEconomy, loadRobRunItems, type BarterRecipe,
  type CatalogItem, type Economy, type ItemAmount, type ShipmentNode,
} from "./rob-run-data";
import RobRunLootCalculator from "./rob-run-loot-calculator";
import RobRunWikiWorkspace from "./rob-run-wiki-workspace";
import { itemRarityClass, RobRunItemIcon } from "./rob-run-rarity";

export type EconomyPage = "barters" | "shipments" | "loot";

const itemKey = (id: string) => id.replaceAll("_", "-");
const sourceLabel = (id: string) => id.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function ShipmentLink({ node, item, onOpen }: {
  node: ShipmentNode;
  item?: CatalogItem;
  onOpen: (id: string) => void;
}) {
  return <button type="button" className="rob-run-detail-action" onClick={() => onOpen(node.id)}>
    <RobRunItemIcon item={item} loading="lazy" /> <span className={itemRarityClass(item)}>{item?.name ?? sourceLabel(node.item)}</span>
  </button>;
}

function totalUnlockCost(goals: ShipmentNode[], nodes: Map<string, ShipmentNode>, unlocked: readonly string[] = []) {
  const seen = new Set(unlocked);
  const remaining = [];
  const items = new Map<string, number>();
  let coins = 0;
  let years = 0;
  let tier = -1;
  const pending = [...goals];
  while (pending.length) {
    const next = pending.pop()!;
    if (seen.has(next.id)) continue;
    seen.add(next.id);
    remaining.push(next.id);
    coins += next.coins;
    years = Math.max(years, next.imprisonmentYears);
    tier = Math.max(tier, next.tierIndex ?? -1);
    for (const { item, amount } of next.requires) items.set(item, (items.get(item) ?? 0) + amount);
    for (const id of next.prerequisites) {
      const prerequisite = nodes.get(id);
      if (prerequisite) pending.push(prerequisite);
    }
  }
  return {
    coins, years, tier: tier < 0 ? null : tier, remaining,
    items: Array.from(items, ([item, amount]) => ({ item, amount })),
  };
}

const SHIPMENT_PLAN_STORAGE_KEY = "rob-run:shipment-plan";
type ShipmentPlan = { goals: string[]; unlocked: string[] };
function readShipmentPlan(): ShipmentPlan {
  try {
    const saved: Partial<ShipmentPlan> = JSON.parse(localStorage.getItem(SHIPMENT_PLAN_STORAGE_KEY) ?? "{}");
    return {
      goals: Array.isArray(saved?.goals) ? saved.goals.filter((id) => typeof id === "string") : [],
      unlocked: Array.isArray(saved?.unlocked) ? saved.unlocked.filter((id) => typeof id === "string") : [],
    };
  } catch {
    return { goals: [], unlocked: [] };
  }
}

export default function RobRunEconomy({ page, target, preview = false }: {
  page: EconomyPage; target?: { id: string; calculator?: boolean; realmVersion?: number }; preview?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<{ economy: Economy; items: CatalogItem[] }>();
  const [unavailable, setUnavailable] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(target?.calculator ? undefined : target?.id);
  const [realmVersion, setRealmVersion] = useState(target?.realmVersion);
  const [calculator, setCalculator] = useState(target?.calculator === true);
  const [showPlan, setShowPlan] = useState(false);
  const [referenceMap, setReferenceMap] = useState<CodexMapFacts>();
  const [plan, setPlan] = useState(readShipmentPlan);

  useEffect(() => {
    if (page === "shipments" && !preview) localStorage.setItem(SHIPMENT_PLAN_STORAGE_KEY, JSON.stringify(plan));
  }, [page, plan, preview]);

  useEffect(() => {
    let active = true;
    void Promise.all([loadRobRunEconomy(), loadRobRunItems()]).then(([economy, items]) => {
      if (active) setData({ economy, items });
    }, () => {
      if (active) setUnavailable(true);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (page !== "loot") return;
    let active = true;
    void loadCodexMap("looty-bay").then((data) => { if (active) setReferenceMap(data); }, () => {});
    return () => { active = false; };
  }, [page]);

  const format = useMemo(() => new Intl.NumberFormat(i18n.resolvedLanguage), [i18n.resolvedLanguage]);
  const money = useMemo(() => new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }), [i18n.resolvedLanguage]);
  const itemById = useMemo(() => new Map(data?.items.map((item) => [item.gameId ?? item.id, item])), [data]);
  const getItem = (id: string) => itemById.get(id);
  const itemName = (id: string) => getItem(id)?.name ?? sourceLabel(id);
  const itemRarity = (id: string) => {
    const item = getItem(id);
    const key = getRarityKey(item?.rarity, item?.reference?.rarity);
    return key ? t(`robRun.rarity.${key}`) : "";
  };
  const asRange = ([minimum, maximum]: [number, number]) =>
    minimum === maximum ? format.format(minimum) : [minimum, maximum].map((value) => format.format(value)).join("–");
  const itemList = (amounts: ItemAmount[], barter = false) => amounts.length ? (
    <ul className="rob-run-detail-stock">
      {amounts.map(({ item, amount, fullyFilled }) => {
        const catalog = getItem(item);
        if (barter && item === "cash_1") return <li key={item} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
          <RobRunItemIcon item={catalog} /><span>{money.format(amount)}</span>
        </li>;
        const variant = fullyFilled ? "fullyFilled" : catalog && getItemVariantKey(catalog);
        const filled = variant && t(`robRun.wiki.${variant}`);
        const cost = barter ? `×${format.format(amount)}`
          : [format.format(amount), fullyFilled && filled].filter(Boolean).join(" · ");
        const subtitle = barter ? [itemRarity(item), filled].filter(Boolean).join(" · ") : undefined;
        return <li key={item}>{catalog ? <DetailItemLink item={catalog} meta={cost} subtitle={subtitle} />
          : <p className="text-sm">{itemName(item)} · {format.format(amount)}</p>}</li>;
      })}
    </ul>
  ) : <p className="text-sm text-muted">{t("robRun.economy.none")}</p>;

  const label = (id: string) => t("robRun.economy." + id);
  const term = query.trim().toLocaleLowerCase();
  const matches = (...fields: string[]) => !term || fields.some((field) => field.toLocaleLowerCase().includes(term));
  const economy = data?.economy;
  const realm = economy?.shipments.find((record) => record.realmVersion === realmVersion) ?? economy?.shipments.at(-1);
  const nodes = new Map(realm?.nodes.map((node) => [node.id, node]));
  const planned = plan.goals.flatMap((id) => nodes.get(id) ?? []);
  const changeGoal = (id: string) => setPlan((current) => ({
    ...current,
    goals: current.goals.includes(id) ? current.goals.filter((goal) => goal !== id) : [...current.goals, id],
  }));
  const renderRequirements = (cost: { coins: number; years: number; tier: number | null; items: ItemAmount[] }) => (
    <div className="space-y-2">
      {itemList(cost.items)}
      {cost.coins > 0 && <p className="text-sm">{t("robRun.economy.coinsAmount", { amount: format.format(cost.coins) })}</p>}
      {cost.years > 0 && <p className="text-sm">{t("robRun.economy.yearsAmount", { count: cost.years })}</p>}
      {cost.tier !== null && <p className="text-sm">{t("robRun.economy.tierNumber", { count: cost.tier + 1 })}</p>}
    </div>
  );

  let columns: { label: string; numeric?: boolean }[];
  let rows: ItemCatalogRow[];
  let detail;

  if (page === "barters") {
    columns = [{ label: t("robRun.wiki.rarity") }, { label: label("payment") }, { label: label("traders"), numeric: true }];
    const offersByItem = new Map<string, BarterRecipe[]>();
    for (const offer of economy?.barters ?? []) {
      const offers = offersByItem.get(offer.resultItem);
      if (offers) offers.push(offer);
      else offersByItem.set(offer.resultItem, [offer]);
    }
    const tradersFor = (offers: BarterRecipe[]) => (economy?.traders ?? [])
      .filter((trader) => offers.some((offer) => trader.recipes.includes(offer.id)));
    rows = [...offersByItem].flatMap(([id, offers]) => {
      const rarity = itemRarity(id);
      if (!matches(itemName(id), id, rarity, ...offers.flatMap((offer) =>
        [offer.id, ...offer.requires.map(({ item }) => itemName(item))]))) return [];
      const payment = offers.length > 1 ? t("robRun.economy.barterOffers", { count: offers.length })
        : offers[0].requires.map(({ item, amount }) => item === "cash_1" ? money.format(amount)
          : `${format.format(amount)} × ${itemName(item)}`).join(" · ");
      return [{
        id: offers[0].id, label: itemName(id), subtitle: rarity, nameClassName: itemRarityClass(getItem(id)),
        icon: <RobRunItemIcon item={getItem(id)} loading="lazy" />,
        cells: [<span className={itemRarityClass(getItem(id))}>{rarity || "—"}</span>, payment, tradersFor(offers).length],
      }];
    });
    const resultId = (economy?.barters ?? []).find(({ id }) => id === selectedId)?.resultItem;
    const offers = resultId ? offersByItem.get(resultId) : undefined;
    const result = resultId ? getItem(resultId) : undefined;
    if (resultId && offers) detail = <>
      <header className="rob-run-detail-header">
        <RobRunItemIcon item={result} size={76} />
        <div><h1 className={itemRarityClass(result)}>{itemName(resultId)}</h1>
          <p className="rob-run-detail-eyebrow">
            {[itemRarity(resultId), t("robRun.economy.barterOffers", { count: offers.length })].filter(Boolean).join(" · ")}
          </p>
        </div>
      </header>
      <div className="rob-run-detail-content">
        {offers.map((offer, index) => {
          const traders = tradersFor([offer]);
          const multiple = offers.length > 1;
          const heading = multiple ? "h3" : "h2";
          return <section key={offer.id} className="rob-run-barter-offer">
            {multiple && <DatabaseSectionTitle as="h2">{t("robRun.economy.barterOffer", { number: index + 1 })}</DatabaseSectionTitle>}
            <DetailSection as={heading} title={label("barterGive")}>{itemList(offer.requires, true)}</DetailSection>
            <DetailSection as={heading} title={label("barterGet")}>{itemList([{ item: resultId, amount: offer.amount ?? 1 }], true)}</DetailSection>
            {traders.length > 0 && <DetailSection as={heading} title={label("traders")}>
              <ul className="rob-run-detail-stock text-sm">{traders.map((trader) => <li key={trader.id}>{trader.name}</li>)}</ul>
            </DetailSection>}
            {offer.supplemental && <p className="text-sm text-muted">{t("robRun.wiki.externalOffer")}</p>}
          </section>;
        })}
      </div>
    </>;
  } else if (page === "shipments") {
    columns = [{ label: label("tier") }, { label: t("robRun.wiki.researchPrice"), numeric: true },
      { label: label("prerequisites"), numeric: true }, { label: label("availability") }];
    rows = [...nodes.values()]
      .filter((node) => matches(node.id, node.category ?? "", itemName(node.item)))
      .sort((a, b) => itemName(a.item).localeCompare(itemName(b.item)))
      .map((node) => ({
        id: node.id, label: itemName(node.item), nameClassName: itemRarityClass(getItem(node.item)),
        icon: <RobRunItemIcon item={getItem(node.item)} loading="lazy" />,
        cells: [
          node.tierIndex === null ? "—" : t("robRun.economy.tierNumber", { count: node.tierIndex + 1 }),
          format.format(getShipmentCashCost(node)),
          node.prerequisites.length,
          node.enabled ? label("available") : label("disabled"),
        ],
      }));
    const node = selectedId ? nodes.get(selectedId) : undefined;
    if (node) {
      const previous = node.prerequisites.flatMap((id) => nodes.get(id) ?? []);
      const total = totalUnlockCost([node], nodes);
      const isGoal = plan.goals.includes(node.id);
      const isUnlocked = plan.unlocked.includes(node.id);
      detail = <>
        <header className="rob-run-detail-header">
          <RobRunItemIcon item={getItem(node.item)} size={76} />
          <div><p className="rob-run-detail-eyebrow">{node.category ?? label("shipments")}</p>
            <h1 className={itemRarityClass(getItem(node.item))}>{itemName(node.item)}</h1></div>
        </header>
        <div className="rob-run-detail-action-stack px-4 pt-3">
          <DetailRecordLink target={{ page: "items", id: getItem(node.item)?.id ?? itemKey(node.item), name: itemName(node.item) }}
            label={t("robRun.wiki.viewItem")} />
          {!preview && node.enabled && <button type="button" className="rob-run-detail-action" onClick={() => changeGoal(node.id)}>
            {label(isGoal ? "removeGoal" : "addGoal")}
          </button>}
          {!preview && node.enabled && <button type="button" className="rob-run-detail-action" disabled={isUnlocked}
            onClick={() => setPlan((current) => ({
              ...current, unlocked: [...new Set([...current.unlocked, ...total.remaining])],
            }))}>
            {label(isUnlocked ? "completedResearch" : "markUnlocked")}
          </button>}
        </div>
        {!node.enabled && <p role="status" className="text-sm text-muted">{label("disabled")}</p>}
        <div className="rob-run-detail-content">
        <DetailSection title={label("unlockCost")}>
          {renderRequirements({ coins: node.coins, years: node.imprisonmentYears, tier: node.tierIndex, items: node.requires })}
          {node.settlementLevel != null && <p className="mt-2 text-sm">
            {t("robRun.wiki.settlementRequirement", { level: node.settlementLevel })}
          </p>}
        </DetailSection>
        <AlternateShipment economy={economy} itemId={node.item} itemName={itemName} format={money} />
        {previous.length > 0 && <div className="rob-run-detail-column">
          <DetailSection title={label("prerequisites")}>
            <div className="rob-run-detail-action-stack">{previous.map((entry) => (
              <DetailRecordLink key={entry.id} target={{ page: "shipments", id: entry.id, name: itemName(entry.item), realmVersion: realm?.realmVersion }}
                icon={<RobRunItemIcon item={getItem(entry.item)} loading="lazy" />} />
            ))}</div>
          </DetailSection>
          <DetailSection title={label("fullUnlockCost")}>
            {renderRequirements(total)}
          </DetailSection>
        </div>}
        </div>
      </>;
    }
  } else {
    columns = [
      { label: label("receives") },
      { label: label("steps"), numeric: true },
      { label: label("unitsPerStep"), numeric: true },
    ];
    rows = (economy?.loot ?? []).filter((entry) => matches(entry.id, sourceLabel(entry.id), itemName(entry.item)))
      .map((entry) => ({
        id: entry.id, label: sourceLabel(entry.id), icon: <RobRunItemIcon item={getItem(entry.item)} loading="lazy" />,
        cells: [<span className={itemRarityClass(getItem(entry.item))}>{itemName(entry.item)}</span>,
          asRange(entry.steps), asRange(entry.quantityPerStep)],
      }));
    const selected = economy?.loot.find(({ id }) => id === selectedId);
    if (selected) {
      const item = getItem(selected.item);
      const markerIds = selected.id === "bank_cash" && referenceMap
        ? Object.entries(referenceMap.points).flatMap(([id, point]) =>
          point.kind === "bank_vault" && point.lootPool !== undefined
          && referenceMap.lootPools[point.lootPool]?.some((entry) => entry.item === item?.id) ? [id] : [])
        : item ? getLootMarkerIds(referenceMap, item.id) : [];
      detail = <>
        <header className="rob-run-detail-header">
          <RobRunItemIcon item={item} size={76} />
          <div><p className="rob-run-detail-eyebrow">{label("loot")}</p><h1>{sourceLabel(selected.id)}</h1></div>
        </header>
        <div className="rob-run-detail-content">
          <div className="rob-run-detail-column">
            <DetailSection title={t("robRun.wiki.recordedYield")}>
              <DetailFacts rows={[[label("steps"), asRange(selected.steps)],
                [label("unitsPerStep"), asRange(selected.quantityPerStep)],
                [t("robRun.wiki.totalYield"), asRange([
                  selected.steps[0] * selected.quantityPerStep[0], selected.steps[1] * selected.quantityPerStep[1],
                ])]]} />
            </DetailSection>
          </div>
          <div className="rob-run-detail-column">
            {item && <DetailSection title={label("receives")}>
              <div className="rob-run-detail-stock"><DetailItemLink item={item} /></div>
            </DetailSection>}
            {markerIds.length > 0 && <DetailSection title={t("robRun.wiki.findOnMap")}>
              <button type="button" className="rob-run-detail-link"
                onClick={() => requestMapMarkerSetInMain("looty-bay", sourceLabel(selected.id), markerIds)}>
                <span>{t("robRun.wiki.possibleSpots", { count: markerIds.length })}</span>
              </button>
            </DetailSection>}
          </div>
        </div>
      </>;
    }
  }

  if (preview) return detail ? <article className="rob-run-detail">{detail}</article>
    : <p role="status" className="p-4 text-sm text-muted">{label(data ? "empty" : unavailable ? "error" : "loading")}</p>;

  if (page === "loot" && calculator && data) {
    return <RobRunLootCalculator items={data.items} cargo={data.economy.cargo} notoriety={data.economy.notoriety}
      initialItemId={target?.calculator ? target.id : undefined} onBack={() => setCalculator(false)} />;
  }
  if (page === "shipments" && showPlan && realm) {
    const remaining = totalUnlockCost(planned, nodes, plan.unlocked);
    return <section aria-label={label("myPlan")} className="h-full overflow-y-auto bg-background p-4">
      <article className="mx-auto grid max-w-3xl gap-5">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">{label("myPlan")}</h1>
          <button type="button" className="map-secondary-button" onClick={() => setShowPlan(false)}>
            {label("backToShipments")}
          </button>
        </header>
        <section className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <h2 className="font-semibold">{label("researchRemaining")}</h2>
          <p className="text-sm text-muted">{t("robRun.economy.unlockCount", { count: remaining.remaining.length })}</p>
          {renderRequirements(remaining)}
        </section>
        <section>
          <h2 className="mb-2 font-semibold">{label("goals")}</h2>
          {planned.length === 0 && <p className="text-sm text-muted">{label("noGoals")}</p>}
          <ul className="grid gap-1">{planned.map((node) => (
            <li key={node.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2">
              <ShipmentLink node={node} item={getItem(node.item)} onOpen={(id) => { setSelectedId(id); setShowPlan(false); }} />
              <button type="button" className="map-secondary-button" onClick={() => changeGoal(node.id)}>
                {label("removeGoal")}
                <span className="sr-only"> {itemName(node.item)}</span>
              </button>
            </li>
          ))}</ul>
        </section>
        {plan.unlocked.length > 0 && <button type="button" className="map-secondary-button justify-self-start"
          onClick={() => setPlan((current) => ({ ...current, unlocked: [] }))}>
          {label("resetCompleted")}
        </button>}
      </article>
    </section>;
  }
  const toolbar = page === "loot" && data
    ? <button type="button" className="map-secondary-button" onClick={() => setCalculator(true)}>{label("calculator")}</button>
    : page === "shipments" && realm && economy
      ? <>
        {economy.shipments.length > 1 && <CategoryDropdown neutral ariaLabel={label("realm")}
          value={String(realm.realmVersion)} triggerClassName="w-auto"
          onChange={(value) => { setSelectedId(undefined); setRealmVersion(Number(value)); }}
          options={economy.shipments.map(({ realmVersion: version }) => ({ key: String(version), label: String(version) }))} />}
        <button type="button" className="map-secondary-button" onClick={() => setShowPlan(true)}>
          {t("robRun.economy.planCount", { count: planned.length })}
        </button>
      </>
      : undefined;

  return <ItemCatalog label={label(page)} columns={columns} rows={rows}
    search={{ query, onChange: setQuery, label: label("search"), clearLabel: t("map.search.clear") }}
    toolbar={toolbar} onOpen={setSelectedId} onBack={() => setSelectedId(undefined)} backLabel={label("back")} backInToolbar
    emptyMessage={label(data ? "empty" : unavailable ? "error" : "loading")}
    detail={detail && <RobRunWikiWorkspace key={`${selectedId}:${realmVersion ?? ""}`} title={rows.find((row) => row.id === selectedId)?.label ?? label(page)}>
      <article className="rob-run-detail">{detail}</article>
    </RobRunWikiWorkspace>} />;
}

