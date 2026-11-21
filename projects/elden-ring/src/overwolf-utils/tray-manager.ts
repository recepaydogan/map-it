import { closeWindow, revealMainWindowToFront } from "./window-manager";

const MENU_ITEMS = {
  SHOW_APP: "show_app",
  EXIT: "exit",
} as const;

const APP_NAME = "Elden Ring Atlas";

function showMainWindow(): void {
  // Restore AND surface to the front — a plain restore can leave the window
  // behind the foreground app, making a tray click look like it did nothing.
  revealMainWindowToFront("main").catch((err) =>
    console.warn("[TrayManager] Failed to show main window", err),
  );
}

function exitApp(): void {
  closeWindow("main").catch(() => {});
  closeWindow("overlay").catch(() => {});
  closeWindow("background").catch(() => {});
}

export function initTray(): void {
  if (typeof overwolf === "undefined") return;

  const trayApi = (
    overwolf as unknown as {
      os?: {
        tray?: {
          setMenu: (
            menu: { menu_items: { label: string; id: string }[] },
            cb: (result: { success: boolean; error?: string }) => void,
          ) => void;
          onTrayIconClicked?: {
            addListener: (cb: () => void) => void;
            removeListener: (cb: () => void) => void;
          };
          onTrayIconDoubleClicked?: {
            addListener: (cb: () => void) => void;
            removeListener: (cb: () => void) => void;
          };
          onMenuItemClicked?: {
            addListener: (cb: (event: { item: string }) => void) => void;
            removeListener: (cb: (event: { item: string }) => void) => void;
          };
        };
      };
    }
  ).os?.tray;

  if (!trayApi) {
    console.warn("[TrayManager] Tray API not available");
    return;
  }

  const menuItems = [
    { label: `Show ${APP_NAME}`, id: MENU_ITEMS.SHOW_APP },
    { label: "-", id: "separator" },
    { label: "Exit", id: MENU_ITEMS.EXIT },
  ];

  trayApi.setMenu({ menu_items: menuItems }, (result) => {
    if (result.success) {
      console.log("[TrayManager] Tray menu set successfully");
    } else {
      console.warn("[TrayManager] Failed to set tray menu", result.error);
    }
  });

  trayApi.onTrayIconClicked?.addListener(showMainWindow);
  trayApi.onTrayIconDoubleClicked?.addListener(showMainWindow);

  trayApi.onMenuItemClicked?.addListener((event) => {
    switch (event.item) {
      case MENU_ITEMS.SHOW_APP:
        showMainWindow();
        break;
      case MENU_ITEMS.EXIT:
        exitApp();
        break;
    }
  });

  console.log("[TrayManager] Tray initialized");
}

export function destroyTray(): void {
  if (typeof overwolf === "undefined") return;

  const trayApi = (
    overwolf as unknown as {
      os?: {
        tray?: {
          destroy: (cb: (result: { success: boolean; error?: string }) => void) => void;
        };
      };
    }
  ).os?.tray;

  if (!trayApi?.destroy) return;

  trayApi.destroy((result) => {
    if (result.success) {
      console.log("[TrayManager] Tray destroyed");
    } else {
      console.warn("[TrayManager] Failed to destroy tray", result.error);
    }
  });
}
