import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { UPDATES_RELEASE_ID } from "../../game-config";
import { cn } from "../../lib/cn";
import { useUpdateReadState } from "./use-update-read-state";

const UpdatesControl = ({ active, onNavigate }: { active: boolean; onNavigate: () => void }) => {
  const { t } = useTranslation();
  const { unread, markRead } = useUpdateReadState(UPDATES_RELEASE_ID);
  return <button type="button" data-ow-no-drag onClick={() => { markRead(); onNavigate(); }}
    aria-label={unread ? t("updates.unread") : t("updates.title")} aria-current={active ? "page" : undefined}
    className={cn("flex h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap px-2.5 text-[12.5px] font-medium transition-colors outline-none focus-visible:bg-accent-soft",
      active ? "bg-accent-soft text-accent" : "text-white/75 hover:bg-white/8 hover:text-white")}>
    <Bell size={15} className="shrink-0" aria-hidden="true" />
    <span>{t("updates.title")}</span>
    {unread && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
  </button>;
};

export default UpdatesControl;
