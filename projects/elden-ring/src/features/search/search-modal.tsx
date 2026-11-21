import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface SearchModalProps {
  /** The input row. Each search owns its own field wiring; this is just a frame. */
  field: ReactNode;
  /** Result rows. Rendered inside the scroll area. */
  children: ReactNode;
  /** False renders `emptyMessage` instead of the children. */
  hasResults: boolean;
  emptyMessage: string;
  onClose: () => void;
}

/**
 * The phone shell for map search: a centred modal over a dimmed map.
 *
 * On a phone an inline search field can't work. It either squeezes the rest of
 * the map toolbar onto a second row or shrinks to a stub, and its results have
 * nowhere to hang — a popover anchored to a 240px field pinned at the screen
 * edge. The modal takes the whole screen instead: a full-width input and a
 * result list with thumb-sized rows.
 *
 * Shared by both map surfaces (the Elden Ring map's search and the live map's
 * global SearchBox) so the two can't drift into two different phone searches.
 * Portalled to `document.body`: the map's floating column is a z-1350 stacking
 * context whose insets would otherwise clip this.
 */
const SearchModal = ({ field, children, hasResults, emptyMessage, onClose }: SearchModalProps) => {
  const { t } = useTranslation();

  // The modal is the outermost open thing while it's up, so it owns Escape —
  // swallowed in the capture phase, the app-wide convention, so the map's own
  // handlers (close the rail, clear the selection) don't also fire underneath.
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

  return createPortal(
    <div className="fixed inset-0 z-[1450] flex items-center justify-center p-3">
      <button
        type="button"
        onClick={onClose}
        aria-label={t("search.close")}
        className="absolute inset-0 h-full w-full cursor-default bg-black/65 backdrop-blur-[2px] animate-fade-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("search.open")}
        className="relative flex max-h-[min(32rem,80dvh)] w-full max-w-md flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-2xl shadow-black/60 animate-fade-in"
      >
        <div className="shrink-0 border-b border-border p-3">{field}</div>
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {hasResults ? (
            children
          ) : (
            <p className="px-6 py-10 text-center text-[13px] leading-relaxed text-muted">
              {emptyMessage}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SearchModal;
