import { Eye, EyeOff, Flag, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ActionButton from "../../components/action-button";
import { cn } from "../../lib/cn";

interface CommentRowActionsProps {
  isMine: boolean;
  /** Staff. Cosmetic only — every one of these calls is re-checked server-side. */
  isAdmin: boolean;
  hidden: boolean;
  /** Already flagged by this reader in this session. */
  reported: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
  onSetHidden: (hidden: boolean) => void;
}

const IconAction = ({
  icon: Icon,
  label,
  staff = false,
  onClick,
}: {
  icon: typeof Flag;
  label: string;
  /** Tinted, because acting on someone else's words is not an ordinary click. */
  staff?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className={cn(
      "cursor-pointer rounded-[var(--radius-sm)] p-1 transition-colors hover:bg-white/[0.05]",
      staff
        ? "text-amber-300/70 hover:text-amber-200"
        : "text-zinc-500 hover:text-zinc-200",
    )}
  >
    <Icon size={13} aria-hidden="true" />
  </button>
);

/**
 * What you can do to a note that isn't voting: fix your own, delete your own,
 * flag someone else's — and, as staff, hide or delete anyone's.
 *
 * Hiding is offered before deleting on the staff path on purpose: it is
 * reversible, the author keeps seeing their own note (marked), and it is the
 * right instrument for "this is wrong" as opposed to "this is abuse".
 *
 * Both destructive paths confirm INLINE, never in a dialog. A modal here would
 * have to be positioned against the viewport, and in the Overwolf build the
 * viewport includes the ad rail that nothing is allowed to cover — so the
 * confirm simply takes the place of the row's own action strip.
 */
const CommentRowActions = ({
  isMine,
  isAdmin,
  hidden,
  reported,
  busy,
  onEdit,
  onDelete,
  onReport,
  onSetHidden,
}: CommentRowActionsProps) => {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState<"delete" | "report" | null>(null);

  if (confirming) {
    const destructive = confirming === "delete";
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <span className="text-[11px] text-zinc-300">
          {destructive ? t("comments.deleteConfirm") : t("comments.reportConfirm")}
        </span>
        <ActionButton className="px-2 py-1 text-[11px]" onClick={() => setConfirming(null)}>
          {t("comments.cancel")}
        </ActionButton>
        <ActionButton
          variant="danger"
          className="px-2 py-1 text-[11px]"
          disabled={busy}
          onClick={() => {
            setConfirming(null);
            if (destructive) onDelete();
            else onReport();
          }}
        >
          {destructive ? t("comments.delete") : t("comments.report")}
        </ActionButton>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      {isMine && (
        <IconAction icon={Pencil} label={t("comments.edit")} onClick={onEdit} />
      )}

      {/* Staff act on other people's notes; on their own they are just an author
          like anyone else, and the ordinary edit/delete pair is what applies. */}
      {isAdmin && !isMine && (
        <IconAction
          icon={hidden ? Eye : EyeOff}
          staff
          label={hidden ? t("comments.unhide") : t("comments.hide")}
          onClick={() => onSetHidden(!hidden)}
        />
      )}

      {(isMine || isAdmin) && (
        <IconAction
          icon={Trash2}
          staff={isAdmin && !isMine}
          label={t("comments.delete")}
          onClick={() => setConfirming("delete")}
        />
      )}

      {!isMine && !isAdmin && (
        reported ? (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-subtle">
            <Flag size={10} aria-hidden="true" />
            {t("comments.reported")}
          </span>
        ) : (
          <IconAction icon={Flag} label={t("comments.report")} onClick={() => setConfirming("report")} />
        )
      )}
    </div>
  );
};

export default CommentRowActions;
