import { useEffect, type RefObject } from "react";

/**
 * Closes a floating map control when the pointer lands outside it or Escape is
 * pressed. `deferTo` is a selector for a popover nested inside the control: while
 * one is mounted, Escape belongs to it, so a single keypress never collapses two
 * layers at once.
 *
 * `onDismiss` is a dependency, so pass a stable callback.
 */
export const useDismissable = (
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  deferTo?: string,
) => {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (deferTo && document.querySelector(deferTo)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onDismiss();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, ref, onDismiss, deferTo]);
};
