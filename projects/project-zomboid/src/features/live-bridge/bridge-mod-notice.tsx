import { FolderSearch, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { useOnboardingActive } from "../onboarding/use-onboarding";
import type { BridgeModInstallState } from "./bridge-mod-install-store";
import { useBridgeModInstallStatus } from "./bridge-mod-install-store";
import { locateZomboidRoot } from "./locate-zomboid-root";

/** Permanent opt-out of the locate modal — "I don't want live position
 *  tracking". The map-library banner keeps offering the folder picker, so the
 *  choice is reversible without a settings entry. */
const LOCATE_MODAL_DISMISSED_KEY = "pzim:bridge-mod-locate-dismissed";

const readLocateModalDismissed = () => {
  try {
    return localStorage.getItem(LOCATE_MODAL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Blocking install failures (the Zomboid folder was never found, or the write
 * itself failed) get a modal: live tracking simply does not work until the
 * player either points us at the folder or opts out. The picker selection is
 * validated and retried in place, so a `-cachedir` player recovers without
 * restarting anything.
 */
const BridgeModLocateModal = () => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(readLocateModalDismissed);
  const [selectionInvalid, setSelectionInvalid] = useState(false);
  const [picking, setPicking] = useState(false);

  if (dismissed) return null;

  const dismissForever = () => {
    try {
      localStorage.setItem(LOCATE_MODAL_DISMISSED_KEY, "1");
    } catch { /* storage unavailable — session-only dismissal still applies */ }
    setDismissed(true);
  };

  const findFolder = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const result = await locateZomboidRoot("install_modal");
      // "selected" repairs the install status, which unmounts this modal via
      // the status hook — no local success state needed.
      if (result === "invalid") setSelectionInvalid(true);
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bridge-locate-title"
        className="w-full max-w-sm rounded-[var(--radius-md)] border border-white/10 bg-surface p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-warning/15">
            <FolderSearch size={18} className="text-warning" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="bridge-locate-title" className="text-sm font-semibold text-white">
              {t("overlay.bridge.locateTitle")}
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">
              {t("overlay.bridge.locateBody")}
            </p>
          </div>
        </div>
        {selectionInvalid && (
          <p role="alert" className="mt-3 rounded-[var(--radius-sm)] border border-warning/35 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-zinc-200">
            {t("overlay.bridge.locateInvalid")}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void findFolder()}
            disabled={picking}
            className="h-9 cursor-pointer rounded-[var(--radius-sm)] bg-accent px-3 text-xs font-semibold text-white transition-colors hover:bg-accent/85 disabled:cursor-default disabled:opacity-60"
          >
            {t("overlay.bridge.locateFind")}
          </button>
          <button
            type="button"
            onClick={dismissForever}
            className="h-9 cursor-pointer rounded-[var(--radius-sm)] px-3 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
          >
            {t("overlay.bridge.locateDismiss")}
          </button>
        </div>
      </div>
    </div>
  );
};

/** How long a blocked install must stay blocked before the modal interrupts.
 *  Long enough that a first launch gets its bearings (and the onboarding tour,
 *  which gates this timer entirely, is never talked over). */
const LOCATE_MODAL_DELAY_MS = 12_000;

const BridgeModNotice = ({ compact = false }: { compact?: boolean }) => {
  const { t } = useTranslation();
  const installStatus = useBridgeModInstallStatus();
  const onboardingActive = useOnboardingActive();
  const [dismissedState, setDismissedState] = useState<BridgeModInstallState | null>(null);
  const [locateModalReady, setLocateModalReady] = useState(false);
  const installationBlocked = installStatus?.state === "failed"
    || installStatus?.state === "awaiting_game";
  const restartRequired = installStatus?.state === "restart_required"
    || (installStatus?.state === "installed" && installStatus.bridgeActive === false);

  const locateModalArmed = installationBlocked && !onboardingActive && !compact;
  // Disarming resets the countdown's result, so re-arming (the tour replayed,
  // or a repeat failure) always waits the full delay again. Render-time reset
  // instead of an effect: the stale `ready` must never paint.
  const [prevArmed, setPrevArmed] = useState(locateModalArmed);
  if (prevArmed !== locateModalArmed) {
    setPrevArmed(locateModalArmed);
    if (!locateModalArmed) setLocateModalReady(false);
  }

  useEffect(() => {
    if (!locateModalArmed) return;
    const timer = window.setTimeout(
      () => setLocateModalReady(true),
      LOCATE_MODAL_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [locateModalArmed]);

  // The modal has no compact form — the in-game minimap is no place for a
  // folder picker, and the desktop window shows it on the next open anyway.
  if (installationBlocked) {
    return !compact && locateModalReady ? <BridgeModLocateModal /> : null;
  }

  const dismiss = () => setDismissedState(installStatus?.state ?? null);
  const sessionDismissed = installStatus?.state === dismissedState;

  if (sessionDismissed || !restartRequired) return null;

  return (
    <div
      role="status"
      className={cn(
        "absolute z-50 flex gap-2.5 rounded-[var(--radius-md)] border border-white/10 bg-surface/95 px-3 py-2.5 text-xs text-zinc-200 shadow-lg backdrop-blur-md",
        compact
          ? "bottom-[3.75rem] left-2 right-2 items-start"
          : "bottom-5 left-1/2 max-w-[calc(100%_-_2rem)] -translate-x-1/2 items-center",
      )}
    >
      <TriangleAlert size={16} className="shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-medium text-white">
          {t("overlay.bridge.restartRequiredBody")}
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="ml-1 shrink-0 cursor-pointer rounded-[var(--radius-sm)] bg-white/10 px-2.5 py-1.5 font-semibold text-white transition-colors hover:bg-white/15"
      >
        {t("overlay.bridge.gotIt")}
      </button>
    </div>
  );
};

export default BridgeModNotice;
