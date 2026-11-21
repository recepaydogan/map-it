import { Loader2, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../state/use-auth";
import AuthCard from "./auth-card";
import ProfileView from "./profile-view";
import SharedPageHeader from "../../components/layout/shared-page-header";
import "./account-page.css";

/**
 * Account page — sign in / sign up / forgot password when signed out, and the
 * profile when signed in. It occupies the dashboard's non-ad content region.
 *
 * Sign-in/out are plain auth-service calls; the AuthProvider's onAuthChange
 * subscription is the single source of truth, so the body below swaps between
 * the auth card and the profile automatically as the session appears/clears.
 */
const AccountPage = () => {
  const { t } = useTranslation();
  const { status, user } = useAuth();

  return (
    <div className="map-it-account-page flex h-full min-h-0 flex-col bg-background">
      <SharedPageHeader icon={UserRound} title={t("account.account")} />

      <div className="map-it-page-body">
        {status === "signed-in" && user ? (
          <ProfileView key={user.id} user={user} />
        ) : status === "signed-out" || status === "unavailable" ? (
          <AuthCard unavailable={status === "unavailable"} />
        ) : (
          <div role="status" className="flex h-full items-center justify-center text-muted">
            <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <span className="sr-only">{t("account.loading")}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountPage;
