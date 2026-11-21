import { useEffect, useState } from "react";
import { parseWorldHotkeyFeedback, WORLD_HOTKEY_FEEDBACK_MESSAGE_ID, type WorldHotkeyFeedback } from "./world-hotkey-feedback";

export const useWorldHotkeyFeedback = (): WorldHotkeyFeedback | null => {
  const [entry, setEntry] = useState<{ value: WorldHotkeyFeedback; revision: number } | null>(null);
  useEffect(() => {
    if (typeof overwolf === "undefined" || !overwolf.windows?.onMessageReceived) return;
    const onMessage = (message: { id: string; content?: unknown }) => {
      if (message.id !== WORLD_HOTKEY_FEEDBACK_MESSAGE_ID) return;
      const value = parseWorldHotkeyFeedback(message.content);
      if (value) setEntry(current => ({ value, revision: (current?.revision ?? 0) + 1 }));
    };
    overwolf.windows.onMessageReceived.addListener(onMessage);
    return () => overwolf.windows.onMessageReceived.removeListener(onMessage);
  }, []);
  useEffect(() => {
    if (!entry) return;
    const revision = entry.revision;
    const timer = window.setTimeout(() => setEntry(current => current?.revision === revision ? null : current), 4_000);
    return () => window.clearTimeout(timer);
  }, [entry]);
  return entry?.value ?? null;
};
