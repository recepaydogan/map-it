export interface LivePositionSnapshot {
  state: string;
  timestamp: number;
  processId?: number;
  nativeMapId?: number;
  mapId?: string;
  point?: { x: number; y: number };
}

const key = "gm:live-position";
const listeners = new Set<() => void>();
let current: LivePositionSnapshot = { state: "starting", timestamp: 0 };
let lastSaved = 0;
const accept = (value: LivePositionSnapshot) => {
  if (!value || typeof value.state !== "string" || !Number.isFinite(value.timestamp)) return;
  if (value.timestamp < current.timestamp) return;
  current = value;
  for (const listener of listeners) listener();
};
try {
  const saved = localStorage.getItem(key);
  if (saved) accept(JSON.parse(saved) as LivePositionSnapshot);
} catch (error) { console.warn("[LivePosition] snapshot-read", error); }

const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(key);
if (channel) channel.onmessage = (event: MessageEvent<LivePositionSnapshot>) => accept(event.data);
window.addEventListener("storage", (event) => {
  if (event.key !== key || !event.newValue) return;
  try { accept(JSON.parse(event.newValue) as LivePositionSnapshot); }
  catch (error) { console.warn("[LivePosition] snapshot-message", error); }
});

export const getLivePosition = () => current;
export const subscribeLivePosition = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const publishLivePosition = (value: LivePositionSnapshot) => {
  const changed = value.state !== current.state || value.mapId !== current.mapId;
  accept(value);
  channel?.postMessage(value);
  if (changed || Date.now() - lastSaved >= 1000) {
    lastSaved = Date.now();
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (error) { console.warn("[LivePosition] snapshot-write", error); }
  }
};
