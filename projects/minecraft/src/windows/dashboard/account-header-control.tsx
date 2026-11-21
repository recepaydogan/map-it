import { CircleUserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { useAuth } from "../../state/use-auth";

const AccountHeaderControl = ({ active, onNavigate }: {
  active: boolean;
  onNavigate: () => void;
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();

  return <button type="button" data-tour="account" onClick={onNavigate}
    aria-label={user ? `${t("account.account")}: ${user.displayName}` : t("account.account")}
    aria-current={active ? "page" : undefined}
    title={t("account.account")}
    className={cn(
      "flex h-full w-10 cursor-pointer items-center justify-center border-b-2 border-transparent pt-0.5 text-white/75 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-2px]",
      active && "border-white/70 text-white",
    )}>
    <CircleUserRound size={16} aria-hidden="true" />
  </button>;
};

export default AccountHeaderControl;
