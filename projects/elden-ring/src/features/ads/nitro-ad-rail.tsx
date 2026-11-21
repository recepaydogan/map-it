import { useEffect, useRef, useState } from "react";
import { IS_WEB, useMediaQuery } from "../../utils/platform";

const SLOT_ID = "atlas-rail";

/**
 * Width the rail claims when it is showing an ad: the widest creative it accepts
 * (the 336x280 medium rectangle) plus the gutter either side.
 */
const AD_WIDTH = 336;
/** Column width when filled: creative + 12px gutter either side. */
const RAIL_WIDTH = AD_WIDTH + 24;
/** Published on :root so fixed-position ad UI (Nitro's bottom anchor) can stop
 *  at the map's edge instead of running on under the rail — see index.css. */
const RAIL_WIDTH_VAR = "--ad-rail-width";

/**
 * Below this the rail never renders at all. 1024 takes in landscape tablets and
 * every laptop; portrait tablets and phones keep the full map and are served by
 * the anchor instead. On a 1024 screen the map keeps ~700px beside the rail —
 * narrow, but still a map you can work in.
 */
export const RAIL_QUERY = `(min-width: 1024px)`;

/**
 * The web build's ad rail — the same right-hand column the Overwolf app fills
 * with the OwAds SDK, filled here with a Nitro placement instead.
 *
 * Why a rail rather than more units inside the map: it is permanently on screen,
 * so it is seen, and it is requested once per session rather than once per panel
 * open. The marker-panel unit this replaces was the opposite of both — it sat
 * below the fold and re-requested on every marker click, and that volume of
 * unviewed impressions prices down every other unit on the site.
 *
 * `outstream: "auto"` is what makes one slot enough: video demand fills it as a
 * video when there is any, and a display creative fills it when there is not, so
 * the column is never given up for an empty box.
 *
 * The column collapses to nothing unless an ad actually lands in it — before
 * approval, for ad-blocked readers, and on a no-fill auction, the map simply
 * keeps the full width rather than showing a bordered grey gutter.
 */
const NitroAdRail = () => {
  const wideEnough = useMediaQuery(RAIL_QUERY);
  const slotRef = useRef<HTMLDivElement>(null);
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    if (!IS_WEB || !wideEnough) return;
    const slot = slotRef.current;
    if (!slot) return;

    // A 300x600 needs the room: header + gutters + 600 + the anchor's ~90 is
    // ~760px, and a landscape tablet's browser viewport is ~700. On short
    // viewports the tall size is left out so the creative that arrives fits
    // above the anchor instead of running under it. Read once at mount — a
    // rotate mid-session keeps the size set it started with.
    const tallEnough = window.innerHeight >= 800;

    window.nitroAds?.createAd(SLOT_ID, {
      // The panel's cap: nothing taller loads, so the column never has to grow.
      height: tallEnough ? 600 : 280,
      // Tallest first: a 300x600 half page is the rail's best earner, and the
      // shorter units remain eligible under the same cap.
      sizes: tallEnough
        ? [
            [300, 600],
            [336, 280],
            [300, 250],
          ]
        : [
            [336, 280],
            [300, 250],
          ],
      // Video when there is video demand, display when there is not.
      outstream: "auto",
      // The rail is always on screen, so a refresh is the difference between one
      // impression and a session's worth. Visible-only is Nitro's default and
      // stays on: a refresh nobody can see is the kind of impression that drags
      // the site's viewability score down.
      refreshVisibleOnly: true,
      // Nitro's own guard, so it does not render into a column React has already
      // decided not to show (e.g. a window resized narrow after load).
      mediaQuery: RAIL_QUERY,
      // NOT delayLoading (the panel's default): that gates the first request on
      // the slot scrolling into view, and this slot is zero-height until it is
      // filled — it would wait for a scroll that can never happen.
      report: { enabled: true, icon: true, wording: "Report Ad", position: "bottom-right" },
    });

    /* Two observers because a fill lands in two beats: Nitro inserts the frame
       (childList), then the creative sizes it (resize). The 50px floor ignores
       the zero-height tracking pixels left behind when there is no demand. */
    const measure = () => {
      setFilled(slot.childElementCount > 0 && slot.getBoundingClientRect().height > 50);
    };
    const mutation = new MutationObserver(measure);
    mutation.observe(slot, { childList: true, subtree: true });
    const resize = new ResizeObserver(measure);
    resize.observe(slot);
    measure();

    return () => {
      mutation.disconnect();
      resize.disconnect();
    };
  }, [wideEnough]);

  // The anchor is Nitro's own fixed, full-width element; the only handle we have
  // on it is CSS, so the rail's width goes out as a root variable the moment it
  // is actually showing something (and back to 0 when it is not).
  useEffect(() => {
    if (!IS_WEB) return;
    const root = document.documentElement;
    root.style.setProperty(RAIL_WIDTH_VAR, `${filled && wideEnough ? RAIL_WIDTH : 0}px`);
    return () => root.style.setProperty(RAIL_WIDTH_VAR, "0px");
  }, [filled, wideEnough]);

  if (!IS_WEB || !wideEnough) return null;

  return (
    <div
      className={
        filled
          ? "flex shrink-0 items-start justify-center border-l border-border bg-background px-3 py-3 pb-[calc(0.75rem+var(--anchor-ad-height))] min-[1330px]:pb-3"
          : undefined
      }
      style={filled ? { width: RAIL_WIDTH } : undefined}
    >
      {/* Stays mounted while empty: the slot has to exist in the DOM for Nitro to
          fill it, so it is the WRAPPER that carries the width and border. */}
      <div id={SLOT_ID} ref={slotRef} />
    </div>
  );
};

export default NitroAdRail;
