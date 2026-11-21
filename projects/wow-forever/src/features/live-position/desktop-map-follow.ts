// The background owns the game's lifecycle. The desktop can close and reopen
// during that session, so keep the player's follow choice across windows.
const STORAGE_KEY = "gm:desktop-map-follow";

const writeFollow = (value: "on" | "off" | null) => {
  if (value === null) window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, value);
  window.dispatchEvent(new Event(STORAGE_KEY));
};

export const startDesktopMapFollow = () => writeFollow("on");
export const clearDesktopMapFollow = () => writeFollow(null);

export const getDesktopMapFollow = () => window.localStorage.getItem(STORAGE_KEY) === "on";

export const toggleDesktopMapFollow = () => {
  const current = window.localStorage.getItem(STORAGE_KEY);
  if (current === "on" || current === "off") writeFollow(current === "on" ? "off" : "on");
};

export const subscribeDesktopMapFollow = (listener: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(STORAGE_KEY, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(STORAGE_KEY, listener);
  };
};
