import { MessageSquareText } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { useSupportBadges } from "../../state/use-support";

const HeaderSupportControl = ({
  active,
  onNavigate,
}: {
  active: boolean;
  onNavigate: () => void;
}) => {
  const { t } = useTranslation();
  const descriptionId = useId();
  const { unreadReplies, inboxPending, isAdmin } = useSupportBadges();
  const badge = isAdmin ? unreadReplies + inboxPending : unreadReplies;
  const label = badge > 0 ? t("support.buttonWaiting") : t("support.buttonIdle");

  const open = () => {
    onNavigate();
  };

  return (
    <div className="relative z-20 mx-1.5 flex w-max shrink-0 items-center">
      <button
        type="button"
        data-ow-no-drag
        data-tour="support"
        onClick={open}
        aria-current={active ? "page" : undefined}
        aria-describedby={descriptionId}
        className={cn(
          "header-fixed-text flex h-[26px] shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 font-medium leading-none transition-colors outline-none focus-visible:ring-2 focus-visible:ring-support-accent",
          active
            ? "border-support-accent/60 bg-support-accent-soft text-support-accent"
            : badge > 0
              ? "border-support-accent/60 text-support-accent hover:bg-support-accent/15"
              : "border-support-border text-support-zinc-100 hover:border-support-accent/60 hover:bg-support-accent/10 hover:text-support-accent",
        )}
      >
        <MessageSquareText size={13} className="shrink-0" aria-hidden="true" />
        <span>{t("support.title")}</span>
        {badge > 0 && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-[var(--radius-full)] bg-support-accent" />}
      </button>
      <span id={descriptionId} className="sr-only">{label}</span>
    </div>
  );
};

export default HeaderSupportControl;
