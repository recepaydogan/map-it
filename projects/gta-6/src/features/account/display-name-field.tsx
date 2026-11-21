import { Check, Loader2, Pencil } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  DISPLAY_NAME_MAX,
  defaultDisplayName,
  updateDisplayName,
  type AuthUser,
} from "../../services/auth/auth-service";
import { AuthError, AuthField } from "./auth-form";

/**
 * The account's name, and the way to change it. The edit affordance lives on
 * the name itself rather than behind a settings page.
 *
 * Clearing the box is a legitimate action, not an error — it returns the account
 * to the default name. Having a name is mandatory; picking one is not.
 */
const DisplayNameField = ({ user }: { user: AuthUser }) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = () => {
    setDraft(user.displayName);
    setError(null);
    setEditing(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const next = draft.trim();
    if (next === user.displayName) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await updateDisplayName(next);
    setSaving(false);
    // Nothing to apply here on success: the rename comes back through
    // AuthProvider's subscription, which repaints every surface at once.
    if (result.ok) setEditing(false);
    else setError(result.error);
  };

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="truncate font-display text-2xl font-bold tracking-wide text-white">
          {user.displayName}
        </h2>
        <button
          type="button"
          onClick={begin}
          aria-label={t("account.editDisplayName")}
          title={t("account.editDisplayName")}
          className="shrink-0 cursor-pointer rounded-[var(--radius-sm)] p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-white"
        >
          <Pencil size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void save(event)} className="flex flex-col gap-2">
      <AuthField
        label={t("account.displayName")}
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        // Showing the fallback as the placeholder answers "what happens if I
        // leave this empty?" without a sentence explaining it.
        placeholder={defaultDisplayName(user.email)}
        autoComplete="nickname"
        maxLength={DISPLAY_NAME_MAX}
        autoFocus
      />
      <p className="text-[12px] leading-relaxed text-muted">{t("account.displayNameFeedbackHint")}</p>
      <AuthError>{error}</AuthError>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          ) : (
            <Check size={12} aria-hidden="true" />
          )}
          {t("account.saveName")}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="cursor-pointer rounded-[var(--radius-md)] border border-border bg-black/30 px-3 py-1.5 text-[12.5px] font-medium text-zinc-300 transition-colors hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("account.cancel")}
        </button>
      </div>
    </form>
  );
};

export default DisplayNameField;
