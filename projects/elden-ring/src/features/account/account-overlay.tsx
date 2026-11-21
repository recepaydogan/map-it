import { CircleUserRound, CloudOff, Loader2, X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../state/use-auth";
import AuthCard from "./auth-card";
import ProfileView from "./profile-view";

/**
 * Account surface — sign in / sign up / forgot password when signed out, the
 * profile when signed in. Shares the settings overlay's shell language (full-bleed
 * backdrop, header + close, fade-in) and lives inside MapShell, so it is
 * constrained to the non-ads region and never covers the Overwolf ad rail.
 *
 * Sign-in/out are plain auth-service calls; the AuthProvider's onAuthChange
 * subscription is the single source of truth, so the body below swaps between
 * the auth card and the profile automatically as the session appears/clears.
 */
const AccountOverlay = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { status, user } = useAuth();

  // ESC closes the overlay first. Capture + stopImmediatePropagation so the
  // app-wide ESC handler (selection / filter rail) doesn't also fire underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const subtitle =
    status === "signed-in"
      ? t("account.yourAccount")
      : status === "unavailable"
        ? t("account.serviceUnavailable")
        : t("account.signInOrCreate");

  return (
    <div className="absolute inset-0 z-[1500] flex flex-col bg-background animate-fade-in">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
          <CircleUserRound size={18} className="text-accent" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold tracking-tight text-white">{t("account.account")}</h1>
          <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>
        </div>
        <div className="flex-1" />
        <button
          onClick={onClose}
          aria-label={t("account.closeAccount")}
          className="grid h-8 w-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/8 hover:text-white"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 px-6 py-6">
        {status === "unavailable" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CloudOff size={26} className="text-zinc-500" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-white">{t("account.accountsNotAvailable")}</h2>
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
    </div>
  );
};

export default AccountOverlay;
