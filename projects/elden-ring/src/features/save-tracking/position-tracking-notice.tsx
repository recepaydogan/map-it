import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, LocateFixed, X } from "lucide-react";
import { OVERWOLF_STORE_URL } from "../../utils/external-links";
import { IS_OVERWOLF } from "../../utils/platform";
import { shouldAutoStartOnboarding, useOnboarding } from "../onboarding/use-onboarding";

const STORAGE_KEY = `er-position-tracking-notice-${IS_OVERWOLF ? "app" : "web"}-v1`;

const wasDismissed = () => {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; }
  catch (error) { console.warn("[save-tracking] Cannot restore notice state", error); return false; }
};

const PositionTrackingNotice = () => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(wasDismissed);
  const onboardingActive = useOnboarding((state) => state.active);
  if (dismissed || onboardingActive || shouldAutoStartOnboarding()) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(STORAGE_KEY, "1"); }
    catch (error) { console.warn("[save-tracking] Cannot save notice state", error); }
  };

  return (
    <aside className="pointer-events-auto w-[18rem] max-w-[calc(100vw-1.5rem)] rounded-[var(--radius-lg)] border border-border bg-surface/95 p-3 shadow-lg shadow-black/40 backdrop-blur-sm">
      <div className="flex items-start gap-2.5">
        <LocateFixed size={17} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white">{t("positionNotice.title")}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-200">
            {t(IS_OVERWOLF ? "positionNotice.appBody" : "positionNotice.webBody")}
          </p>
          {!IS_OVERWOLF && (
            <a href={OVERWOLF_STORE_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              {t("positionNotice.download")} <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </div>
        <button type="button" onClick={dismiss} aria-label={t("common.close")} className="-mr-1 -mt-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
};

export default PositionTrackingNotice;
