import { MessageSquare, X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../state/use-auth";
import { useSupportStore } from "../../store/support-store";
import { useUiStore } from "../../store/ui-store";
import CommentList from "./comment-list";
import { useMarkerComments } from "./use-marker-comments";

interface MarkerCommentsPanelProps {
  markerKey: string;
  /** Whose notes these are — the panel stands alone, so it has to say. */
  markerName: string;
  isBoss?: boolean;
  /** The parent's own panel chrome, so this column is identical to the others. */
  className: string;
  onClose: () => void;
}

/**
 * A marker's community notes, as their own column beside the detail panel.
 *
 * Its own column rather than a section inside the panel because notes are read
 * ALONGSIDE what they are about: the fight's damage types, the drops, the
 * portrait. Folded into the panel they would push all of that off screen exactly
 * when the reader wants both. This is the same companion-column pattern a
 * drilled item already uses, and it shares that slot.
 */
const MarkerCommentsPanel = ({
  markerKey,
  markerName,
  isBoss = false,
  className,
  onClose,
}: MarkerCommentsPanelProps) => {
  const { t } = useTranslation();
  const { status, user } = useAuth();
  const openOverlay = useUiStore((state) => state.openOverlay);
  // Staff membership is already resolved once per window for the support inbox;
  // asking the server a second time would be the same answer twice. It only
  // decides which buttons render — every moderation call is re-checked server
  // side, so a client that lies about it gains nothing.
  const isAdmin = useSupportStore((state) => state.isAdmin);
  const state = useMarkerComments(markerKey, user?.id ?? null);

  // Escape closes the notes before it closes anything else. Registered here (not
  // in the two host panels) so both get the same behaviour, and on `document` in
  // the bubble phase so the comment editor's own Escape — which cancels a
  // half-written note — stops it from ever reaching this.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const { total } = state;

  return (
    <aside
      data-testid="marker-comments-panel"
      aria-label={t("comments.panelLabel", { marker: markerName })}
      className={className}
    >
      <header className="flex shrink-0 items-start gap-2 border-b border-border px-4 py-3">
        <MessageSquare size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-semibold text-white">
            {isBoss ? t("comments.titleBoss") : t("comments.title")}
          </h2>
          <p className="truncate text-[11px] text-subtle">{markerName}</p>
        </div>
        {(total ?? 0) > 0 && (
          <span className="mt-0.5 rounded-[var(--radius-full)] bg-accent/15 px-1.5 py-px text-[10px] font-bold tabular-nums text-accent">
            {total}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("comments.close")}
          title={t("comments.close")}
          className="-mr-1 cursor-pointer rounded-[var(--radius-sm)] p-1 text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-white"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <CommentList
          state={state}
          canWrite={status === "signed-in"}
          // Until the session is known, the write slot shows NOTHING rather than
          // guessing: guessing signed-out flashes a sign-in prompt at someone who
          // is already signed in, and guessing signed-in offers a box whose post
          // the server would refuse.
          authPending={status === "loading"}
          isAdmin={isAdmin}
          onRequireAuth={() => openOverlay("account")}
          placeholder={isBoss ? t("comments.placeholderBoss") : t("comments.placeholder")}
        />
      </div>
    </aside>
  );
};

export default MarkerCommentsPanel;
