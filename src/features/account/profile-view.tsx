import { CalendarDays, Loader2, LogOut, Mail } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { signOut, type AuthUser } from "../../services/auth/auth-service";
import { AuthError } from "./auth-form";
import DisplayNameField from "./display-name-field";

const joinedSince = (iso: string, locale: string): string =>
  new Date(iso).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

/** Account page: identity card with sign out. Lands here whenever a session is
 *  live; the overlay swaps back to the auth card on the signed-out transition. */
const ProfileView = ({ user }: { user: AuthUser }) => {
  const { t, i18n } = useTranslation();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canDiscard, setCanDiscard] = useState(false);

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
    <div className="map-it-page-content map-it-profile">
      <section className="map-it-panel map-it-profile-identity" aria-label={t("account.yourAccount")}>
        <div className="map-it-profile-avatar" aria-hidden="true">
          {Array.from(user.displayName.trim())[0]?.toLocaleUpperCase(i18n.language)}
        </div>
        <div className="min-w-0 flex-1">
          <DisplayNameField user={user} />
          <div className="map-it-profile-meta">
            <span><Mail size={15} aria-hidden="true" />{user.email}</span>
            <span><CalendarDays size={15} aria-hidden="true" />{t("account.joinedOn", { date: joinedSince(user.createdAt, i18n.language) })}</span>
          </div>
        </div>
      </section>

      <section className="map-it-panel map-it-profile-session">
        <div className="map-it-profile-session-heading">
          <h2 className="map-it-form-title">{t("account.session")}</h2>
          <button type="button" onClick={() => void handleSignOut()} disabled={signingOut}
            className="map-it-button map-it-button-danger">
            {signingOut ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              : <LogOut size={15} aria-hidden="true" />}
            {t("account.signOut")}
          </button>
        </div>
        <AuthError>{error}</AuthError>
        {canDiscard && <button type="button" onClick={() => void handleSignOut(true)} disabled={signingOut}
          className="self-start cursor-pointer text-[12px] font-medium text-danger-text underline hover:text-danger disabled:opacity-60">
          {t("account.signOutDiscardLocal")}
        </button>}
      </section>
    </div>
  );
};

export default ProfileView;
