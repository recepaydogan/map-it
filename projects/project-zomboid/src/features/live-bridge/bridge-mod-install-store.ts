import { useEffect, useState } from "react";

export const BRIDGE_MOD_INSTALL_STORAGE_KEY = "pzim:bridge-mod-install";
const BRIDGE_MOD_INSTALL_EVENT = "pzim:bridge-mod-install-changed";

/** "awaiting_game" — the player has never launched Project Zomboid, so the
 *  Zomboid user folder the mod installs into does not exist yet. Nothing is
 *  broken; the install completes on its own once the game has run once. */
export type BridgeModInstallState =
  | "installed"
  | "restart_required"
  | "failed"
  | "awaiting_game";

export interface BridgeModInstallStatus {
  state: BridgeModInstallState;
  targetPath?: string;
  bridgeActive?: boolean;
  /** The app ticked the mod on in the player's mod lists on this pass. */
  autoActivated?: boolean;
  error?: string;
  updatedAt: number;
}

export const resolveSuccessfulBridgeModInstallState = ({
  previousState,
  gameRunning,
  filesChanged,
  bridgeActive,
}: {
  previousState?: BridgeModInstallState;
  gameRunning: boolean;
  filesChanged: boolean;
  bridgeActive: boolean;
}): BridgeModInstallState => {
  // Once the game is closed, an active entry in the authoritative default mod
  // list means installation and automatic activation are both complete. Do not
  // keep a stale restart notice around while waiting for a live-position fix.
  if (!gameRunning && bridgeActive) return "installed";

  return previousState === "restart_required"
    || !bridgeActive
    || filesChanged
    ? "restart_required"
    : "installed";
};

export const readBridgeModInstallStatus = (): BridgeModInstallStatus | null => {
  try {
    const value = localStorage.getItem(BRIDGE_MOD_INSTALL_STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<BridgeModInstallStatus>;
    const states: BridgeModInstallState[] = [
      "installed",
      "restart_required",
      "failed",
      "awaiting_game",
    ];
    if (!states.includes(parsed.state as BridgeModInstallState) || !Number.isFinite(parsed.updatedAt)) {
      return null;
    }
    return parsed as BridgeModInstallStatus;
  } catch {
    return null;
  }
};

export const publishBridgeModInstallStatus = (status: BridgeModInstallStatus) => {
  localStorage.setItem(BRIDGE_MOD_INSTALL_STORAGE_KEY, JSON.stringify(status));
  window.dispatchEvent(new Event(BRIDGE_MOD_INSTALL_EVENT));
};

/** A fresh position can only come from Bridge Lua loaded by the current game
 * session. It is stronger evidence than either the installed files or the mod
 * list, so it clears restart/activation notices in every app window. */
export const markBridgeModReady = () => {
  const current = readBridgeModInstallStatus();
  if (!current
    || (current.state === "installed" && current.bridgeActive === true)) return;
  publishBridgeModInstallStatus({
    ...current,
    state: "installed",
    bridgeActive: true,
    updatedAt: Date.now(),
  });
};

export const useBridgeModInstallStatus = () => {
  const [status, setStatus] = useState(readBridgeModInstallStatus);

  useEffect(() => {
    const refresh = () => setStatus(readBridgeModInstallStatus());
    const onStorage = (event: StorageEvent) => {
      if (event.key !== BRIDGE_MOD_INSTALL_STORAGE_KEY && event.key !== null) return;
      refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(BRIDGE_MOD_INSTALL_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(BRIDGE_MOD_INSTALL_EVENT, refresh);
    };
  }, []);

  return status;
};
