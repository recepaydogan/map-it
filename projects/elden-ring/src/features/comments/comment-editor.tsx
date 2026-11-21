import { EyeOff, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ActionButton from "../../components/action-button";
import FormTextarea from "../../components/form-textarea";
import { cn } from "../../lib/cn";
import { COMMENT_MAX_BODY } from "../../services/comments/comments-service";

/** Below this many characters remaining, the counter is worth showing. Above it
 *  it is a number nobody is about to need, and this panel is 360px wide. */
const COUNTER_THRESHOLD = 200;

interface CommentEditorProps {
  initialBody?: string;
  initialSpoiler?: boolean;
  placeholder: string;
  submitLabel: string;
  busy: boolean;
  autoFocus?: boolean;
  /** Resolves true when the write landed — the editor closes only on success,
   *  so a rejected note is still in the box to fix rather than lost. */
  onSubmit: (body: string, isSpoiler: boolean) => Promise<boolean>;
  onCancel: () => void;
}

/**
 * The box you write a note in. ONE component for both writing a new note and
 * rewriting an old one — they take the same input, enforce the same limit and
 * carry the same spoiler switch, so two of these would drift apart the first
 * time either was touched.
 */
const CommentEditor = ({
  initialBody = "",
  initialSpoiler = false,
  placeholder,
  submitLabel,
  busy,
  autoFocus = false,
  onSubmit,
  onCancel,
}: CommentEditorProps) => {
  const { t } = useTranslation();
  const [body, setBody] = useState(initialBody);
  const [isSpoiler, setIsSpoiler] = useState(initialSpoiler);

  const trimmed = body.trim();
  const remaining = COMMENT_MAX_BODY - body.length;
  const canSubmit = trimmed.length >= 2 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    const done = await onSubmit(trimmed, isSpoiler);
    if (done) {
      setBody("");
      setIsSpoiler(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <FormTextarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void submit();
          }
          // The panel closes on Escape. While a half-written note is in the box,
          // Escape belongs to the box — losing the text to a keystroke meant for
          // the editor would be the worst bug this feature could ship with.
          if (event.key === "Escape") {
            event.stopPropagation();
            onCancel();
          }
        }}
        maxLength={COMMENT_MAX_BODY}
        rows={3}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={isSpoiler}
          onClick={() => setIsSpoiler((on) => !on)}
          title={t("comments.spoilerHint")}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-full)] border px-2.5 py-1 text-[11px] font-semibold transition-colors",
            isSpoiler
              ? "border-amber-400/50 bg-amber-400/15 text-amber-200"
              : "border-border bg-white/[0.03] text-zinc-400 hover:border-amber-400/40 hover:text-amber-200",
          )}
        >
          <EyeOff size={11} aria-hidden="true" />
          {t("comments.spoiler")}
        </button>

        {remaining <= COUNTER_THRESHOLD && (
          <span
            className={cn(
              "text-[10px] tabular-nums",
              remaining <= 0 ? "text-rose-300" : "text-subtle",
            )}
          >
            {remaining}
          </span>
        )}

        <ActionButton className="ml-auto px-2.5 py-1.5" onClick={onCancel} disabled={busy}>
          {t("comments.cancel")}
        </ActionButton>
        <ActionButton
          variant="primary"
          className="px-2.5 py-1.5"
          onClick={() => void submit()}
          disabled={!canSubmit}
        >
          {busy ? (
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          ) : (
            <Send size={12} aria-hidden="true" />
          )}
          {submitLabel}
        </ActionButton>
      </div>
    </div>
  );
};

export default CommentEditor;
