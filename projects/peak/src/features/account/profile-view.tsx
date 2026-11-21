import { Loader2, LogOut, Mountain } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { signOut, type AuthUser } from "../../auth/auth-service";
import { useExpeditions } from "../map/expedition-store";
import DisplayNameField from "./display-name-field";

const joinedSince = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

/** Account page: identity card with sign out. Lands here whenever a session is
 *  live; the screen swaps back to the auth card on the signed-out transition. */
const ProfileView = ({ user }: { user: AuthUser }) => {
  const { t } = useTranslation();
  const expeditions = useExpeditions();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    // The store flips to signed-out and the screen swaps back to the auth card.
    await signOut();
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl animate-fade-in flex-col gap-4">
      <div className="flex items-center gap-5 rounded-[var(--radius-lg)] border border-border bg-surface/60 p-6">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
          <span className="font-display text-xl font-bold text-accent">
            {user.displayName.slice(0, 1).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <DisplayNameField user={user} />
          <p className="truncate text-sm text-muted">{user.email}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-subtle">
            {t("account.joinedOn", { date: joinedSince(user.createdAt) })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          className="flex shrink-0 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border px-3 py-2 text-[13px] font-medium text-danger transition-colors hover:border-danger/40 hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {signingOut ? (
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          ) : (
            <LogOut size={13} aria-hidden="true" />
          )}
          {t("account.signOut")}
        </button>
      </div>

      <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface/60 px-6 py-5">
        <Mountain size={18} className="shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">
            {t("account.expeditionsRecorded", { count: expeditions.length })}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {t("account.expeditionsRecordedHint")}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProfileView;
