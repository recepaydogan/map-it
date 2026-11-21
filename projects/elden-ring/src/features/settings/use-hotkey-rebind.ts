/**
 * In-app rebinding for the app's global Overwolf hotkeys.
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
import { isOverwolf } from "../../utils/overwolf";

/** Manifest hotkey names we let the user rebind (see public/manifest.json). */
export type HotkeyName =
  | "toggle_app"
  | "toggle_companion"
  | "toggle_overlay"
  | "dismiss_overlay";

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
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(
    () => isOverwolf() && typeof overwolf.settings?.hotkeys?.assign === "function",
  );

  // ── Load current bindings + keep them live via onChanged ─────────
  useEffect(() => {
    if (!supported) return;

    overwolf.settings.hotkeys.get((res) => {
      if (!res.success || !res.globals) return;
      setBindings((prev) => {
        const next = { ...prev };
        for (const h of res.globals) {
          next[h.name as HotkeyName] = h.IsUnassigned ? "" : h.binding;
        }
        return next;
      });
    });

    const onChanged = (e: overwolf.settings.hotkeys.OnChangedEvent) => {
      setBindings((prev) => ({ ...prev, [e.name as HotkeyName]: e.binding }));
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

  // ── Capture the next key combo while a row is armed ──────────────
  // Capture-phase + stopImmediatePropagation so the app's own key handlers
  // (map WASD nav, ESC-to-close) never see the keystrokes we're binding.
  // `capturing` is in the deps, so the listener re-subscribes on every change
  // and always closes over the armed row — no ref needed.
  useEffect(() => {
    if (!capturing) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      if (e.key === "Escape") {
        cancelCapture();
        return;
      }
      // Ignore lone modifier presses — wait for the actual key.
      if (MODIFIER_KEYS.has(e.key)) return;

      // Chromium (Overwolf's runtime) reports the legacy Windows virtual-key
      // code here, which is exactly what assign() expects.
      const virtualKey = e.keyCode;
      if (!virtualKey) return;

      const name = capturing;
      if (!name) return;

      overwolf.settings.hotkeys.assign(
        {
          name,
          virtualKey,
          modifiers: { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey },
        },
        (res) => {
          if (!res.success) setError(res.error ?? "Couldn't assign that key.");
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
