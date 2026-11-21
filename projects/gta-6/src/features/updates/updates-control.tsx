import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUpdateReadState } from "./use-update-read-state";
import { UPDATES_VERSION } from "./updates-release";

const UpdatesControl = ({ active, onNavigate }: {
  active: boolean;
  onNavigate: () => void;
}) => {
  const { t } = useTranslation();
  const { unread, markRead } = useUpdateReadState(UPDATES_VERSION);
  const label = unread ? t("updates.unread", { version: UPDATES_VERSION }) : t("updates.title");
  return <button type="button" data-ow-no-drag data-tour="updates" onClick={() => { markRead(); onNavigate(); }}
    aria-label={label} aria-current={active ? "page" : undefined}
    className="window-chrome-action">
    <Bell size={15} className="shrink-0" aria-hidden="true" />
    <span>{t("updates.title")}</span>
    {unread && <span aria-hidden="true" className="window-chrome-action-dot" />}
  </button>;
};

export default UpdatesControl;
