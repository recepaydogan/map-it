import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { shouldAutoStartOnboarding, useOnboardingActive } from "../onboarding/use-onboarding";
import { isSupportNudgeSeen, markSupportNudgeSeen, onSupportNudgeSeen } from "./support-nudge-state";

const SHOW_DELAY_MS = 2_500;
const AUTO_HIDE_MS = 15_000;

const SupportNudge = ({ onOpen }: { onOpen: () => void }) => {
  const { t } = useTranslation();
  const tourActive = useOnboardingActive();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isSupportNudgeSeen() || shouldAutoStartOnboarding() || tourActive) return;

    let hideTimer: number | undefined;
    const showTimer = window.setTimeout(() => {
      setVisible(true);
      hideTimer = window.setTimeout(markSupportNudgeSeen, AUTO_HIDE_MS);
    }, SHOW_DELAY_MS);
    const unsubscribe = onSupportNudgeSeen(() => setVisible(false));

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
      unsubscribe();
    };
  }, [tourActive]);

  if (!visible || tourActive) return null;

  return <div data-ow-no-drag className="absolute right-0 top-full z-30 mt-2 w-max max-w-[24rem] animate-fade-in">
    <span aria-hidden="true" className="absolute right-3 -top-1 h-2 w-2 rotate-45 border-l border-t border-accent/40 bg-surface" />
    <div className="flex items-start gap-1 rounded-[var(--radius-md)] border border-accent/40 bg-surface py-2 pl-3 pr-1.5 text-[12px] font-medium leading-relaxed text-zinc-100 shadow-lg shadow-black/50">
      <button type="button" onClick={() => {
        markSupportNudgeSeen();
        onOpen();
      }} className="cursor-pointer text-pretty text-left hover:underline">
        {t("support.nudge")}
      </button>
      <button type="button" onClick={markSupportNudgeSeen} aria-label={t("support.dismissNudge")}
        className="shrink-0 cursor-pointer rounded-[var(--radius-sm)] p-0.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white">
        <X size={12} aria-hidden="true" />
      </button>
    </div>
  </div>;
};

export default SupportNudge;
