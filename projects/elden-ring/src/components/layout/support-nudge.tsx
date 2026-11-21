import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useOnboarding } from "../../features/onboarding/use-onboarding";
import { shouldAutoStartOnboarding } from "../../features/onboarding/use-onboarding";
import {
  isSupportNudgeSeen,
  markSupportNudgeSeen,
  onSupportNudgeSeen,
} from "./support-nudge-state";

const SHOW_DELAY_MS = 2500;
/** The bubble folds away on its own — it's a hint, not a dialog to answer. */
const AUTO_HIDE_MS = 15_000;

/**
 * One-time callout under the title bar pointing at the Help & Feedback button —
 * a nudge that the app has a direct line to the developer, shown once and never
 * again after any interaction with it or with the button itself.
 */
const SupportNudge = ({ onOpen }: { onOpen: () => void }) => {
  const { t } = useTranslation();
  const tourActive = useOnboarding((s) => s.active);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // First launch still runs the guided tour, which has its own voice — the
    // nudge waits for a later launch.
    if (isSupportNudgeSeen() || shouldAutoStartOnboarding()) return;
    let hideTimer: number | undefined;
    const showTimer = window.setTimeout(() => {
      // A replayed tour dims the app behind its overlay; don't pop over it —
      // this launch is simply skipped and the flag stays unset.
      if (useOnboarding.getState().active) return;
      setVisible(true);
      // 15 s on screen is what showing this nudge gets — mark it seen so it
      // doesn't greet the user again every launch.
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
      // fade-in, not fade-up: fadeUp animates transform, which would fight the
      // -translate-y-1/2 centering and make the bubble jump on arrival.
      className="absolute right-full top-1/2 z-30 mr-2.5 w-max max-w-[24rem] -translate-y-1/2 animate-fade-in"
    >
      {/* Arrow on the right edge, aimed at the button the bubble sits beside. */}
      <span
        aria-hidden="true"
        className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-r border-t border-accent/40 bg-surface"
      />
      <div className="flex items-start gap-1 rounded-[var(--radius-md)] border border-accent/40 bg-surface py-2 pl-3 pr-1.5 text-[12px] font-medium leading-relaxed text-zinc-100 shadow-lg shadow-black/50">
        <button
          type="button"
          onClick={() => {
            markSupportNudgeSeen();
            onOpen();
          }}
          className="text-pretty text-left hover:underline cursor-pointer"
        >
          {t("support.nudge")}
        </button>
        <button
          type="button"
          onClick={markSupportNudgeSeen}
          aria-label={t("support.dismissNudge")}
          className="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
        >
          <X size={12} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default SupportNudge;
