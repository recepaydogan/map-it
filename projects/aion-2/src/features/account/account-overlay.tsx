import { CloudOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../state/use-auth";
import { cn } from "../../lib/cn";
import MyCharactersView from "../character-profiles/my-characters-view";
import AuthCard from "./auth-card";
import ProfileView from "./profile-view";

/** One profile surface for linked characters and account settings. */
const AccountPage = ({ initialTab = "characters", onViewPlans }: { initialTab?: "characters" | "account"; onViewPlans: () => void }) => {
  const { t } = useTranslation();
  const { status, user } = useAuth();
  const [tab, setTab] = useState<"characters" | "account">(initialTab);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background animate-fade-in">
      <div role="tablist" aria-label={t("profile.sections")} className="flex shrink-0 gap-1 border-b border-border px-5 lg:px-7">
        {(["characters", "account"] as const).map((value) => <button key={value} type="button" role="tab" id={`profile-tab-${value}`} aria-selected={tab === value} aria-controls="profile-panel" tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={(event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
          event.preventDefault();
          const next = value === "characters" ? "account" : "characters";
          setTab(next);
          document.getElementById(`profile-tab-${next}`)?.focus();
        }} className={cn("min-h-11 cursor-pointer border-b-2 px-3 text-[12px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent", tab === value ? "border-accent text-accent" : "border-transparent text-subtle hover:text-white")}>{t(`profile.tabs.${value}`)}</button>)}
      </div>
      <div id="profile-panel" role="tabpanel" aria-labelledby={`profile-tab-${tab}`} className="min-h-0 flex-1">
        {status === "loading" ? <div className="flex h-full items-center justify-center text-muted"><Loader2 size={18} className="animate-spin" aria-hidden="true" /></div>
          : tab === "characters" ? <MyCharactersView key={user?.id ?? "guest"} userId={user?.id ?? null} />
            : <div className="h-full px-6 py-6">{status === "unavailable" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CloudOff size={26} className="text-zinc-500" aria-hidden="true" />
            <div>
              <h2 className="text-[13px] font-semibold text-white">
                {t("account.accountsNotAvailable")}
              </h2>
              <p className="mx-auto mt-1.5 max-w-xs text-[12px] leading-relaxed text-muted">
                {t("account.accountsNotAvailableBody")}
              </p>
            </div>
          </div>
        ) : status === "signed-in" && user ? <ProfileView user={user} onViewPlans={onViewPlans} /> : <AuthCard />}</div>}
      </div>
    </div>
  );
};

export default AccountPage;
