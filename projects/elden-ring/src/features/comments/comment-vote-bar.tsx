import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { CommentVote } from "../../services/comments/comments-service";

interface VoteButtonProps {
  direction: 1 | -1;
  count: number;
  active: boolean;
  label: string;
  onClick: () => void;
}

const VoteButton = ({ direction, count, active, label, onClick }: VoteButtonProps) => {
  const Icon = direction === 1 ? ThumbsUp : ThumbsDown;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-1 transition-colors",
        // Only YOUR vote is coloured. A wall of green thumbs would compete with
        // the note itself, which is the one thing in this row worth reading.
        active
          ? direction === 1
            ? "text-emerald-300"
            : "text-rose-300"
          : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200",
      )}
    >
      <Icon
        size={13}
        fill={active ? "currentColor" : "none"}
        aria-hidden="true"
        className="shrink-0"
      />
      {/* tabular-nums so a count crossing 9 → 10 doesn't shove the row about. */}
      <span className="text-[11px] font-semibold tabular-nums">{count}</span>
    </button>
  );
};

interface CommentVoteBarProps {
  likeCount: number;
  dislikeCount: number;
  myVote: CommentVote;
  /** Clicking the vote already cast takes it back — handled upstream. */
  onVote: (direction: 1 | -1) => void;
}

/** Was this note any good? The whole feedback loop, in two buttons. */
const CommentVoteBar = ({ likeCount, dislikeCount, myVote, onVote }: CommentVoteBarProps) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-0.5">
      <VoteButton
        direction={1}
        count={likeCount}
        active={myVote === 1}
        label={t("comments.like")}
        onClick={() => onVote(1)}
      />
      <VoteButton
        direction={-1}
        count={dislikeCount}
        active={myVote === -1}
        label={t("comments.dislike")}
        onClick={() => onVote(-1)}
      />
    </div>
  );
};

export default CommentVoteBar;
