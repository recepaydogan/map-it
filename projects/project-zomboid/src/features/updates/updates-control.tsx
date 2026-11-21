import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import HeaderTab from "../../components/layout/header-tab";
import { LATEST_RELEASE_VERSION } from "./release-notes";
import { useUpdateReadState } from "./use-update-read-state";

const UpdatesControl = ({ active, onNavigate }: { active: boolean; onNavigate: () => void }) => {
  const { t } = useTranslation();
  const { unread, markRead } = useUpdateReadState(LATEST_RELEASE_VERSION);
  const label = unread
    ? t("updates.unread", { version: LATEST_RELEASE_VERSION })
    : t("updates.title");

  return (
    <HeaderTab
      icon={<Bell size={15} />}
      label={t("updates.title")}
      title={label}
      active={active}
      badge={unread}
      onClick={() => {
        markRead();
        onNavigate();
      }}
    />
  );
};

export default UpdatesControl;
