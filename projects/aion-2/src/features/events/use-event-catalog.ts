import { useEffect, useState } from "react";
import { EXTRA_SCHEDULED_EVENTS } from "../../game-config";
import { contentUrl } from "../../lib/content-url";
import type { ScheduledEvent } from "./event-schedule";

export function useEventCatalog() {
  const [state, setState] = useState<{ events: ScheduledEvent[]; status: "loading" | "ready" | "error" }>({ events: [], status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    void fetch(contentUrl("data/event-schedule.json"), { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(`Event schedule: HTTP ${response.status}`);
      const events = await response.json() as ScheduledEvent[];
      const validTiming = (event: ScheduledEvent) => event.kind === "world-boss"
        ? event.entryWindowSeconds === 0 && event.durationSeconds === 0
        : Number.isFinite(event.entryWindowSeconds) && event.entryWindowSeconds > 0
          && Number.isFinite(event.durationSeconds) && event.durationSeconds >= event.entryWindowSeconds;
      if (!Array.isArray(events) || events.some((event) => !event.id || !event.name || !Array.isArray(event.days) || !Array.isArray(event.minutes) || !validTiming(event))) throw new Error("Invalid event schedule");
      if (!controller.signal.aborted) setState({ events: [...EXTRA_SCHEDULED_EVENTS, ...events], status: "ready" });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      console.error("Failed to load event schedule", error);
      setState({ events: [], status: "error" });
    });
    return () => controller.abort();
  }, []);
  return state;
}
