import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  shouldAutoStartOnboarding,
  useOnboardingActive,
} from "../../features/onboarding/use-onboarding";
import {
  isSupportNudgeSeen,
  markSupportNudgeSeen,
  onSupportNudgeSeen,
} from "./support-nudge-state";

const SHOW_DELAY_MS = 2500;
const AUTO_HIDE_MS = 15_000;

/** One-time callout that points to the Help & Feedback title-bar button. */
const SupportNudge = ({ onOpen }: { onOpen: () => void }) => {
  const { t } = useTranslation();
  const tourActive = useOnboardingActive();
  const tourActiveRef = useRef(tourActive);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    tourActiveRef.current = tourActive;
  }, [tourActive]);

  useEffect(() => {
    if (isSupportNudgeSeen() || shouldAutoStartOnboarding()) return;

    let hideTimer: number | undefined;
    const showTimer = window.setTimeout(() => {
      if (tourActiveRef.current) return;
      setVisible(true);
      hideTimer = window.setTimeout(markSupportNudgeSeen, AUTO_HIDE_MS);
    }, SHOW_DELAY_MS);
    const unsubscribe = onSupportNudgeSeen(() => setVisible(false));

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
      unsubscribe();
    };
  }, []);

  if (!visible || tourActive) return null;

  return (
    <div
      data-ow-no-drag
      className="absolute right-full top-full z-30 mr-2.5 mt-2 w-max max-w-[24rem] animate-support-fade-in"
    >
      <span
        aria-hidden="true"
        className="absolute -right-1 -top-1 h-2 w-2 rotate-45 border-r border-t border-support-accent/40 bg-support-surface"
      />
      <div className="flex items-start gap-1 rounded-[var(--radius-md)] border border-support-accent/40 bg-support-surface py-2 pl-3 pr-1.5 text-[12px] font-medium leading-relaxed text-support-zinc-100 shadow-lg shadow-black/50">
        <button
          type="button"
          onClick={() => {
            markSupportNudgeSeen();
            onOpen();
          }}
          className="cursor-pointer text-pretty text-left hover:underline"
        >
          {t("support.nudge")}
        </button>
        <button
          type="button"
          onClick={markSupportNudgeSeen}
          aria-label={t("support.dismissNudge")}
          className="shrink-0 cursor-pointer rounded-[var(--radius-sm)] p-0.5 text-support-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={12} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default SupportNudge;
