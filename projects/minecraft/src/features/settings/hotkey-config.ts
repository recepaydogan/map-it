export const APP_HOTKEYS = [
  { name: "toggle_desktop_app", labelKey: "settings.hotkeyDesktopApp", fallback: "Ctrl + Shift + D" },
  { name: "toggle_app", labelKey: "settings.hotkeyApp", fallback: "Ctrl + Shift + A" },
  { name: "toggle_overlay", labelKey: "settings.hotkeyOverlay", fallback: "Ctrl + M" },
  { name: "pin_current_position", labelKey: "settings.hotkeyPinCurrentPosition", fallback: "Ctrl + Alt + P" },
  { name: "zoom_minimap_in", labelKey: "settings.hotkeyZoomMinimapIn", fallback: "Ctrl + Alt + I" },
  { name: "zoom_minimap_out", labelKey: "settings.hotkeyZoomMinimapOut", fallback: "Ctrl + Alt + O" },
] as const;

export type HotkeyName = (typeof APP_HOTKEYS)[number]["name"];

const hotkeyNames = new Set<string>(APP_HOTKEYS.map(hotkey => hotkey.name));
export const isHotkeyName = (value: string): value is HotkeyName => hotkeyNames.has(value);
