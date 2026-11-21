import { Languages, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import CommentComposer from "./comment-composer";
import CommentItem from "./comment-item";
import CommentSignInCta from "./comment-sign-in-cta";
import CommentSortTabs from "./comment-sort-tabs";
import type { MarkerCommentsState } from "./use-marker-comments";

/** Below this, ordering is not a question anyone has, so the tabs stay away. */
const SORT_TABS_FROM = 3;

interface CommentListProps {
  state: MarkerCommentsState;
  /** Signed in — writing, voting and flagging all need an account. */
  canWrite: boolean;
  /** The session is still resolving, so neither write affordance is honest yet. */
  authPending: boolean;
  /** Staff. Cosmetic only; the server re-checks every moderation call. */
  isAdmin: boolean;
  onRequireAuth: () => void;
  placeholder: string;
}

/** The notes panel's body: write-box, order, notes, more. */
const CommentList = ({
  state,
  canWrite,
  authPending,
  isAdmin,
  onRequireAuth,
  placeholder,
}: CommentListProps) => {
  const { t } = useTranslation();
  const { comments, total, sort, loading, busy, error, hasMore, reported } = state;

  return (
    <div className="flex flex-col gap-2.5 px-4 py-3">
      {/* The PANEL is localised like everything else; what players write in it
          cannot be. Said once at the top so a reader knows why the notes are all
          in one language, and a writer knows which one to use — before they have
          typed anything, not after the server rejects nothing at all. */}
      <p className="flex items-center gap-1.5 text-[10.5px] leading-snug text-subtle">
        <Languages size={12} className="shrink-0" aria-hidden="true" />
        {t("comments.englishOnly")}
      </p>

      {authPending ? null : canWrite ? (
        <CommentComposer placeholder={placeholder} busy={busy} onSubmit={state.post} />
      ) : (
        <CommentSignInCta onSignIn={onRequireAuth} />
      )}

      {error && (
        <p className="flex items-start gap-1.5 rounded-[var(--radius-sm)] border-l-2 border-rose-400/60 bg-rose-500/10 px-2 py-1.5 text-[11.5px] leading-snug text-rose-200">
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={state.dismissError}
            aria-label={t("comments.dismissError")}
            className="cursor-pointer text-rose-300/70 transition-colors hover:text-rose-200"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </p>
      )}

      {(total ?? 0) >= SORT_TABS_FROM && (
        <CommentSortTabs sort={sort} onChange={state.setSort} />
      )}

      {loading ? (
        <p className="flex items-center justify-center gap-2 py-6 text-[11.5px] text-subtle">
          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          {t("comments.loading")}
        </p>
      ) : comments.length === 0 ? (
        <p className="py-2 text-[12px] leading-relaxed text-subtle">{t("comments.empty")}</p>
      ) : (
        // Negative side margins let each row's separator run the full width of
        // the panel while the text keeps the panel's own 16px gutter.
        <div className="-mx-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              reported={reported.has(comment.id)}
              busy={busy}
              canWrite={canWrite}
              isAdmin={isAdmin}
              editPlaceholder={placeholder}
              onVote={(direction) => state.vote(comment.id, direction)}
              onRequireAuth={onRequireAuth}
              onEdit={(body, isSpoiler) => state.edit(comment.id, body, isSpoiler)}
              onDelete={() => void state.remove(comment.id)}
              onReport={() => void state.report(comment.id)}
              onSetHidden={(hidden) => void state.setHidden(comment.id, hidden)}
            />
          ))}
        </div>
      )}

      {hasMore && !loading && (
        <button
          type="button"
          onClick={state.loadMore}
          className="cursor-pointer self-start text-[11.5px] font-semibold text-accent transition-colors hover:text-white"
        >
          {t("comments.loadMore")}
        </button>
      )}
    </div>
  );
};

export default CommentList;
