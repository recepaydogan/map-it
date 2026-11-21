import { MessageSquareText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSupportBadges } from "../../state/use-support";
import HeaderTab from "./header-tab";
import SupportNudge from "./support-nudge";
import { markSupportNudgeSeen } from "./support-nudge-state";

const HeaderSupportControl = ({
  active,
  onNavigate,
}: {
  active: boolean;
  onNavigate: () => void;
}) => {
  const { t } = useTranslation();
  const { unreadReplies, inboxPending, isAdmin } = useSupportBadges();
  const badge = isAdmin ? unreadReplies + inboxPending : unreadReplies;
  const label = badge > 0 ? t("support.buttonWaiting") : t("support.buttonIdle");

  const open = () => {
    markSupportNudgeSeen();
    onNavigate();
  };

  return (
    <div className="absolute left-full top-1/2 z-20 ml-1.5 w-max shrink-0 -translate-y-1/2">
      <HeaderTab
        icon={<MessageSquareText size={15} />}
        label={t("support.title")}
        title={label}
        active={active}
        badge={badge > 0}
        dataTour="support"
        onClick={open}
        className="h-[26px] max-w-[280px] rounded-[var(--radius-md)] border border-border px-2.5 text-[11px] tracking-wide hover:border-accent/60"
      />
      <SupportNudge onOpen={onNavigate} />
    </div>
  );
};

export default HeaderSupportControl;
