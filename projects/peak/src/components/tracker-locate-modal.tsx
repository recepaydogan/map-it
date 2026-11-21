import { FolderSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOnboardingActive } from "../features/onboarding/use-onboarding";
import { pickPeakTrackingDirectory } from "../overwolf/tracking-folder-picker";
import { usePeakSession } from "../state/peak-session-store";
import { track } from "../utils/analytics/analytics";
import { EVENTS } from "../utils/analytics/events";

/** Permanent opt-out of the locate modal — "I don't want live position
 *  tracking". Discovery keeps running in the background, so a later game
 *  launch still repairs the install silently. */
const DISMISSED_KEY = "peak-map:tracker-locate-dismissed";

/** How long the bridge must stay unlocatable before the modal interrupts.
 *  Long enough that a first launch gets its bearings (and the onboarding
 *  tour, which gates this timer entirely, is never talked over). */
const LOCATE_MODAL_DELAY_MS = 12_000;

const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Automatic discovery has run dry: PEAK is in neither default Steam path and
 * no running game has revealed its folder ("unavailable" — distinct from
 * "failed", where the folder is known and a picker would not help). Live
 * tracking simply does not work until the player either points us at the
 * install or opts out — so this asks, once the onboarding tour is done and
 * the app has had a moment.
 */
interface TrackerLocateModalProps {
  manualOpen?: boolean;
  onManualClose?: () => void;
}

const TrackerLocateModal = ({
  manualOpen = false,
  onManualClose,
}: TrackerLocateModalProps) => {
  const { t } = useTranslation();
  const session = usePeakSession();
  const onboardingActive = useOnboardingActive();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [selectionInvalid, setSelectionInvalid] = useState(false);
  const [picking, setPicking] = useState(false);
  const [ready, setReady] = useState(false);

  const armed = session.trackingStatus === "unavailable" && !onboardingActive && !dismissed;
  // Disarming resets the countdown's result, so re-arming (the tour replayed,
  // or a repeat failure) always waits the full delay again. Render-time reset
  // instead of an effect: the stale `ready` must never paint.
  const [prevArmed, setPrevArmed] = useState(armed);
  if (prevArmed !== armed) {
    setPrevArmed(armed);
    if (!armed) setReady(false);
  }

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setReady(true), LOCATE_MODAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [armed]);

  const automaticOpen = armed && ready;
  if (!manualOpen && !automaticOpen) return null;

  const dismissForever = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Storage unavailable — session-only dismissal still applies.
    }
    setDismissed(true);
    track(EVENTS.TRACKER_FOLDER_PICKER_COMPLETED, { result: "opted_out" });
  };

  const findFolder = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const result = await pickPeakTrackingDirectory();
      setSelectionInvalid(result === "invalid");
      if (result === "selected" && manualOpen) onManualClose?.();
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tracker-locate-title"
        className="w-full max-w-sm rounded-[var(--radius-lg)] border border-border-strong bg-surface-elevated p-5 shadow-[0_18px_50px_rgba(0,0,0,.65)]"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft">
            <FolderSearch size={18} className="text-accent" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="tracker-locate-title" className="text-sm font-semibold text-primary">
              {t("tracking.locate.title")}
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              {t("tracking.locate.body")}
            </p>
          </div>
        </div>
        {selectionInvalid && (
          <p role="alert" className="mt-3 rounded-[var(--radius-md)] border border-danger/35 bg-danger/10 px-3 py-2 text-xs leading-relaxed text-primary">
            {t("tracking.locate.invalid")}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void findFolder()}
            disabled={picking}
            className="h-9 cursor-pointer rounded-[var(--radius-md)] bg-accent px-3 text-xs font-semibold text-background transition-colors hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("tracking.locate.find")}
          </button>
          <button
            type="button"
            onClick={manualOpen ? onManualClose : dismissForever}
            className="h-9 cursor-pointer rounded-[var(--radius-md)] px-3 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-primary"
          >
            {t(manualOpen ? "tracking.locate.close" : "tracking.locate.dismiss")}
          </button>
        </div>
      </section>
    </div>
  );
};

export default TrackerLocateModal;
