export const SHARED_AUTH_STORAGE_KEY = "map-it-auth";
export interface SharedAccountConfig { url: string; key: string; storageKey: string }
declare global {
  interface Window {
    __MAP_IT_ACCOUNT_CONFIG__?: SharedAccountConfig;
    __MAP_IT_FLUSH_ACCOUNT__?: (userId: string) => Promise<boolean>;
    __MAP_IT_ACCOUNT_WINDOWS__?: Record<string, (userId: string) => Promise<boolean>>;
  }
}
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || "";
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || "";
const config = { url: url.replace(/\/+$/, ""), key, storageKey: SHARED_AUTH_STORAGE_KEY };
// Imported frames read only public connection settings, before their SDK boots.
if (typeof window !== "undefined") window.__MAP_IT_ACCOUNT_CONFIG__ = config;
export const getSharedAccountConfig = () => config;

export async function flushSharedAccountData(userId: string): Promise<boolean> {
  const callbacks = new Set<(userId: string) => Promise<boolean>>();
  try {
    const owner = typeof overwolf === "undefined" ? window : overwolf.windows.getMainWindow() as Window;
    Object.values(owner.__MAP_IT_ACCOUNT_WINDOWS__ || {}).forEach(callback => callbacks.add(callback));
  } catch { /* Browser and native windows share the direct-frame fallback. */ }
  if (!callbacks.size) document.querySelectorAll<HTMLIFrameElement>("iframe[data-map-app]").forEach(frame => {
    try { const callback = frame.contentWindow?.__MAP_IT_FLUSH_ACCOUNT__; if (callback) callbacks.add(callback); }
    catch { /* A frame can finish navigating during sign-out. */ }
  });
  const settled = await Promise.allSettled([...callbacks].map(callback => new Promise<boolean>(resolve => {
    const timeout = setTimeout(() => resolve(false), 12_000);
    Promise.resolve().then(() => callback(userId)).then(resolve, () => resolve(false)).finally(() => clearTimeout(timeout));
  })));
  return settled.every(result => result.status === "fulfilled" && result.value);
}
