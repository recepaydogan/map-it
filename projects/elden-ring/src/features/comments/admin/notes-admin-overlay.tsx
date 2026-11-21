import { Loader2, MessagesSquare, X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { areCommentsAvailable } from "../../../services/comments/comments-service";
import { useNotesAdminStore } from "../../../store/notes-admin-store";
import { useUiStore } from "../../../store/ui-store";
import AdminNoteFilters from "./admin-note-filters";
import AdminNoteRow from "./admin-note-row";

/**
 * The moderation queue: every community note anyone has written, worst first.
 *
 * It is a FEED, not a map. The moderator's job is per-note, not per-marker —
 * they want to know what was written, and the marker is a label on the row, not
 * a place to travel to first. Ordering is the server's (reported, then unread,
 * then newest), so the top of the list is always the next thing worth reading
 * and no filter has to be touched to find it.
 *
 * Shares the support overlay's shell: full-bleed inside the map region, so it
 * never covers the Overwolf ad rail.
 */
const NotesAdminOverlay = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const openMapMarker = useUiStore((state) => state.openMapMarker);
  const { counts, notes, total, filter, loading, busy } = useNotesAdminStore();
  const load = useNotesAdminStore((state) => state.load);
  const loadMore = useNotesAdminStore((state) => state.loadMore);
  const refreshCounts = useNotesAdminStore((state) => state.refreshCounts);
  const markReviewed = useNotesAdminStore((state) => state.markReviewed);
  const setHidden = useNotesAdminStore((state) => state.setHidden);
  const remove = useNotesAdminStore((state) => state.remove);

  // A fresh open should show the truth, not the last poll's copy.
  useEffect(() => {
    void load();
    void refreshCounts();
  }, [load, refreshCounts]);

  // ESC closes this first. Capture + stopImmediatePropagation so the app-wide
  // ESC handler (selection / filter rail) doesn't also fire underneath.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-[1500] flex flex-col bg-background animate-fade-in">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
          <MessagesSquare size={18} className="text-accent" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold tracking-tight text-white">
            {t("notesAdmin.title")}
          </h1>
          <p className="mt-0.5 text-[12px] text-muted">{t("notesAdmin.subtitle")}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <AdminNoteFilters
            filter={filter}
            reported={counts.reported}
            unreviewed={counts.unreviewed}
            onChange={(next) => void load(next)}
          />
          <button
            onClick={onClose}
            aria-label={t("notesAdmin.close")}
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/8 hover:text-white"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          {!areCommentsAvailable() ? (
            <p className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-[13px] text-subtle">
              {t("comments.unavailable")}
            </p>
          ) : loading && notes.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-10 text-[12px] text-subtle">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              {t("notesAdmin.loading")}
            </p>
          ) : notes.length === 0 ? (
            <p className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-[13px] text-subtle">
              {t("notesAdmin.empty")}
            </p>
          ) : (
            <>
              {notes.map((note) => (
                <AdminNoteRow
                  key={note.id}
                  note={note}
                  busy={busy}
                  onToggleReviewed={() => void markReviewed(note.id, !note.reviewed)}
                  onSetHidden={(hidden) => void setHidden(note.id, hidden)}
                  onDelete={() => void remove(note.id)}
                  onShowOnMap={(markerId) => {
                    openMapMarker(markerId);
                    onClose();
                  }}
                />
              ))}

              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[11px] tabular-nums text-subtle">
                  {t("notesAdmin.showing", { shown: notes.length, total })}
                </span>
                {notes.length < total && (
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    className="cursor-pointer text-[12px] font-semibold text-accent transition-colors hover:text-white"
                  >
                    {t("notesAdmin.loadMore")}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotesAdminOverlay;
