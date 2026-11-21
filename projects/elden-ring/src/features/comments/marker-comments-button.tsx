import { ChevronRight, MessageSquare, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { areCommentsAvailable } from "../../services/comments/comments-service";
import { useCommentCount } from "./use-comment-count";

interface MarkerCommentsButtonProps {
  /** The marker's stable note address. Every marker has one. */
  markerKey: string;
  /** Whether the notes panel is showing beside this one. */
  open: boolean;
  /** Boss pages get the flavoured label. */
  isBoss?: boolean;
  onToggle: () => void;
}

/**
 * The way into a marker's community notes: a pinned footer at the bottom of the
 * detail panel that opens the notes beside it.
 *
 * It sits OUTSIDE the panel's scroll area, so it stays put however long the
 * marker's page is — a boss with a full combat readout scrolls for several
 * screens, and an affordance buried under all of that is one nobody finds.
 *
 * The count is the reason it earns that spot: "3 notes" is an invitation, an
 * empty button is furniture. It comes from the shared count store, so posting a
 * note in the panel moves this badge without either knowing about the other.
 */
const MarkerCommentsButton = ({
  markerKey,
  open,
  isBoss = false,
  onToggle,
}: MarkerCommentsButtonProps) => {
  const { t } = useTranslation();
  const total = useCommentCount(markerKey);

  // A build without Supabase credentials has no server to ask.
  if (!areCommentsAvailable()) return null;

  const hasTips = (total ?? 0) > 0;

  return (
    <footer className="shrink-0 border-t border-border p-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-[12.5px] font-semibold transition-colors active:scale-[0.99]",
          open
            ? "border-accent/50 bg-accent/[0.12] text-white"
            : "border-border bg-white/[0.03] text-zinc-300 hover:border-accent/40 hover:bg-accent/[0.06] hover:text-white",
        )}
      >
        <MessageSquare
          size={15}
          className={cn("shrink-0", hasTips || open ? "text-accent" : "opacity-70")}
          aria-hidden="true"
        />
        <span className="truncate">
          {isBoss ? t("comments.titleBoss") : t("comments.title")}
        </span>
        {hasTips && (
          <span
            className={cn(
              "rounded-[var(--radius-full)] px-1.5 py-px text-[10px] font-bold tabular-nums",
              open ? "bg-white/15 text-white" : "bg-accent/15 text-accent",
            )}
          >
            {total}
          </span>
        )}
        {open ? (
          <X size={15} className="ml-auto shrink-0 opacity-70" aria-hidden="true" />
        ) : (
          <ChevronRight size={15} className="ml-auto shrink-0 opacity-60" aria-hidden="true" />
        )}
      </button>
    </footer>
  );
};

export default MarkerCommentsButton;
