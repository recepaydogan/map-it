import { useEffect, type RefObject } from "react";

/** Closes a floating control after an outside pointer event or Escape. */
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
  }, [deferTo, onDismiss, open, ref]);
};
