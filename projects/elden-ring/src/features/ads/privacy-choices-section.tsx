import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { IS_WEB } from "../../utils/platform";

/**
 * Web-only privacy controls in Settings: the policy link, plus the two anchors
 * NitroPay's CMP fills in — a "manage consent" button for EU/EEA/UK visitors and
 * a CCPA opt-out link for California residents.
 *
 * The static site gets these injected automatically, but this app is a SPA whose
 * Settings screen doesn't exist at page load, so the CMP has to be asked to
 * inject again once the containers are mounted (Nitro's documented SPA path:
 * `__cmp('addConsentLink')` / `__uspapi('addLink', 1)`).
 *
 * Both containers stay empty for everyone the rules don't cover — that is the
 * CMP's own geo decision, not ours — so the section renders whatever survives
 * rather than guessing at the visitor's region.
 *
 * Overwolf renders none of this: the desktop app's ads come from Overwolf's own
 * SDK under Overwolf's consent flow, and its privacy policy, not NitroPay's.
 */
const PrivacyChoicesSection = () => {
  const { t } = useTranslation();

  useEffect(() => {
    if (!IS_WEB) return;
    const inject = () => {
      window.__cmp?.("addConsentLink");
      window.__uspapi?.("addLink", 1);
    };
    // The ad script is async: when Settings opens before it lands, wait for the
    // one event Nitro fires rather than polling.
    if (window.nitroAds?.loaded) {
      inject();
      return;
    }
    document.addEventListener("nitroAds.loaded", inject);
    return () => document.removeEventListener("nitroAds.loaded", inject);
  }, []);

  if (!IS_WEB) return null;

  return (
    <>
      <p className="px-1 pb-2 pt-7 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {t("settings.privacySection")}
      </p>
      <div className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/60">
        <div className="flex items-center justify-between gap-4 px-4 py-4">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-white">{t("settings.privacyPolicy")}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
              {t("settings.privacyPolicyDesc")}
            </p>
          </div>
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-white/[0.03] px-3 py-2 text-[12.5px] font-semibold text-zinc-200 transition-colors hover:border-accent/30 hover:text-white"
          >
            <ExternalLink size={14} aria-hidden="true" />
            {t("settings.openPrivacyPolicy")}
          </a>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-4">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-white">{t("settings.privacyChoices")}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
              {t("settings.privacyChoicesDesc")}
            </p>
          </div>
          {/* Filled by the CMP for the visitors each control applies to, empty for
              everyone else — hence the placeholder icon beside them, which keeps
              the row from reading as broken when both stay empty. */}
          <div className="flex shrink-0 items-center gap-3 text-[12.5px] font-semibold text-zinc-300 [&_a]:cursor-pointer [&_a]:text-accent [&_button]:cursor-pointer [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0 [&_button]:font-semibold [&_button]:text-accent">
            <ShieldCheck size={14} aria-hidden="true" className="text-zinc-500" />
            <div id="ncmp-consent-link" />
            <span data-ccpa-link="1" />
          </div>
        </div>
      </div>
    </>
  );
};

export default PrivacyChoicesSection;
