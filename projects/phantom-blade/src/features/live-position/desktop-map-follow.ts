// Only the desktop reads this state. Keep manual choices when live samples
// drop out or the desktop window is recreated during the same game session.
const STORAGE_KEY = "phantom-blade-zero:desktop-map-follow";
const CHANGE_EVENT = STORAGE_KEY + ":changed";
let observedSession: string | number | undefined;

const write = (value: string | null) => {
  if (value === null) window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, value);
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const startDesktopMapFollow = (session: string | number = "running") => {
  if (observedSession === session) return;
  observedSession = session;
  const current = window.localStorage.getItem(STORAGE_KEY);
  if (!current?.startsWith(`${session}:`)) write(`${session}:on`);
};

export const clearDesktopMapFollow = () => {
  observedSession = undefined;
  if (window.localStorage.getItem(STORAGE_KEY) !== null) write(null);
};

export const getDesktopMapFollow = () => window.localStorage.getItem(STORAGE_KEY)?.endsWith(":on") ?? false;

export const setDesktopMapFollow = (enabled: boolean) => {
  const current = window.localStorage.getItem(STORAGE_KEY);
  if (current) {
    const next = current.slice(0, current.lastIndexOf(":") + 1) + (enabled ? "on" : "off");
    if (next !== current) write(next);
  }
};

export const toggleDesktopMapFollow = () => setDesktopMapFollow(!getDesktopMapFollow());

export const subscribeDesktopMapFollow = (listener: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
};
