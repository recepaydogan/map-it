import type { ReactNode } from "react";
import { ArrowLeftRight, Store } from "lucide-react";
import { useTranslation } from "react-i18next";
import CategoryDot from "../../components/category-dot";
import { categoryMap } from "../../data/categories";
import { erItemKey, type ErItem } from "../../data/er-items-data";
import { remembranceTradeRoute } from "../../data/item-acquisition";
import { itemMerchants } from "../../data/markers";

const ER_CATEGORY_DEFS = categoryMap("elden-ring");

interface ItemAcquisitionProps {
  item: ErItem;
  heading: ReactNode;
  onNavigate?: (markerId: string) => void;
  /** Tooltip on a navigable source row. Defaults to the map's "show on map" —
   *  surfaces without a map (the companion window) say what they really do. */
  navigateTitle?: string;
}

const cleanRegion = (region: string): string =>
  region.replace(/\s*[-–]\s*/g, " – ").trim();

/** Merchant and remembrance routes omitted by direct drop/location sections. */
const ItemAcquisition = ({ item, heading, onNavigate, navigateTitle }: ItemAcquisitionProps) => {
  const { t, i18n } = useTranslation();
  const goTitle = navigateTitle ?? t("codex.showOnMap");
  const tradeRoute = remembranceTradeRoute(item);
  const merchants = itemMerchants(erItemKey(item));
  const rawTrade = item.obtainability?.trade;
  const hasGenericPurchase =
    !rawTrade &&
    !merchants.length &&
    Boolean(item.obtainability?.price || item.obtainability?.shop_stock != null);

  if (!tradeRoute && !merchants.length && !hasGenericPurchase) return null;

  return (
    <section>
      {heading}
      <div className="flex flex-col gap-1.5">
        {tradeRoute?.boss && (() => {
          const source = tradeRoute.boss;
          const category = ER_CATEGORY_DEFS.get(source.category);
          const content = (
            <>
              <CategoryDot
                color={category?.color ?? "#d65a4e"}
                icon={category?.icon ?? "skull"}
                iconUrl={source.iconUrl}
                size={20}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-100">
                {source.name}
              </span>
              <span className="shrink-0 rounded-[var(--radius-full)] bg-emerald-600/25 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200">
                {t("codex.guaranteed")}
              </span>
            </>
          );

          return onNavigate ? (
            <button
              type="button"
              onClick={() => onNavigate(source.markerId)}
              title={goTitle}
              className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft cursor-pointer"
            >
              {content}
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2.5 py-2">
              {content}
            </div>
          );
        })()}

        {tradeRoute && (
          <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-accent/30 bg-accent-soft px-2.5 py-2">
            <ArrowLeftRight size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            <span className="min-w-0 text-[13px] leading-snug text-zinc-100">
              <span className="block font-semibold text-white">
                {t("codex.exchangeMaterial", { material: tradeRoute.material.name })}
              </span>
              <span className="mt-0.5 block text-[11px] text-zinc-300">
                {tradeRoute.merchant} · {tradeRoute.location}
              </span>
            </span>
          </div>
        )}

        {merchants.map((merchant) => {
          const content = (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <Store size={13} className="shrink-0 text-accent" aria-hidden="true" />
                <span className="truncate text-[13px] text-zinc-100">
                  {merchant.name}
                  {merchant.region && (
                    <span className="text-zinc-400"> · {cleanRegion(merchant.region)}</span>
                  )}
                </span>
              </span>
              {item.obtainability?.price ? (
                <span className="shrink-0 text-[12px] tabular-nums text-zinc-300">
                  {item.obtainability.price.toLocaleString(i18n.language)} {t("codex.runes")}
                </span>
              ) : null}
            </>
          );

          return onNavigate ? (
            <button
              key={merchant.markerId}
              type="button"
              onClick={() => onNavigate(merchant.markerId)}
              title={goTitle}
              className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft cursor-pointer"
            >
              {content}
            </button>
          ) : (
            <div
              key={merchant.markerId}
              className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2.5 py-2"
            >
              {content}
            </div>
          );
        })}

        {hasGenericPurchase && (
          <div className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2.5 py-2">
            <span className="flex items-center gap-2 text-[13px] text-zinc-100">
              <Store size={13} className="shrink-0 text-accent" aria-hidden="true" />
              {t("codex.purchasableFromMerchant")}
            </span>
            <span className="flex shrink-0 items-center gap-2.5 text-[12px] tabular-nums">
              {item.obtainability?.price ? (
                <span className="text-zinc-300">
                  {item.obtainability.price.toLocaleString(i18n.language)} {t("codex.runes")}
                </span>
              ) : null}
              {item.obtainability?.shop_stock === -1 ? (
                <span className="text-zinc-300">{t("codex.infiniteStock")}</span>
              ) : (item.obtainability?.shop_stock ?? 0) > 0 ? (
                <span className="text-zinc-300">×{item.obtainability?.shop_stock}</span>
              ) : null}
            </span>
          </div>
        )}
      </div>
    </section>
  );
};

export default ItemAcquisition;
