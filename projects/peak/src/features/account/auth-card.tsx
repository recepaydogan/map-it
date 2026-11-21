import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AuthView } from "./auth-form";
import ForgotPasswordForm from "./forgot-password-form";
import SignInForm from "./sign-in-form";
import SignUpForm from "./sign-up-form";

const VIEW_COPY: Record<AuthView, { titleKey: string; subtitleKey: string }> = {
  "sign-in": { titleKey: "account.signIn", subtitleKey: "account.signInSubtitle" },
  "sign-up": { titleKey: "account.createAccount", subtitleKey: "account.signUpSubtitle" },
  "forgot-password": {
    titleKey: "account.recoverAccess",
    subtitleKey: "account.forgotPasswordSubtitle",
  },
};

/** Sign in / sign up / forgot password - one centered card, three forms. */
const AuthCard = () => {
  const { t } = useTranslation();
  const [view, setView] = useState<AuthView>("sign-in");
  const [signInNotice, setSignInNotice] = useState<string | null>(null);

  const switchView = (next: AuthView) => {
    setSignInNotice(null);
    setView(next);
  };

  const copy = VIEW_COPY[view];

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto py-6">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="panel-surface flex flex-col gap-5 rounded-[var(--radius-lg)] border border-border p-7">
          <header className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">
              {t("account.eyebrow")}
            </span>
            <h2 className="font-display text-2xl font-bold tracking-wide text-primary">
              {t(copy.titleKey)}
            </h2>
            <span className="ornament-line h-px w-14" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-muted">{t(copy.subtitleKey)}</p>
          </header>

          {view === "sign-in" && <SignInForm onSwitch={switchView} notice={signInNotice} />}
          {view === "sign-up" && (
            <SignUpForm
              onSwitch={switchView}
              onNeedsConfirmation={(notice) => {
                setSignInNotice(notice);
                setView("sign-in");
              }}
            />
          )}
          {view === "forgot-password" && <ForgotPasswordForm onSwitch={switchView} />}
        </div>
      </div>
    </div>
  );
};

export default AuthCard;
