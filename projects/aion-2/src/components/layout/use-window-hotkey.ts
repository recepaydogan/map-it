import { useEffect, useState } from "react";

export type WindowHotkeyName = "toggle_desktop_app" | "toggle_app";

const DEFAULT_BINDINGS: Record<WindowHotkeyName, string> = {
  toggle_desktop_app: "Ctrl+Shift+D",
  toggle_app: "Ctrl+Shift+A",
};

/** Keep a window hint in sync with its current Overwolf binding. */
export const useWindowHotkey = (name: WindowHotkeyName): string => {
  const [binding, setBinding] = useState(DEFAULT_BINDINGS[name]);

  useEffect(() => {
    if (typeof overwolf === "undefined" || !overwolf.settings?.hotkeys?.get) return;

    let active = true;
    overwolf.settings.hotkeys.get((result) => {
      if (!active || !result.success) return;
      const hotkey = (result.globals ?? []).find((entry) => entry.name === name)
        ?? Object.values(result.games ?? {}).flat().find((entry) => entry.name === name);
      if (hotkey) setBinding(hotkey.IsUnassigned ? "" : hotkey.binding || DEFAULT_BINDINGS[name]);
    });

    const onChanged = (event: overwolf.settings.hotkeys.OnChangedEvent) => {
      if (event.name === name) setBinding(event.binding);
    };
    overwolf.settings.hotkeys.onChanged.addListener(onChanged);
    return () => {
      active = false;
      overwolf.settings.hotkeys.onChanged.removeListener(onChanged);
    };
  }, [name]);

  return binding;
};
