/**
 * In-app rebinding for the app's Overwolf hotkeys.
 *
 * Overwolf recommends keeping the hotkey-reassign experience inside the app
 * rather than sending users to the Overwolf client settings:
 * https://dev.overwolf.com/ow-native/reference/settings/hotkeys-api/#reassign-hotkeys
 *
 * Flow:
 *  - `get()` loads the current binding for each manifest hotkey (by name).
 *  - `onChanged` keeps those bindings live — it also fires when the user rebinds
 *    from the Overwolf client, so Settings always shows the up-to-date combo.
 *  - `startCapture(name)` puts a row into "Press keys…" mode; the next real key
 *    press (a non-modifier key, plus any held modifiers) is sent to `assign()`.
 *
 * No-op outside Overwolf — the plain web build has no global hotkeys.
 */
import { useCallback, useEffect, useState } from "react";
import { track } from "../../services/optional-usage";
import { isOverwolf } from "../../utils/overwolf";
import { PRIMARY_GAME_CLASS_ID } from "../../game-config";

/** Manifest hotkey names the user can rebind (see public/manifest.json). */
export type HotkeyName = "toggle_desktop_app" | "toggle_app" | "toggle_overlay";

/** Current display binding per hotkey ("" = unassigned, undefined = not loaded). */
export type HotkeyBindings = Partial<Record<HotkeyName, string>>;

/** Pure-modifier keys we ignore while capturing — we wait for a real key. */
const MODIFIER_KEYS = new Set([
  "Control",
  "Alt",
  "AltGraph",
  "Shift",
  "Meta",
  "ContextMenu",
]);

export interface HotkeyRebind {
  /** Live binding string per hotkey (e.g. "Ctrl+Shift+A"), or "" if unassigned. */
  bindings: HotkeyBindings;
  /** The hotkey name currently capturing keys, or null. */
  capturing: HotkeyName | null;
  /** Keys held during capture, formatted for immediate UI feedback. */
  capturePreview: string;
  /** True once the Overwolf hotkeys API is available (Overwolf runtime). */
  supported: boolean;
  /** Last assign error, cleared when a new capture starts. */
  error: string | null;
  startCapture: (name: HotkeyName) => void;
  cancelCapture: () => void;
}

export const useHotkeyRebind = (): HotkeyRebind => {
  const [bindings, setBindings] = useState<HotkeyBindings>({});
  const [capturing, setCapturing] = useState<HotkeyName | null>(null);
  const [capturePreview, setCapturePreview] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(
    () => isOverwolf() && typeof overwolf.settings?.hotkeys?.assign === "function",
  );

  // Load current bindings, then keep them live via onChanged.
  useEffect(() => {
    if (!supported) return;

    overwolf.settings.hotkeys.get((result) => {
      if (!result.success) return;
      const gameHotkeys = Object.entries(result.games ?? {})
        .find(([gameId]) => Number(gameId) === PRIMARY_GAME_CLASS_ID)?.[1] ?? [];
      const hotkeys = gameHotkeys.length > 0 ? gameHotkeys : (result.globals ?? []);
      setBindings((current) => {
        const next = { ...current };
        for (const hotkey of hotkeys) {
          next[hotkey.name as HotkeyName] = hotkey.IsUnassigned ? "" : hotkey.binding;
        }
        return next;
      });
    });

    const onChanged = (event: overwolf.settings.hotkeys.OnChangedEvent) => {
      if (event.gameId && Number(event.gameId) !== PRIMARY_GAME_CLASS_ID) return;
      setBindings((current) => ({ ...current, [event.name as HotkeyName]: event.binding }));
    };
    overwolf.settings.hotkeys.onChanged.addListener(onChanged);
    return () => overwolf.settings.hotkeys.onChanged.removeListener(onChanged);
  }, [supported]);

  const cancelCapture = useCallback(() => {
    setCapturing(null);
    setCapturePreview("");
    setError(null);
  }, []);

  const startCapture = useCallback((name: HotkeyName) => {
    setError(null);
    setCapturePreview("");
    setCapturing(name);
  }, []);

  // Capture the next key combo while a row is armed. Capture-phase +
  // stopImmediatePropagation so the app's own key handlers (Ctrl+K search,
  // ESC-to-close) never see the keystrokes being bound. `capturing` is in the
  // deps, so the listener always closes over the armed row — no ref needed.
  useEffect(() => {
    if (!capturing) return;

    const getModifierLabels = (event: KeyboardEvent) => [
      event.ctrlKey ? "Ctrl" : null,
      event.altKey ? "Alt" : null,
      event.shiftKey ? "Shift" : null,
    ].filter((key): key is string => key !== null);

    const getKeyLabel = (event: KeyboardEvent) => {
      if (event.key === " ") return "Space";
      if (event.key.length === 1) return event.key.toUpperCase();
      return event.key.replace(/^Arrow/, "");
    };

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (event.key === "Escape") {
        cancelCapture();
        return;
      }
      // Preview lone modifiers, but wait for a non-modifier before assigning.
      const modifierLabels = getModifierLabels(event);
      if (MODIFIER_KEYS.has(event.key)) {
        setCapturePreview(modifierLabels.join(" + "));
        return;
      }

      setCapturePreview([...modifierLabels, getKeyLabel(event)].join(" + "));

      // Chromium (Overwolf's runtime) reports the legacy Windows virtual-key
      // code here, which is exactly what assign() expects.
      const virtualKey = event.keyCode;
      if (!virtualKey) return;

      overwolf.settings.hotkeys.assign(
        {
          name: capturing,
          ...(PRIMARY_GAME_CLASS_ID === undefined ? {} : { gameId: PRIMARY_GAME_CLASS_ID }),
          virtualKey,
          modifiers: { ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey },
        },
        (result) => {
          track("HOTKEY_REBOUND", { hotkey: capturing, success: result.success });
          if (!result.success) setError(result.error ?? "Couldn't assign that key.");
          // onChanged delivers the new binding; close capture either way.
          setCapturing(null);
          setCapturePreview("");
        },
      );
    };

    const onKeyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      setCapturePreview(getModifierLabels(event).join(" + "));
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [capturing, cancelCapture]);

  return {
    bindings,
    capturing,
    capturePreview,
    supported,
    error,
    startCapture,
    cancelCapture,
  };
};
