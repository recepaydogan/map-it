import { Loader2, LogOut } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { signOut, type AuthUser } from "../../services/auth/auth-service";
import { getCloudSyncStatus, subscribeCloudSyncStatus } from "../../services/sync/cloud-sync";
import DisplayNameField from "./display-name-field";
import SubscriptionSettings from "../subscriptions/subscription-settings";
import { SUBSCRIPTIONS_ENABLED } from "../subscriptions/subscription-runtime";

const joinedSince = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

/** Account page: identity card with sign out. Lands here whenever a session is
 *  live; the overlay swaps back to the auth card on the signed-out transition. */
const ProfileView = ({ user, onViewPlans }: { user: AuthUser; onViewPlans: () => void }) => {
  const { t } = useTranslation();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const syncStatus = useSyncExternalStore(subscribeCloudSyncStatus, getCloudSyncStatus);

  const handleSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    // The provider flips to signed-out and the overlay swaps back to the auth card.
    try {
      const result = await signOut(user.id);
      if (result.ok) return;
      setSignOutError(result.error);
      setSigningOut(false);
    } catch (error) {
      console.error("Could not sign out", error);
      setSignOutError(t("account.errors.unknown"));
      setSigningOut(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto py-2">
      <div className="mx-auto flex w-full max-w-2xl animate-fade-up flex-col gap-4">
        <div className="flex items-center gap-5 rounded-[var(--radius-lg)] border border-border bg-surface/60 p-6">
          <div className="min-w-0 flex-1">
            <DisplayNameField user={user} />
            <p className="truncate text-[13px] text-muted">{user.email}</p>
            <p className="mt-1 text-[12px] uppercase tracking-[0.14em] text-muted">
              {t("account.joinedOn", { date: joinedSince(user.createdAt) })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="flex shrink-0 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border px-3 py-2 text-[13px] font-medium text-danger-text transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signingOut ? (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            ) : (
              <LogOut size={13} aria-hidden="true" />
            )}
            {t("account.signOut")}
          </button>
        </div>
        {syncStatus !== "idle" && (
          <p className="px-1 text-[12px] text-muted" role={syncStatus === "error" ? "alert" : "status"}>
            {t(`account.sync.${syncStatus}`)}
          </p>
        )}
        {signOutError && <p role="alert" className="px-1 text-[12px] text-danger-text">{signOutError}</p>}
        {SUBSCRIPTIONS_ENABLED && <SubscriptionSettings onViewPlans={onViewPlans} />}
      </div>
    </div>
  );
};

export default ProfileView;
