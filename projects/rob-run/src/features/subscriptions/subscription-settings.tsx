import { useTranslation } from "react-i18next";
import { GAME_CONFIG } from "../../game-config";
import RemoveAdsCta from "../../components/ads/remove-ads-cta";
import { openExternalUrl } from "../../utils/platform";
import type { SubscriptionSnapshot } from "./subscription-controller";
import { subscriptions, useSubscription } from "./subscription-runtime";

export const MANAGE_SUBSCRIPTIONS_URL = "https://checkout.tebex.io/payment-history";
const button = "cursor-pointer rounded-[var(--radius-md)] border border-border px-3 py-2 text-xs font-medium text-white hover:bg-surface-hover disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent";
type PlanKey = keyof typeof GAME_CONFIG.premiumPackageIds;
const planKey = (id: number) => (Object.keys(GAME_CONFIG.premiumPackageIds) as PlanKey[])
  .find(key => GAME_CONFIG.premiumPackageIds[key] === id);

interface Props {
  state: SubscriptionSnapshot;
  onRefresh: () => void;
  onLogin: () => void;
  onManage: () => void;
  onViewPlans: () => void;
}

export function SubscriptionSettingsContent({ state, onRefresh, onLogin, onManage, onViewPlans }: Props) {
  const { t, i18n } = useTranslation();
  const current = state.activeSubscription;
  const selectedKey = current ? planKey(current.packageId) : undefined;
  const known = state.subscriptions.filter(entry => planKey(entry.packageId));
  const hasSubscriptions = known.length > 0;
  const validCount = known.filter(entry => entry.state === "ACTIVE" || entry.state === "PENDING_CANCELLATION").length;
  const statusLabel = (value: string) => t(`subscriptionSettings.states.${value}`, { defaultValue: t("subscriptionSettings.states.UNKNOWN") });

  return <section className="mb-7 rounded-[var(--radius-lg)] border border-border p-4 sm:p-5" aria-labelledby="subscription-settings-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="subscription-settings-title" className="text-sm font-semibold text-white">{t("subscriptionSettings.title")}</h2>
        <p className="mt-1 text-xs leading-relaxed text-subtle" role="status">
          {t(`subscriptionSettings.${state.premium ? "active" : state.status === "ready" ? "inactive" : state.status}`)}
        </p>
      </div>
      {hasSubscriptions && <button type="button" className={button} onClick={onManage}>{t("subscriptionSettings.manage")}</button>}
    </div>

    {selectedKey && current && <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-border pt-4 text-xs">
      <div><dt className="text-subtle">{t("subscriptionSettings.plan")}</dt><dd className="mt-1 font-semibold text-white">{t(`premiumPlans.${selectedKey}.name`)}</dd></div>
      <div><dt className="text-subtle">{t("subscriptionSettings.status")}</dt><dd className="mt-1 font-medium text-white">{statusLabel(current.state)}</dd></div>
      <div><dt className="text-subtle">{t("subscriptionSettings.billing")}</dt><dd className="mt-1 text-white">{t(`subscriptionSettings.billingTypes.${selectedKey}`)}</dd></div>
      {state.identity && <div><dt className="text-subtle">{t("subscriptionSettings.account")}</dt><dd className="mt-1 break-words text-white">{state.identity.name}</dd></div>}
    </dl>}

    {current?.state === "PENDING_CANCELLATION" && <p className="mt-3 text-xs leading-relaxed text-subtle">{t("subscriptionSettings.ending")}</p>}
    {validCount > 1 && <p className="mt-3 text-xs leading-relaxed text-subtle">{t("subscriptionSettings.highestPlan")}</p>}

    {(known.length > 1 || (!current && hasSubscriptions)) && <div className="mt-4 border-t border-border pt-3">
      <h3 className="text-xs font-medium text-white">{t("subscriptionSettings.yourPlans")}</h3>
      <ul className="mt-2 space-y-2 text-xs">
        {[...known].sort((a, b) => GAME_CONFIG.premiumPackageTiers[planKey(b.packageId)!] - GAME_CONFIG.premiumPackageTiers[planKey(a.packageId)!]).map((entry, index) =>
          <li key={`${entry.packageId}-${entry.recurringPaymentId ?? index}`} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-white">{t(`premiumPlans.${planKey(entry.packageId)}.name`)}{entry === current && <span className="ml-2 text-accent">{t("subscriptionSettings.inUse")}</span>}</span>
            <span className="text-subtle">{statusLabel(entry.state)}</span>
          </li>)}
      </ul>
    </div>}

    {state.checkoutPending && <p className="mt-3 text-xs text-subtle">{t("subscriptionSettings.checkoutPending")}</p>}
    <div className="mt-4 flex items-center gap-3">
      {state.status === "signed-out" && <button type="button" className={button} onClick={onLogin}>{t("subscriptionSettings.login")}</button>}
      <button type="button" className={`${button} shrink-0`} disabled={state.checking} onClick={onRefresh}>{t("subscriptionSettings.refresh")}</button>
      {state.checkedAt && <p className="ml-auto min-w-0 text-right text-[11px] text-subtle">{t("subscriptionSettings.checkedAt", {
        time: new Date(state.checkedAt).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" }),
      })}</p>}
    </div>
    {state.status === "ready" && !state.premium && <div className="mt-3">
      <RemoveAdsCta onActivate={onViewPlans} />
    </div>}
  </section>;
}

export default function SubscriptionSettings({ onViewPlans }: { onViewPlans: () => void }) {
  return <SubscriptionSettingsContent state={useSubscription()}
    onRefresh={() => void subscriptions.refresh({ forceSync: true })}
    onLogin={() => overwolf.profile.openLoginDialog()}
    onManage={() => openExternalUrl(MANAGE_SUBSCRIPTIONS_URL)}
    onViewPlans={onViewPlans} />;
}
