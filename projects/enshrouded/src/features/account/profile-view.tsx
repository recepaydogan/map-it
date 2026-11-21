import { Loader2, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { signOut, type AuthUser } from "../../services/auth/auth-service";
import {
  EMAIL_HASH_CONSENT_CHANGED,
  hasEmailHashConsent,
  setEmailHashConsent,
} from "../../services/ads/email-hashes";
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
  const [error, setError] = useState<string | null>(null);
  const [canDiscard, setCanDiscard] = useState(false);
  const [emailHashConsent, setConsent] = useState(() => hasEmailHashConsent(user.id));

  useEffect(() => {
    const refresh = () => setConsent(hasEmailHashConsent(user.id));
    refresh();
    window.addEventListener(EMAIL_HASH_CONSENT_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EMAIL_HASH_CONSENT_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [user.id]);

  const handleSignOut = async (discardUnsynced = false) => {
    setSigningOut(true);
    setError(null);
    setCanDiscard(false);
    // The provider flips to signed-out and the overlay swaps back to the auth card.
    const result = await signOut({ discardUnsynced });
    if (!result.ok) {
      setError(result.error);
      setCanDiscard(result.reason === "unsynced");
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
        <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-lg)] border border-border bg-surface/60 p-4">
          <input
            type="checkbox"
            checked={emailHashConsent}
            onChange={(event) => setEmailHashConsent(user.id, event.target.checked)}
            className="mt-1"
          />
          <span className="flex flex-col gap-1">
            <span className="text-[13px] font-medium">{t("account.emailHashConsent")}</span>
            <span className="text-[12px] text-muted">{t("account.emailHashConsentDescription")}</span>
          </span>
        </label>
        <AuthError>{error}</AuthError>
        {canDiscard && (
          <button type="button" onClick={() => void handleSignOut(true)} disabled={signingOut}
            className="self-start cursor-pointer text-[12px] font-medium text-danger-text underline hover:text-danger disabled:opacity-60">
            {t("account.signOutDiscardLocal")}
          </button>
        )}
      </div>
    </div>
  );
};

export default ProfileView;
