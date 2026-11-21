import { APP_CONFIG } from "../config/app-config";
import { closeWindow, revealWindow } from "./window-manager";

const MENU_ITEMS = {
  show: "show_app",
  exit: "exit_app",
} as const;

interface TrayApi {
  setMenu(
    menu: { menu_items: Array<{ label: string; id: string }> },
    callback: (result: { success: boolean; error?: string }) => void,
  ): void;
  onTrayIconClicked?: { addListener(listener: () => void): void };
  onMenuItemClicked?: {
    addListener(listener: (event: { item: string }) => void): void;
  };
}

const getTrayApi = (): TrayApi | undefined =>
  (overwolf as unknown as { os?: { tray?: TrayApi } }).os?.tray;

const showApp = (): void => {
  void revealWindow(APP_CONFIG.mainWindowName).catch((error: unknown) => {
    console.warn("[Tray] Unable to show the main window", error);
  });
};

export const exitApp = async (): Promise<void> => {
  await closeWindow(APP_CONFIG.overlayWindowName);
  await closeWindow(APP_CONFIG.mainWindowName);
  await closeWindow(APP_CONFIG.backgroundWindowName);
};

export const initTray = (): void => {
  if (typeof overwolf === "undefined") return;
  const tray = getTrayApi();
  if (!tray) return;

  tray.setMenu(
    {
      menu_items: [
        { label: `Show ${APP_CONFIG.name}`, id: MENU_ITEMS.show },
        { label: "-", id: "separator" },
        { label: "Exit", id: MENU_ITEMS.exit },
      ],
    },
    (result) => {
      if (!result?.success) console.warn("[Tray] Menu setup failed", result?.error);
    },
  );

  tray.onTrayIconClicked?.addListener(showApp);
  tray.onMenuItemClicked?.addListener((event) => {
    if (event.item === MENU_ITEMS.show) showApp();
    if (event.item === MENU_ITEMS.exit) void exitApp();
  });
};
