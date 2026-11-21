import { useEffect, useState } from "react";
import { useMediaQuery } from "../../../utils/platform";

/** Matches the `lg:` breakpoint the desktop title-bar strip comes back at. */
const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * Open/closed state for the phone navigation sheet, plus the two ways it closes
 * without a tap:
 *
 *  • The viewport grows past the drawer's breakpoint (rotation, a resized desktop
 *    browser). The full title bar is back, so a sheet still hanging over it would
 *    be orphaned chrome.
 *  • Escape — swallowed in the CAPTURE phase, the app-wide convention for "the
 *    outermost open thing owns this key", so the map's own Escape handlers don't
 *    also fire underneath.
 */
export const useMobileNav = () => {
  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  // Render-phase state adjustment (React's documented pattern for "reset state
  // when something it derives from changes"), not an effect: the close lands in
  // the same commit as the breakpoint change, so the drawer never paints for a
  // frame over a title bar that has already come back.
  if (open && isDesktop) setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  return { open, setOpen };
};
