import { ArrowRight, MessageSquareText } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { useSupportBadges } from "../../state/use-support";
import SupportNudge from "./support-nudge";
import { markSupportNudgeSeen } from "./support-nudge-state";

const PROMPT_INTERVAL_MS = 60_000;
const PROMPT_KEYS = [
  "missingFeature",
  "somethingBuggingYou",
  "cantFindSomething",
  "gotAnIdea",
  "wishItDidMore",
  "whatFeelsClunky",
  "somethingNotWorking",
  "whatWouldYouChange",
  "whatsMissing",
  "howCanWeImprove",
  "foundABug",
  "tellUsWhatYouThink",
] as const;

const HeaderSupportControl = ({
  active,
  onNavigate,
}: {
  active: boolean;
  onNavigate: () => void;
}) => {
  const { t } = useTranslation();
  const descriptionId = useId();
  const [promptIndex, setPromptIndex] = useState(0);
  const { unreadReplies, inboxPending, isAdmin } = useSupportBadges();
  const badge = isAdmin ? unreadReplies + inboxPending : unreadReplies;
  const label = badge > 0 ? t("support.buttonWaiting") : t("support.buttonIdle");

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPromptIndex((current) => (current + 1) % PROMPT_KEYS.length);
    }, PROMPT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const open = () => {
    markSupportNudgeSeen();
    onNavigate();
  };

  return (
    <div className="absolute left-full top-1/2 z-20 ml-1.5 w-max shrink-0 -translate-y-1/2">
      <button
        type="button"
        data-ow-no-drag
        data-tour="support"
        onClick={open}
        aria-current={active ? "page" : undefined}
        aria-describedby={descriptionId}
        title={label}
        className={cn(
          "flex h-[26px] max-w-[280px] shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-md)] border px-2.5 text-[11px] font-medium leading-none tracking-wide transition-colors",
          active
            ? "border-support-accent/60 bg-support-accent-soft text-support-accent"
            : badge > 0
              ? "border-support-accent/60 text-support-accent hover:bg-support-accent/15"
              : "border-support-border text-support-zinc-400 hover:border-support-accent/60 hover:bg-support-accent/10 hover:text-support-accent",
        )}
      >
        <MessageSquareText size={13} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">
          {t(`support.prompts.${PROMPT_KEYS[promptIndex]}`)}
        </span>
        {badge > 0 && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-[var(--radius-full)] bg-support-accent" />}
        <ArrowRight size={13} className="shrink-0" aria-hidden="true" />
      </button>
      <span id={descriptionId} className="sr-only">{label}</span>
      <SupportNudge onOpen={onNavigate} />
    </div>
  );
};

export default HeaderSupportControl;
