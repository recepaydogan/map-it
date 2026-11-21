import { useTranslation } from "react-i18next";
import ProgressiveList from "../../components/progressive-list";
import { getItemDisplayName } from "../../lib/item-display-name";
import { cn } from "../../lib/cn";
import DatabaseSectionTitle from "../database/database-section-title";
import ItemIcon from "../database/item-icon";
import { sameReferenceTarget, useSelectedReference } from "../reference/reference-navigation-context";
import { useMerchantShops, type MerchantOffer, type MerchantShopTab } from "./use-merchant-shops";

const TAB_LABELS: Record<string, string> = {
  UI_NPCSHOP_CATEGORY_ALL: "map.merchant.tabs.all",
  UI_NPCSHOP_CATEGORY_POTION: "map.merchant.tabs.potion",
  UI_NPCSHOP_CATEGORY_SCROLL: "map.merchant.tabs.scroll",
  UI_NPCSHOP_CATEGORY_ETC: "map.merchant.tabs.other",
};

const hasDistinctUseLevel = (item: MerchantOffer) =>
  item.useLevel !== undefined && item.useLevel > 1 && item.useLevel !== item.level;

const MapMerchantShop = ({ npcId, onOpenItem }: { npcId?: string; onOpenItem?: (itemId: string) => void }) => {
  const { t, i18n } = useTranslation();
  const selectedReference = useSelectedReference();
  const state = useMerchantShops();

  if (state.status === "loading") return <p role="status" className="mt-4 text-xs text-subtle">{t("reference.loading")}</p>;
  if (state.status === "error") return <p role="alert" className="mt-4 text-xs text-danger-text">{t("reference.error")}</p>;

  const npc = npcId ? state.data.npcShops[npcId] : undefined;
  const shop = npc ? state.data.shops[npc.shop] : undefined;
  if (!shop || !npc) return <p className="mt-4 text-xs text-subtle">{t("map.merchant.inventoryUnavailable")}</p>;

  const tabs = shop.tabs.filter((tab) => tab.race === "All" || tab.race === npc.race);
  const count = tabs.reduce((total, tab) => total + tab.items.length, 0);
  const currencyName = (currency: string) => {
    if (currency === "GoldCombined") return t("map.merchant.kinah");
    const name = state.data.currencies[currency];
    if (name && name !== "None") return name;
    const event = /^CoinEvent(\d+)$/.exec(currency);
    if (event) return t("map.merchant.eventCurrency", { number: event[1] });
    return currency;
  };
  const priceText = (price: { amount: number; currency: string }[]) => price.map(({ amount, currency }) =>
    `${amount.toLocaleString(i18n.language)} ${currencyName(currency)}`).join(" + ");
  const limitText = (limit: { count: number; duration: string; owner: string }) => {
    const duration = limit.duration === "Daily" ? t("map.merchant.perDay")
      : limit.duration === "Weekly" ? t("map.merchant.perWeek") : "";
    const owner = limit.owner === "ServerAccount" ? t("map.merchant.perAccount") : t("map.merchant.perCharacter");
    return t("map.merchant.limit", { details: [limit.count.toLocaleString(i18n.language), duration, owner].filter(Boolean).join(" ") });
  };

  return <section className="mt-4 border-t border-border pt-4">
    <DatabaseSectionTitle>{t("map.merchant.forSale", { count })}</DatabaseSectionTitle>
    {tabs.length === 0 && <p className="text-xs text-subtle">{t("map.merchant.inventoryUnavailable")}</p>}
    <div className="space-y-4">
      {tabs.map((tab: MerchantShopTab) => <div key={`${tab.race}-${tab.name}`}>
        {tabs.length > 1 && <h4 className="map-micro-label mb-3">{t(TAB_LABELS[tab.name] ?? "map.merchant.tabs.other")}</h4>}
        <ProgressiveList className="space-y-1.5">
          {tab.items.map((item) => <button key={item.id} type="button" disabled={!onOpenItem} onClick={() => onOpenItem?.(item.id)}
            aria-pressed={onOpenItem && selectedReference !== undefined ? sameReferenceTarget(selectedReference, { category: "items", id: item.id }) : undefined}
            className={cn("flex w-full items-center gap-2 rounded-[var(--radius-sm)] border px-2 py-1.5 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft disabled:cursor-default",
              sameReferenceTarget(selectedReference, { category: "items", id: item.id }) ? "border-accent/60 bg-accent-soft" : "border-border bg-white/[0.03]")}>
            <ItemIcon icon={item.icon} name={getItemDisplayName(item.name)} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-medium text-zinc-100">{getItemDisplayName(item.name)}</span>
              {(item.level || hasDistinctUseLevel(item) || item.bundle > 1 || item.limit) && <span className="block text-[11px] text-subtle">{[
                item.level ? t("map.merchant.requiredLevel", { level: item.level }) : null,
                hasDistinctUseLevel(item) ? t("map.merchant.useLevel", { level: item.useLevel }) : null,
                item.bundle > 1 ? t("map.merchant.bundle", { count: item.bundle }) : null,
                item.limit ? limitText(item.limit) : null,
              ].filter(Boolean).join(" · ")}</span>}
            </span>
            <span className="shrink-0 text-right text-[11px] font-medium text-amber-300">{priceText(item.price)}</span>
          </button>)}
        </ProgressiveList>
      </div>)}
    </div>
    {shop.reroll && <div className="mt-4 border-t border-border pt-4">
      <DatabaseSectionTitle>{t("map.merchant.rerollCosts")}</DatabaseSectionTitle>
      <p className="text-[12px] leading-relaxed text-subtle">{t("map.merchant.rerollNote")}</p>
      <ol className="mt-3 grid grid-cols-2 gap-1.5">
        {shop.reroll.costs.map((cost, index) => <li key={index} className="rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2 py-1.5">
          <span className="block text-[11px] text-subtle">{t("map.merchant.rerollStep", { step: index + 1 })}</span>
          <span className="block text-[12px] font-medium tabular-nums text-amber-300">{priceText([cost])}</span>
        </li>)}
      </ol>
    </div>}
  </section>;
};

export default MapMerchantShop;
