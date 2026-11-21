import { useEffect, useState } from "react";

const INTERACTION_NAME = /interact/i;
const CURSOR_NAME = /cursor|unlock.?mouse|mouse.?control/i;
const DOCK_NAME = /dock|overwolf.?overlay/i;
// Overwolf's built-in shortcut enters overlay interaction mode even when the
// platform hotkey is absent from getAllApps(). This is a functional fallback.
const DEFAULT_INTERACTION_MODE_BINDING = "Ctrl+Tab";

/** Read the Overwolf platform binding, which is separate from this app's hotkeys. */
export const useInteractionModeBinding = (): string | null => {
  const [binding, setBinding] = useState<string | null>(DEFAULT_INTERACTION_MODE_BINDING);

  useEffect(() => {
    if (typeof overwolf === "undefined" || !overwolf.settings?.hotkeys?.getAllApps) return;

    let active = true;
    const read = () => {
      overwolf.settings.hotkeys.getAllApps((result) => {
        if (!active || !result.success) return;
        const platform = result.platform ?? [];
        const hotkey = platform.find(({ name }) => INTERACTION_NAME.test(name))
          ?? platform.find(({ title }) => INTERACTION_NAME.test(title))
          ?? platform.find(({ name }) => CURSOR_NAME.test(name))
          ?? platform.find(({ title }) => CURSOR_NAME.test(title))
          ?? platform.find(({ name }) => DOCK_NAME.test(name))
          ?? platform.find(({ title }) => DOCK_NAME.test(title));
        if (hotkey) setBinding(!hotkey.IsUnassigned && hotkey.binding ? hotkey.binding : null);
      });
    };

    read();
    const onVisibilityChange = () => { if (!document.hidden) read(); };
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = window.setInterval(() => { if (!document.hidden) read(); }, 30_000);
    return () => {
      active = false;
      window.removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(interval);
    };
  }, []);

  return binding;
};
