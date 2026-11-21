import { MessageSquareText } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
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
    <div className="relative z-20 flex shrink-0 items-center">
      <button
        type="button"
        data-ow-no-drag
        data-tour="support"
        onClick={open}
        aria-current={active ? "page" : undefined}
        aria-describedby={descriptionId}
        className="window-chrome-action"
      >
        <MessageSquareText size={15} className="shrink-0" aria-hidden="true" />
        <span>{t("support.title")}</span>
        {badge > 0 && <span aria-hidden="true" className="window-chrome-action-dot" />}
      </button>
      <span id={descriptionId} className="sr-only">{label}</span>
    </div>
  );
};

export default HeaderSupportControl;
