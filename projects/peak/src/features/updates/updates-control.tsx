import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { twMerge } from "tailwind-merge";
import { UPDATES_RELEASE } from "./updates-release";
import { useUpdateReadState } from "./use-update-read-state";

const UpdatesControl = ({ active, onNavigate }: {
  active: boolean;
  onNavigate: () => void;
}) => {
  const { t } = useTranslation();
  const { unread, markRead } = useUpdateReadState(UPDATES_RELEASE.version);

  return (
    <button
      type="button"
      data-ow-no-drag
      onClick={() => { markRead(); onNavigate(); }}
      aria-label={unread ? t("updates.unread", { version: UPDATES_RELEASE.version }) : t("updates.title")}
      aria-current={active ? "page" : undefined}
      className={twMerge(
        "flex h-full shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap px-2.5 text-[12.5px] font-medium transition-colors",
        active ? "bg-surface-hover text-primary" : "text-subtle hover:bg-surface-hover hover:text-primary",
      )}
    >
      <Bell size={15} aria-hidden="true" />
      <span>{t("updates.title")}</span>
      {unread && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
    </button>
  );
};

export default UpdatesControl;
