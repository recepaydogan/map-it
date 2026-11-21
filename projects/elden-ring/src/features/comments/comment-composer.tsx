import { MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_DISPLAY_NAME } from "../../services/auth/auth-service";
import { useAuth } from "../../state/use-auth";
import { useUiStore } from "../../store/ui-store";
import CommentEditor from "./comment-editor";

interface CommentComposerProps {
  placeholder: string;
  busy: boolean;
  onSubmit: (body: string, isSpoiler: boolean) => Promise<boolean>;
}

/**
 * The affordance for adding a note: one quiet row until it is wanted, the full
 * editor once it is. Collapsed by default because most people opening a boss
 * page came to read, and an always-open textarea would push the notes they came
 * for below the fold of a 360px panel.
 */
const CommentComposer = ({ placeholder, busy, onSubmit }: CommentComposerProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const openOverlay = useUiStore((state) => state.openOverlay);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-border bg-white/[0.02] px-3 py-2 text-[12px] font-semibold text-zinc-400 transition-colors hover:border-accent/40 hover:bg-accent/[0.05] hover:text-zinc-100"
      >
        <MessageSquarePlus size={14} className="shrink-0" aria-hidden="true" />
        {t("comments.addNote")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* The one place that ties the name in the profile to the name strangers
          read: a note is signed, and the signature is worth seeing BEFORE it is
          published rather than after. */}
      <p className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] text-subtle">
        {t("comments.postingAs", { name: user?.displayName ?? DEFAULT_DISPLAY_NAME })}
        <button
          type="button"
          onClick={() => openOverlay("account")}
          className="cursor-pointer font-semibold text-accent transition-colors hover:text-white"
        >
          {t("comments.changeName")}
        </button>
      </p>
      <CommentEditor
        placeholder={placeholder}
        submitLabel={t("comments.post")}
        busy={busy}
        autoFocus
        onSubmit={async (body, isSpoiler) => {
          const done = await onSubmit(body, isSpoiler);
          if (done) setOpen(false);
          return done;
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
};

export default CommentComposer;
