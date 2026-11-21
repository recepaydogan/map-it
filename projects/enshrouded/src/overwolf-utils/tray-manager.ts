import { GAME_CONFIG } from "../game-config";
import { closeWindow, revealMainWindowToFront } from "./window-manager";

const SHOW_APP = "show_app";
const EXIT_APP = "exit_app";

const trayApi = () => (
  overwolf as unknown as {
    os?: {
      tray?: {
        setMenu: (
          menu: { menu_items: { label: string; id: string }[] },
          callback: (result: { success: boolean; error?: string }) => void,
        ) => void;
        destroy?: (callback: (result: { success: boolean; error?: string }) => void) => void;
        onTrayIconClicked?: { addListener: (listener: () => void) => void };
        onTrayIconDoubleClicked?: { addListener: (listener: () => void) => void };
        onMenuItemClicked?: {
          addListener: (listener: (event: { item: string }) => void) => void;
        };
      };
    };
  }
).os?.tray;

const showMainWindow = () => void revealMainWindowToFront("main");

/** Closing the background window last is what actually ends the app. */
const exitApp = () => {
  void Promise.allSettled([
    closeWindow("main"),
    closeWindow("in_game"),
    closeWindow("overlay_map"),
  ]).then(() => closeWindow("background"));
};

/** The system-tray icon (manifest `meta.tray_icon`) and its menu. */
export const initTray = () => {
  if (typeof overwolf === "undefined") return;
  const tray = trayApi();
  if (!tray) return;
  tray.setMenu(
    {
      menu_items: [
        { label: `Show ${GAME_CONFIG.appName}`, id: SHOW_APP },
        { label: "-", id: "separator" },
        { label: "Exit", id: EXIT_APP },
      ],
    },
    (result) => {
      if (!result.success) console.warn("[Tray] Unable to create menu", result.error);
    },
  );
  tray.onTrayIconClicked?.addListener(showMainWindow);
  tray.onTrayIconDoubleClicked?.addListener(showMainWindow);
  tray.onMenuItemClicked?.addListener((event) => {
    if (event.item === SHOW_APP) showMainWindow();
    if (event.item === EXIT_APP) exitApp();
  });
};

export const destroyTray = () => {
  if (typeof overwolf === "undefined") return;
  trayApi()?.destroy?.(() => {});
};
