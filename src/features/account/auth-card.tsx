import { useState } from "react";
import { useTranslation } from "react-i18next";
import ForgotPasswordForm from "./forgot-password-form";
import SignInForm from "./sign-in-form";
import SignUpForm from "./sign-up-form";
import type { AuthView } from "./auth-form";
import { MAP_GAMES } from "../app-library/app-selection";

const VIEW_COPY: Record<AuthView, { titleKey: string; subtitleKey?: string }> = {
  "sign-in": {
    titleKey: "account.signIn",
  },
  "sign-up": {
    titleKey: "account.createAccount",
    subtitleKey: "account.signUpSubtitle",
  },
  "forgot-password": {
    titleKey: "account.recoverAccess",
    subtitleKey: "account.forgotPasswordSubtitle",
  },
};

/** Sign in / sign up / forgot password — one centered card, three forms. */
const AuthCard = ({ unavailable }: { unavailable: boolean }) => {
  const { t } = useTranslation();
  const [view, setView] = useState<AuthView>("sign-in");
  const [signInNotice, setSignInNotice] = useState<string | null>(null);

  const switchView = (next: AuthView) => {
    setSignInNotice(null);
    setView(next);
  };

  const copy = VIEW_COPY[view];

  return (
    <div className="map-it-page-content map-it-account-grid">
      <section className="map-it-panel map-it-account-form" aria-label={t(copy.titleKey)}>
        <header className="map-it-account-form-heading">
          <h2>{t(copy.titleKey)}</h2>
          {copy.subtitleKey && <p>{t(copy.subtitleKey)}</p>}
        </header>
        {unavailable && <p role="status" className="map-it-account-notice">{t("account.accountsNotAvailableBody")}</p>}

        {view === "sign-in" && <SignInForm onSwitch={switchView} notice={signInNotice} />}
        {view === "sign-up" && <SignUpForm
          onSwitch={switchView}
          onNeedsConfirmation={(notice) => {
            setSignInNotice(notice);
            setView("sign-in");
          }}
        />}
        {view === "forgot-password" && <ForgotPasswordForm onSwitch={switchView} />}
      </section>

      <aside className="map-it-panel map-it-account-brand">
        <img className="map-it-account-logo" src="/icon.png" width={52} height={52} alt="" />
        <p>{t("account.signInFeedbackSubtitle")}</p>
        <div className="map-it-account-game-icons" aria-hidden="true">
          {MAP_GAMES.map(app => <img key={app.id} src={app.icon} alt="" width={32} height={32} />)}
        </div>
      </aside>
    </div>
  );
};

export default AuthCard;
