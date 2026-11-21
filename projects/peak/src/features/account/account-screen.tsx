import { CircleUserRound, CloudOff, Loader2, X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../state/auth-store";
import AuthCard from "./auth-card";
import ProfileView from "./profile-view";

interface AccountScreenProps {
  onClose: () => void;
}

/**
 * Account surface - sign in / sign up / forgot password when signed out, the
 * profile when signed in. Shares the settings screen's chrome (header, close,
 * fade-in) so the atlas keeps one shell language.
 *
 * Sign-in/out are plain auth-service calls; the auth store's onAuthChange
 * subscription is the single source of truth, so the body below swaps between
 * the auth card and the profile automatically as the session appears/clears.
 */
const AccountScreen = ({ onClose }: AccountScreenProps) => {
  const { t } = useTranslation();
  const { status, user } = useAuth();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const subtitle =
    status === "signed-in"
      ? t("account.yourAccount")
      : status === "unavailable"
        ? t("account.serviceUnavailable")
        : t("account.signInOrCreate");

  return (
    <section className="relative flex h-full flex-col overflow-hidden bg-background animate-fade-in">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
          <CircleUserRound size={18} className="text-accent" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold tracking-tight text-primary">
            {t("account.title")}
          </h1>
          <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-subtle transition-colors hover:bg-primary/[0.08] hover:text-primary"
          aria-label={t("account.close")}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        {status === "unavailable" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CloudOff size={26} className="text-subtle" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-primary">
                {t("account.accountsNotAvailable")}
              </h2>
              <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-muted">
                {t("account.accountsNotAvailableBody")}
              </p>
            </div>
          </div>
        ) : status === "signed-in" && user ? (
          <ProfileView user={user} />
        ) : status === "signed-out" ? (
          <AuthCard />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          </div>
        )}
      </div>
    </section>
  );
};

export default AccountScreen;
