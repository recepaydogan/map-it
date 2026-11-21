/**
 * The Roundtable's global hotkey, as the player would actually press it.
 *
 * The companion can be turned off as an auto-open surface, at which point the
 * hotkey IS the way back in — so anywhere we say that, we have to name the real
 * combo, not the manifest default the user may have rebound. Overwolf's
 * `onChanged` keeps it live, including rebinds made from the Overwolf client.
 */
import { useEffect, useState } from "react";
import { isOverwolf } from "../../utils/overwolf";

const HOTKEY_NAME = "toggle_companion";

/** Shown until Overwolf answers — matches the manifest default. */
export const COMPANION_HOTKEY_FALLBACK = "Ctrl+Shift+B";

export const useCompanionHotkey = (): string => {
  const [binding, setBinding] = useState<string>(COMPANION_HOTKEY_FALLBACK);

  useEffect(() => {
    if (!isOverwolf() || typeof overwolf.settings?.hotkeys?.get !== "function") return;

    overwolf.settings.hotkeys.get((res) => {
      if (!res.success || !res.globals) return;
      const hotkey = res.globals.find((entry) => entry.name === HOTKEY_NAME);
      if (!hotkey) return;
      // An explicitly unassigned hotkey has no combo to print — keep the default
      // rather than showing an empty box.
      if (!hotkey.IsUnassigned && hotkey.binding) setBinding(hotkey.binding);
    });

    const onChanged = (event: overwolf.settings.hotkeys.OnChangedEvent) => {
      if (event.name !== HOTKEY_NAME) return;
      setBinding(event.binding || COMPANION_HOTKEY_FALLBACK);
    };
    overwolf.settings.hotkeys.onChanged.addListener(onChanged);
    return () => overwolf.settings.hotkeys.onChanged.removeListener(onChanged);
  }, []);

  return binding;
};
