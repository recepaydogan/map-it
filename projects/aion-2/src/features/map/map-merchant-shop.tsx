import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import ProgressiveList from "../../components/progressive-list";
import { getItemDisplayName } from "../../lib/item-display-name";
import { cn } from "../../lib/cn";
import DatabaseSectionTitle from "../database/database-section-title";
import ItemIcon from "../database/item-icon";
import { sameReferenceTarget, useSelectedReference } from "../reference/reference-navigation-context";
import { useMerchantShops, type MerchantShopTab } from "./use-merchant-shops";

const TAB_LABELS: Record<string, string> = {
  UI_NPCSHOP_CATEGORY_ALL: "map.merchant.tabs.all",
  UI_NPCSHOP_CATEGORY_POTION: "map.merchant.tabs.potion",
  UI_NPCSHOP_CATEGORY_SCROLL: "map.merchant.tabs.scroll",
  UI_NPCSHOP_CATEGORY_ETC: "map.merchant.tabs.other",
};

const MapMerchantShop = ({ npcId, onOpenItem }: { npcId?: string; onOpenItem?: (itemId: string) => void }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
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
    if (name && name !== "None") return gameText(name);
    const event = /^CoinEvent(\d+)$/.exec(currency);
    if (event) return t("map.merchant.eventCurrency", { number: event[1] });
    return currency;
  };
  const priceText = (price: { amount: number; currency: string }[]) => price.map(({ amount, currency }) =>
    `${amount.toLocaleString(i18n.language)} ${currencyName(currency)}`).join(" + ");
  return <section className="mt-4 border-t border-border pt-4">
    <DatabaseSectionTitle>{t("map.merchant.forSale", { count })}</DatabaseSectionTitle>
    {tabs.length === 0 && <p className="text-xs text-subtle">{t("map.merchant.inventoryUnavailable")}</p>}
    <div className="space-y-4">
      {tabs.map((tab: MerchantShopTab) => <div key={`${tab.race}-${tab.name}`}>
        {tabs.length > 1 && <h4 className="map-micro-label mb-2">{t(TAB_LABELS[tab.name] ?? "map.merchant.tabs.other")}</h4>}
        <ProgressiveList className="divide-y divide-border">
          {tab.items.map((item) => <button key={item.id} type="button" disabled={!onOpenItem} onClick={() => onOpenItem?.(item.id)}
            aria-pressed={onOpenItem && selectedReference !== undefined ? sameReferenceTarget(selectedReference, { category: "items", id: item.id }) : undefined}
            className={cn("flex w-full items-start gap-2.5 rounded-[var(--radius-sm)] px-1 py-2.5 text-left transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default",
              sameReferenceTarget(selectedReference, { category: "items", id: item.id }) && "bg-accent-soft")}>
            <ItemIcon icon={item.icon} name={getItemDisplayName(item.name, gameText(item.name, item.id))} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block break-words text-[12px] font-semibold leading-4 text-zinc-100">{getItemDisplayName(item.name, gameText(item.name, item.id))}</span>
              <span className="mt-1 block break-words text-[11px] font-semibold leading-4 text-accent">{priceText(item.price)}</span>
            </span>
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
