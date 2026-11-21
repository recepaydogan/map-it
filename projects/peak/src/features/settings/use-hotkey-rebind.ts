/**
 * In-app rebinding for the app's global Overwolf hotkeys.
 *
 * Overwolf asks apps to keep hotkey reassignment inside the app rather than
 * sending the user to the Overwolf client settings:
 * https://dev.overwolf.com/ow-native/reference/settings/hotkeys-api/#reassign-hotkeys
 *
 *  - `get()` loads the current binding for each manifest hotkey.
 *  - `onChanged` keeps them live, including rebinds made from the Overwolf
 *    client, so Settings never shows a stale combo.
 *  - `startCapture(name)` arms a row; the next non-modifier key press (plus
 *    whatever modifiers are held) is sent to `assign()`.
 *
 * No-op outside Overwolf — the plain web build has no global hotkeys.
 */
import { useCallback, useEffect, useState } from "react";
import { getAppHotkeys, HOTKEY_GAME_ID } from "../../overwolf/hotkeys";
import { IS_OVERWOLF } from "../../utils/platform";

/** Manifest hotkey names we let the user rebind (see public/manifest.json). */
export type HotkeyName = "toggle_app" | "toggle_overlay";

/** Manifest defaults, shown until Overwolf answers. */
export const HOTKEY_DEFAULTS: Record<HotkeyName, string> = {
  toggle_app: "Ctrl+Shift+D",
  toggle_overlay: "Ctrl+M",
};

/** Current display binding per hotkey ("" = unassigned, undefined = not loaded). */
export type HotkeyBindings = Partial<Record<HotkeyName, string>>;

/** Pure-modifier keys we ignore while capturing — we wait for a real key. */
const MODIFIER_KEYS = new Set(["Control", "Alt", "AltGraph", "Shift", "Meta", "ContextMenu"]);

export interface HotkeyRebind {
  /** Live binding string per hotkey (e.g. "Ctrl+Shift+D"), or "" if unassigned. */
  bindings: HotkeyBindings;
  /** The hotkey currently capturing keys, or null. */
  capturing: HotkeyName | null;
  /** True once the Overwolf hotkeys API is available. */
  supported: boolean;
  /** Last assign error, cleared when a new capture starts. */
  error: string | null;
  startCapture: (name: HotkeyName) => void;
  cancelCapture: () => void;
}

export const useHotkeyRebind = (): HotkeyRebind => {
  const [bindings, setBindings] = useState<HotkeyBindings>({});
  const [capturing, setCapturing] = useState<HotkeyName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(
    () => IS_OVERWOLF && typeof overwolf.settings?.hotkeys?.assign === "function",
  );

  // ── Load current bindings and keep them live ─────────────────
  useEffect(() => {
    if (!supported) return;

    overwolf.settings.hotkeys.get((result) => {
      if (!result.success) return;
      setBindings((current) => {
        const next = { ...current };
        for (const hotkey of getAppHotkeys(result)) {
          next[hotkey.name as HotkeyName] = hotkey.IsUnassigned ? "" : hotkey.binding;
        }
        return next;
      });
    });

    const onChanged = (event: overwolf.settings.hotkeys.OnChangedEvent) => {
      setBindings((current) => ({ ...current, [event.name as HotkeyName]: event.binding }));
    };
    overwolf.settings.hotkeys.onChanged.addListener(onChanged);
    return () => overwolf.settings.hotkeys.onChanged.removeListener(onChanged);
  }, [supported]);

  const cancelCapture = useCallback(() => {
    setCapturing(null);
    setError(null);
  }, []);

  const startCapture = useCallback((name: HotkeyName) => {
    setError(null);
    setCapturing(name);
  }, []);

  // ── Capture the next combo while a row is armed ──────────────
  // Capture phase + stopImmediatePropagation so the app's own key handlers
  // (the map's ESC-to-close, Settings' ESC) never see the keys being bound.
  useEffect(() => {
    if (!capturing) return;

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (event.key === "Escape") {
        cancelCapture();
        return;
      }
      if (MODIFIER_KEYS.has(event.key)) return;

      // Chromium reports the legacy Windows virtual-key code here, which is
      // exactly what assign() expects.
      const virtualKey = event.keyCode;
      if (!virtualKey) return;

      overwolf.settings.hotkeys.assign(
        {
          name: capturing,
          gameId: HOTKEY_GAME_ID,
          virtualKey,
          modifiers: { ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey },
        },
        (result) => {
          if (!result.success) setError(result.error ?? "Couldn't assign that key.");
          // onChanged delivers the new binding; close capture either way.
          setCapturing(null);
        },
      );
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [capturing, cancelCapture]);

  return { bindings, capturing, supported, error, startCapture, cancelCapture };
};
