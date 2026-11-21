import { useEffect, useState } from "react";
import { GAME_CONFIG } from "../../game-config";
import type { HotkeyName } from "./hotkey-config";

/** The current Overwolf binding, or null until the hotkeys API supplies it. */
export const useHotkeyBinding = (name: HotkeyName | null): string | null => {
  const [binding, setBinding] = useState<{ name: HotkeyName; value: string } | null>(null);

  useEffect(() => {
    if (!name || typeof overwolf === "undefined" || !overwolf.settings?.hotkeys?.get) return;

    let active = true;
    const read = () => {
      overwolf.settings.hotkeys.get((result) => {
        if (!active || !result.success) return;
        const gameHotkeys = GAME_CONFIG.gameClassIds.flatMap((gameId) => result.games?.[gameId] ?? []);
        const hotkey = [...gameHotkeys, ...(result.globals ?? [])].find((entry) => entry.name === name);
        if (hotkey) setBinding({ name, value: hotkey.IsUnassigned ? "" : hotkey.binding });
      });
    };

    read();
    const onChanged = (event: overwolf.settings.hotkeys.OnChangedEvent) => {
      if (event.name === name) read();
    };
    overwolf.settings.hotkeys.onChanged.addListener(onChanged);
    return () => {
      active = false;
      overwolf.settings.hotkeys.onChanged.removeListener(onChanged);
    };
  }, [name]);

  return binding?.name === name ? binding.value : null;
};
