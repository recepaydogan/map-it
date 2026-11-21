import { Eye, EyeOff, Flag, MapPin, ShieldAlert, Trash2 } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import ActionButton from "../../../components/action-button";
import { cn } from "../../../lib/cn";
import type { AdminNote } from "../../../services/comments/comments-service";
import { relativeTime } from "../comment-time";
import { commentTargetFor } from "../marker-comment-name";

interface AdminNoteRowProps {
  note: AdminNote;
  busy: boolean;
  onToggleReviewed: () => void;
  onSetHidden: (hidden: boolean) => void;
  onDelete: () => void;
  onShowOnMap: (markerId: string) => void;
}

/**
 * One note in the moderation queue.
 *
 * The whole row is the read/unread control, because reading is what this panel
 * is FOR and it is the action that happens most: putting it behind its own small
 * button would mean aiming at a 13px target once per note, all day. The
 * destructive controls sit inside it and stop the click from reaching the row,
 * so acting on a note never silently changes its read state as well.
 *
 * State is carried by the frame rather than by badges wherever possible: a
 * reported note is red-framed, an unread one keeps a bright left rule, a read
 * one fades. The moderator can see what is left to do without reading a word.
 */
const AdminNoteRow = ({
  note,
  busy,
  onToggleReviewed,
  onSetHidden,
  onDelete,
  onShowOnMap,
}: AdminNoteRowProps) => {
  const { t, i18n } = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const target = commentTargetFor(note.markerKey);

  /** Keep a control's click off the row's own read/unread toggle. */
  const isolate = (run: () => void) => (event: MouseEvent) => {
    event.stopPropagation();
    run();
  };

  return (
    <article
      role="button"
      tabIndex={0}
      aria-pressed={note.reviewed}
      onClick={onToggleReviewed}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggleReviewed();
        }
      }}
      className={cn(
        "cursor-pointer rounded-[var(--radius-md)] border border-l-2 px-4 py-3 transition-colors",
        note.reportCount > 0
          ? "border-rose-400/40 border-l-rose-400 bg-rose-500/[0.06] hover:bg-rose-500/[0.09]"
          : note.reviewed
            ? "border-border border-l-white/10 bg-white/[0.015] hover:bg-white/[0.03]"
            : "border-border border-l-accent bg-white/[0.03] hover:bg-white/[0.05]",
        // Read notes step back without disappearing — the queue still shows the
        // whole history, just not competing with what is left to do.
        note.reviewed && note.reportCount === 0 && "opacity-55 hover:opacity-100",
      )}
    >
      <header className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="truncate text-[13px] font-semibold text-white">
          {target.name ?? t("notesAdmin.unknownMarker")}
        </span>
        <span className="text-[10px] tabular-nums text-subtle">
          {relativeTime(note.createdAt, i18n.language)}
        </span>

        {note.reportCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-[var(--radius-full)] bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-200">
            <Flag size={10} aria-hidden="true" />
            {t("notesAdmin.reports", { count: note.reportCount })}
          </span>
        )}
        {note.hidden && (
          <span className="inline-flex items-center gap-1 rounded-[var(--radius-full)] bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-200">
            <ShieldAlert size={10} aria-hidden="true" />
            {t("notesAdmin.hiddenTag")}
          </span>
        )}
        {!note.reviewed && (
          <span className="ml-auto text-[9px] font-bold uppercase tracking-[0.12em] text-accent">
            {t("notesAdmin.unread")}
          </span>
        )}
      </header>

      {/* Never blurred here. A spoiler tag protects players from the story; it
          must not stand between a moderator and what they are moderating. */}
      <p className="whitespace-pre-wrap text-pretty text-[13px] leading-relaxed text-zinc-200">
        {note.body}
      </p>

      <footer className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[11px] text-subtle">
          {note.authorName}
          {" · "}
          <span className="tabular-nums">
            +{note.likeCount} / −{note.dislikeCount}
          </span>
          {note.isSpoiler && ` · ${t("comments.spoiler")}`}
          {note.editedAt && ` · ${t("comments.edited")}`}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {confirmDelete ? (
            <>
              <span className="text-[11px] text-zinc-300">{t("notesAdmin.deleteConfirm")}</span>
              <ActionButton
                className="px-2 py-1 text-[11px]"
                onClick={isolate(() => setConfirmDelete(false))}
              >
                {t("notesAdmin.cancel")}
              </ActionButton>
              <ActionButton
                variant="danger"
                className="px-2 py-1 text-[11px]"
                disabled={busy}
                onClick={isolate(() => {
                  setConfirmDelete(false);
                  onDelete();
                })}
              >
                {t("notesAdmin.delete")}
              </ActionButton>
            </>
          ) : (
            <>
              {target.markerId && (
                <ActionButton
                  className="px-2 py-1 text-[11px]"
                  onClick={isolate(() => onShowOnMap(target.markerId!))}
                >
                  <MapPin size={11} aria-hidden="true" />
                  {t("notesAdmin.showOnMap")}
                </ActionButton>
              )}
              <ActionButton
                className="px-2 py-1 text-[11px]"
                disabled={busy}
                onClick={isolate(() => onSetHidden(!note.hidden))}
              >
                {note.hidden ? (
                  <Eye size={11} aria-hidden="true" />
                ) : (
                  <EyeOff size={11} aria-hidden="true" />
                )}
                {note.hidden ? t("notesAdmin.unhide") : t("notesAdmin.hide")}
              </ActionButton>
              <ActionButton
                variant="danger"
                className="px-2 py-1 text-[11px]"
                disabled={busy}
                onClick={isolate(() => setConfirmDelete(true))}
              >
                <Trash2 size={11} aria-hidden="true" />
                {t("notesAdmin.delete")}
              </ActionButton>
            </>
          )}
        </div>
      </footer>
    </article>
  );
};

export default AdminNoteRow;
