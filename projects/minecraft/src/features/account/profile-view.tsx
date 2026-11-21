import { Loader2, LogOut } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { signOut, type AuthUser } from "../../services/auth/auth-service";
import { flushCloudProgressSync } from "../../services/sync/cloud-progress-sync";
import { AuthError } from "./auth-form";
import DisplayNameField from "./display-name-field";

const joinedSince = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

/** Account page: identity card with sign out. Lands here whenever a session is
 *  live; the overlay swaps back to the auth card on the signed-out transition. */
const ProfileView = ({ user }: { user: AuthUser }) => {
  const { t } = useTranslation();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  const handleSignOut = async () => {
    setSigningOut(true);
    setError("");
    try {
      if (!await flushCloudProgressSync(user.id)) {
        setError(t("account.serviceUnavailable"));
        return;
      }
      // The provider flips to signed-out and the overlay swaps back to the auth card.
      const result = await signOut();
      if (!result.ok) setError(result.error);
    } catch (failure) {
      console.error("[Account] Unable to sign out safely:", failure);
      setError(t("account.serviceUnavailable"));
    } finally {
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
        <AuthError>{error}</AuthError>
      </div>
    </div>
  );
};

export default ProfileView;
