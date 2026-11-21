import { ArrowUpRight, Check, Heart, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_CONFIG } from "../../game-config";
import { cn } from "../../lib/cn";
import { subscriptions, useSubscription } from "./subscription-runtime";
import { regionalPrices, useRegionalPrices } from "./regional-prices-runtime";

const plans = [
  { key: "monthly", previewPrice: 5.99 },
  { key: "quarterly", previewPrice: 13.99 },
  { key: "annual", previewPrice: 59.99 },
] as const;

type PlanKey = typeof plans[number]["key"];

const benefits = [
  { key: "adFree", icon: Check },
  { key: "mapSpace", icon: Check },
  { key: "futureFeatures", icon: Check },
  { key: "supportFounder", icon: Heart },
] as const;

const actionClass = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-white/15 bg-surface px-2.5 py-1 text-xs font-semibold text-white enabled:cursor-pointer enabled:hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:text-subtle";
const cellClass = "border-t border-border px-2 py-3 sm:px-3";

export default function PremiumPlansPanel({ preview, onClose }: { preview: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const state = useSubscription();
  const quotes = useRegionalPrices(!preview);
  const titleId = useId();
  const descriptionId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  const [previewSelection, setPreviewSelection] = useState<PlanKey>();
  const hasSubscription = state.premium;

  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (!preview && hasSubscription) onClose();
  }, [preview, hasSubscription, onClose]);

  const columns = plans.map(({ key, previewPrice }) => {
    const id = GAME_CONFIG.premiumPackageIds[key];
    const item = state.packages.find(pkg => pkg.id === id);
    const quote = quotes.prices.find(quote => quote.id === id);
    const price = preview ? previewPrice : quote?.price;
    const currency = preview ? "USD" : quote?.currency;
    return {
      key, id, name: t(`premiumPlans.${key}.name`),
      price: price !== undefined && currency
        ? new Intl.NumberFormat(i18n.language, { style: "currency", currency }).format(price)
        : quotes.status === 'loading' ? '…' : t("premiumPlans.priceUnavailable"),
      selectable: preview || (Boolean(item) && state.status === "ready" && !hasSubscription),
    };
  });

  const status = preview
    ? previewSelection && t("premiumPlans.previewSelected", { plan: t(`premiumPlans.${previewSelection}.name`) })
    : state.checkoutPending ? t("premiumPlans.checkoutOpened")
      : hasSubscription ? t("subscriptionSettings.active")
        : state.status === "signed-out" ? t("premiumPlans.signInRequired")
          : state.error || quotes.status === 'error' ? t("premiumPlans.checkoutError")
            : state.status === "loading" ? t("subscriptionSettings.loading") : undefined;

  return (
    <div className="pointer-events-none absolute inset-0 z-[1501] p-2.5 sm:p-3">
      <div aria-hidden="true" className="pointer-events-auto absolute inset-0" onClick={onClose} />
      <section
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="pointer-events-auto relative flex max-h-full w-full max-w-[740px] flex-col overflow-hidden rounded-[var(--radius-md)] border border-white/15 bg-background shadow-xl shadow-black/50"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          onClose();
        }}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div>
            <h2 id={titleId} className="font-display text-xl font-semibold text-white sm:text-2xl">{t("premiumPlans.title")}</h2>
            <p id={descriptionId} className="mt-1 text-xs leading-relaxed text-subtle">{t("premiumPlans.description")}</p>
          </div>
          <button ref={closeButton} type="button" onClick={onClose} aria-label={t("premiumPlans.close")}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] border border-border text-subtle hover:bg-surface-hover hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="scroll-slim min-h-0 overflow-auto">
          <table className="w-full table-fixed border-collapse text-center text-xs">
            <thead className="bg-surface">
              <tr>
                <th scope="col" className="px-2 py-4 text-left align-bottom font-semibold text-subtle sm:px-5">{t("premiumPlans.benefits")}</th>
                {columns.map(({ key, name, price }) => (
                  <th scope="col" key={key} className={cn("border-l border-border px-1 py-4 align-top sm:px-2", key === "annual" && "shadow-[inset_0_2px_0_var(--color-accent)]")}>
                    <span className="block text-sm font-semibold text-white">{name}</span>
                    <span className="mt-2 block break-words text-base font-semibold text-white tabular-nums sm:text-xl">{price}</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-subtle">{t(`premiumPlans.${key}.cadence`)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {benefits.map(({ key: benefit, icon: Icon }) => (
                <tr key={benefit}>
                  <th scope="row" className={cn(cellClass, "text-left font-medium text-zinc-200 sm:pl-5")}>{t(`premiumPlans.${benefit}`)}</th>
                  {columns.map(({ key }) => <td key={key} className={cn(cellClass, "border-l")}>
                    <Icon className={cn("mx-auto text-accent", benefit === "supportFounder" && "fill-current")} size={16} aria-hidden="true" />
                    <span className="sr-only">{t("premiumPlans.included")}</span>
                  </td>)}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface">
              <tr>
                <td className={cellClass} />
                {columns.map(({ key, id, name, selectable }) => (
                  <td key={key} className={cn(cellClass, "border-l px-1 sm:px-3")}>
                    <button type="button" aria-label={t("premiumPlans.choosePlan", { plan: name })} disabled={!selectable}
                      onClick={() => preview ? setPreviewSelection(key) : void subscriptions.purchase(id)}
                      className={cn(actionClass, "w-full", key === "annual" && "border-accent/60 text-accent")}>
                      {t("premiumPlans.choose")} <ArrowUpRight size={13} aria-hidden="true" className="hidden shrink-0 sm:block" />
                    </button>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
          {(preview || status) && <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 sm:px-5">
            <div className="min-w-0">
              {status && <p role="status" className="mb-1 text-xs text-zinc-200">{status}</p>}
              {preview && <p className="text-[11px] leading-relaxed text-subtle">{t("premiumPlans.previewNote")}</p>}
            </div>
            {!preview && state.status === "signed-out" && (
              <button type="button" className={actionClass} onClick={() => overwolf.profile.openLoginDialog()}>{t("subscriptionSettings.login")}</button>
            )}
            {!preview && (state.status === "error" || quotes.status === 'error') && (
              <button type="button" className={actionClass} disabled={state.checking || quotes.status === 'loading'} onClick={() => {
                void regionalPrices.refresh(true);
                void subscriptions.refresh({ forceSync: true });
              }}>{t("subscriptionSettings.refresh")}</button>
            )}
          </footer>}
        </div>
      </section>
    </div>
  );
}
