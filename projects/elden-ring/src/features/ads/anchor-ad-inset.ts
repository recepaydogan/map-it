import { IS_WEB } from "../../utils/platform";

/**
 * Publishes the height of Nitro's bottom anchor ad as `--anchor-ad-height` on
 * the document root, so the map's floating UI can stop above it instead of
 * sliding underneath.
 *
 * The anchor is `position: fixed` and owns the bottom strip of the viewport for
 * as long as it is on screen. Anything the app bottom-docks — the detail panel's
 * pinned Community Notes button, the mobile bottom sheets — would otherwise be
 * covered by it, with no way for the reader to reach what is behind. Reserving
 * the space keeps every panel's `max-height` honest.
 *
 * Measured rather than hardcoded: the anchor's height depends on the creative
 * that fills it (a 50px mobile banner and a 90px leaderboard both occur), it is
 * zero before any ad arrives, and it drops back to zero the moment the reader
 * dismisses the ad — a constant would leave a dead strip in all three cases.
 *
 * Overwolf never calls this: the desktop app has no Nitro anchor, and its native
 * ad rail is already carved out of the layout by MapShell.
 */
const ROOT_VAR = "--anchor-ad-height";
/** Nitro uses the placement id as the anchor container's HTML id. */
const ANCHOR_ID = "atlas-anchor";

export const startAnchorAdInset = (): (() => void) => {
  if (!IS_WEB || typeof document === "undefined") return () => {};

  const root = document.documentElement;
  let resize: ResizeObserver | null = null;
  let anchor: HTMLElement | null = null;

  const publish = () => {
    // getClientRects() is empty for a display:none anchor (dismissed), which
    // still keeps its box in the DOM. NOT offsetParent: that is null for every
    // position:fixed element — the anchor included — so it read as "hidden"
    // while 93px of ad sat on top of the zoom controls.
    const height =
      anchor && anchor.getClientRects().length > 0 ? Math.round(anchor.getBoundingClientRect().height) : 0;
    root.style.setProperty(ROOT_VAR, `${height}px`);
  };

  const attach = () => {
    const found = document.getElementById(ANCHOR_ID);
    if (!found || found === anchor) return;
    anchor = found;
    resize?.disconnect();
    resize = new ResizeObserver(publish);
    resize.observe(anchor);
    publish();
  };

  // The anchor is injected long after mount (async ad script), can be replaced
  // on refresh, and disappears when dismissed — so watch the tree for its whole
  // lifetime rather than looking once.
  const mutation = new MutationObserver(() => {
    if (anchor && !anchor.isConnected) {
      anchor = null;
      resize?.disconnect();
      resize = null;
      publish();
    }
    attach();
  });
  mutation.observe(document.body, { childList: true, subtree: true });
  attach();

  return () => {
    mutation.disconnect();
    resize?.disconnect();
    root.style.removeProperty(ROOT_VAR);
  };
};
