import { EyeOff, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { MarkerComment } from "../../services/comments/comments-service";
import CommentBody from "./comment-body";
import CommentEditor from "./comment-editor";
import CommentRowActions from "./comment-row-actions";
import CommentVoteBar from "./comment-vote-bar";
import { relativeTime } from "./comment-time";

interface CommentItemProps {
  comment: MarkerComment;
  reported: boolean;
  busy: boolean;
  /** Signed in — voting and flagging need an account, reading does not. */
  canWrite: boolean;
  /** Staff. Cosmetic only; the server re-checks every moderation call. */
  isAdmin: boolean;
  editPlaceholder: string;
  onVote: (direction: 1 | -1) => void;
  onRequireAuth: () => void;
  onEdit: (body: string, isSpoiler: boolean) => Promise<boolean>;
  onDelete: () => void;
  onReport: () => void;
  onSetHidden: (hidden: boolean) => void;
}

/**
 * One note.
 *
 * The body is the only thing here meant to be READ; the name, the age and the
 * counts are all there to be glanced at and skipped. So the body gets the size
 * and the brightness, and every other element in the row is deliberately quiet.
 */
const CommentItem = ({
  comment,
  reported,
  busy,
  canWrite,
  isAdmin,
  editPlaceholder,
  onVote,
  onRequireAuth,
  onEdit,
  onDelete,
  onReport,
  onSetHidden,
}: CommentItemProps) => {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);

  return (
    <article
      className={cn(
        "border-t border-border/60 px-4 py-3 first:border-t-0",
        // A hidden note is only ever delivered to its author and to staff, and it
        // has to look different from the notes everyone else can see.
        comment.hidden && "bg-amber-500/[0.04]",
      )}
    >
      <header className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="max-w-40 truncate text-[11.5px] font-semibold text-zinc-300">
          {comment.authorName}
        </span>
        <span className="text-[10px] tabular-nums text-subtle">
          {relativeTime(comment.createdAt, i18n.language)}
        </span>
        {comment.editedAt && (
          <span className="text-[10px] uppercase tracking-wide text-subtle">
            {t("comments.edited")}
          </span>
        )}
        {comment.isMine && (
          <span className="rounded-[var(--radius-full)] bg-accent/15 px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-accent">
            {t("comments.yours")}
          </span>
        )}
        {comment.isSpoiler && !editing && (
          <EyeOff size={11} className="text-amber-300/70" aria-label={t("comments.spoiler")} />
        )}
      </header>

      {/* The author needs to be told WHY their note stopped getting votes — a
          silent disappearance is what makes people post it again. Staff need the
          opposite reminder: that nobody else is seeing this one. */}
      {comment.hidden && (
        <p className="mb-1.5 flex items-center gap-1.5 rounded-[var(--radius-sm)] border-l-2 border-amber-400/60 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
          <ShieldAlert size={12} className="shrink-0" aria-hidden="true" />
          {comment.isMine ? t("comments.hidden") : t("comments.hiddenStaff")}
        </p>
      )}

      {editing ? (
        <CommentEditor
          initialBody={comment.body}
          initialSpoiler={comment.isSpoiler}
          placeholder={editPlaceholder}
          submitLabel={t("comments.save")}
          busy={busy}
          autoFocus
          onSubmit={async (body, isSpoiler) => {
            const done = await onEdit(body, isSpoiler);
            if (done) setEditing(false);
            return done;
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <CommentBody body={comment.body} isSpoiler={comment.isSpoiler} />
          <footer className="mt-1.5 flex items-center gap-2">
            <CommentVoteBar
              likeCount={comment.likeCount}
              dislikeCount={comment.dislikeCount}
              myVote={comment.myVote}
              onVote={(direction) => (canWrite ? onVote(direction) : onRequireAuth())}
            />
            <div className="ml-auto">
              <CommentRowActions
                isMine={comment.isMine}
                isAdmin={isAdmin}
                hidden={comment.hidden}
                reported={reported}
                busy={busy}
                onEdit={() => setEditing(true)}
                onDelete={onDelete}
                onReport={() => (canWrite ? onReport() : onRequireAuth())}
                onSetHidden={onSetHidden}
              />
            </div>
          </footer>
        </>
      )}
    </article>
  );
};

export default CommentItem;
