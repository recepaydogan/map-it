import { Check, Loader2, Pencil } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  DISPLAY_NAME_MAX,
  defaultDisplayName,
  updateDisplayName,
  type AuthUser,
} from "../../auth/auth-service";
import { AuthError, AuthField } from "./auth-form";

/**
 * The account's name, and the way to change it. Clearing the box is a
 * legitimate action, not an error - it returns the account to the default name.
 * Having a name is mandatory, picking one is not.
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
    // Nothing to apply here on success: the rename comes back through the auth
    // store's subscription, which repaints every surface at once.
    if (result.ok) setEditing(false);
    else setError(result.error);
  };

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="truncate font-display text-2xl font-bold tracking-wide text-primary">
          {user.displayName}
        </h2>
        <button
          type="button"
          onClick={begin}
          aria-label={t("account.editDisplayName")}
          title={t("account.editDisplayName")}
          className="shrink-0 cursor-pointer rounded-[var(--radius-sm)] p-1.5 text-subtle transition-colors hover:bg-primary/[0.06] hover:text-primary"
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
      <p className="text-[11px] leading-relaxed text-muted">{t("account.displayNameHint")}</p>
      <AuthError>{error}</AuthError>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-3 py-1.5 text-xs font-semibold text-background transition-colors hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-50"
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
          className="cursor-pointer rounded-[var(--radius-sm)] border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("account.cancel")}
        </button>
      </div>
    </form>
  );
};

export default DisplayNameField;
