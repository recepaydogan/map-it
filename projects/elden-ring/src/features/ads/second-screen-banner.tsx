import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { IS_OVERWOLF } from "../../utils/platform";
import { useUiStore } from "../../store/ui-store";
import { getMonitorsList } from "../../overwolf-utils/window-manager";
import { useOnboarding, shouldAutoStartOnboarding } from "../onboarding/use-onboarding";
import { useWhatsNew } from "../whats-new/use-whats-new";

/**
 * The second-screen ask — shown once, to players who actually have a screen to
 * spare, on both the desktop window and the in-game overlay.
 *
 * Since the overlay went ad-free, the desktop window is the only place an ad
 * ever appears. So the app says that once and asks for the one thing that costs
 * the player nothing: keep the Atlas open on the other monitor while you play.
 *
 * Deliberately the quietest surface in the app — no icon, no button, no accent
 * colour, just two lines of chrome-toned text and an X. It is a thank-you, not a
 * call to action: there is nothing here to do, so anything that looked clickable
 * would be a lie.
 *
 * Every gate exists so the ask is TRUE when it is made:
 *  - Overwolf only — the website has no in-game overlay to be ad-free.
 *  - two or more monitors — on a single screen there is no spare screen.
 *  - nothing else is speaking — the tour, the release note and any full-window
 *    surface all outrank it.
 *
 * Dismissed once = dismissed everywhere, for good: the flag is in localStorage,
 * which every window shares, and a sibling window that is open at the time drops
 * it live off the `storage` event.
 */

/** localStorage flag, so the ask is made exactly once per install. */
const SEEN_KEY = "elden-ring-atlas:second-screen-ask-v1";

const hasSeen = (): boolean => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
};

const markSeen = (): void => {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode / disabled storage — worst case it asks once more */
  }
};

/**
 * How long the app waits before speaking up, counted from launch.
 *
 * A returning player knows where they are, so five seconds is enough for the map
 * to settle. A first-timer is meeting the app — tour, first look around — and a
 * support note dropped into that is noise, so theirs waits a full minute.
 */
const SETTLE_MS = { firstRun: 60_000, returning: 5_000 } as const;

const SecondScreenBanner = () => {
  const { t } = useTranslation();
  const activeOverlay = useUiStore((s) => s.activeOverlay);
  const tourActive = useOnboarding((s) => s.active);
  const whatsNewOpen = useWhatsNew((s) => s.open);

  const [dismissed, setDismissed] = useState(hasSeen);
  const [multiMonitor, setMultiMonitor] = useState(false);
  const [settled, setSettled] = useState(false);
  // Read at mount, before the tour can mark itself seen mid-session — otherwise a
  // first-timer who finishes the tour quickly would be reclassified as returning.
  const [firstRun] = useState(shouldAutoStartOnboarding);

  // How many screens the player has. Read once: a second monitor is part of the
  // desk, not something that appears mid-session, and a poll would buy nothing.
  useEffect(() => {
    if (!IS_OVERWOLF || dismissed) return;
    let alive = true;
    void getMonitorsList()
      .then((monitors) => {
        if (alive) setMultiMonitor(monitors.length >= 2);
      })
      .catch(() => {
        /* no monitor list, no ask — silence is the safe default here */
      });
    return () => {
      alive = false;
    };
  }, [dismissed]);

  // The clock runs from launch, not from "the screen is free": the delays above
  // are about how long the player has been here. Whatever is on screen when it
  // fires only decides WHEN it becomes visible (see `busy` below).
  useEffect(() => {
    if (dismissed) return;
    const timer = window.setTimeout(
      () => setSettled(true),
      firstRun ? SETTLE_MS.firstRun : SETTLE_MS.returning,
    );
    return () => window.clearTimeout(timer);
  }, [dismissed, firstRun]);

  // The other window dismissed it — drop it here too, without waiting for a reload.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === SEEN_KEY && event.newValue === "1") setDismissed(true);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const busy = tourActive || whatsNewOpen || activeOverlay !== null;
  if (!IS_OVERWOLF || dismissed || !multiMonitor || !settled || busy) return null;

  const dismiss = () => {
    markSeen();
    setDismissed(true);
  };

  return (
    // Bottom-right of the map region: the corner both map surfaces leave empty
    // (the performance nudge and key hints own bottom-centre, the map status
    // chips bottom-left) and, on the desktop window, the one nearest the ad rail.
    <div className="pointer-events-none absolute bottom-4 right-4 z-[1400] max-w-[calc(100%-2rem)]">
      <section
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex w-[320px] max-w-full items-start gap-2 rounded-[var(--radius-md)] border border-border bg-surface/90 py-2.5 pl-3.5 pr-2 shadow-xl shadow-black/40 backdrop-blur-xl animate-fade-up"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium leading-snug text-zinc-300">
            {t("secondScreen.title")}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
            {t("secondScreen.body")}
          </p>
        </div>

        {/* The only control. `data-ow-no-drag` because in the overlay this card
            sits on a window whose body is a drag handle. */}
        <button
          data-ow-no-drag
          type="button"
          onClick={dismiss}
          aria-label={t("common.close")}
          className="-mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-sm)] text-zinc-600 transition-colors hover:bg-white/8 hover:text-zinc-200 cursor-pointer"
        >
          <X size={13} aria-hidden="true" />
        </button>
      </section>
    </div>
  );
};

export default SecondScreenBanner;
