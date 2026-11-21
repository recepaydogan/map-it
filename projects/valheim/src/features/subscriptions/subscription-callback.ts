import { SUBSCRIPTION_CONFIG } from "./subscription-config";

export const SUBSCRIPTION_CALLBACK_KEY = "valheim-subscription-checkout-return";

function checkoutResult(parameter: string): "success" | "cancel" | null {
  try {
    // Overwolf urlscheme launches percent-encode the entire callback URL.
    const decoded = parameter.includes(":") ? parameter : decodeURIComponent(parameter);
    const url = new URL(decoded);
    if (url.protocol !== `${SUBSCRIPTION_CONFIG.protocolScheme}:`) return null;
    const result = url.searchParams.get("result");
    return result === "success" || result === "cancel" ? result : null;
  } catch { return null; }
}

/** A checkout return is a refresh signal, never proof of payment. */
export function startSubscriptionCallbackRelay(): () => void {
  if (typeof overwolf === "undefined" || !import.meta.env?.VITE_TEBEX_PUBLIC_TOKEN) return () => {};
  const relay = (parameter: string) => {
    const result = checkoutResult(parameter);
    if (!result) return;
    try {
      localStorage.setItem(SUBSCRIPTION_CALLBACK_KEY, JSON.stringify({ result, time: Date.now() }));
    } catch { /* The regular authenticated check remains available if storage fails. */ }
  };
  const handle = (event: overwolf.extensions.AppLaunchTriggeredEvent) => relay(event.parameter);
  overwolf.extensions.onAppLaunchTriggered.addListener(handle);

  // On a cold launch the event can precede registration. Overwolf also puts
  // the encoded callback after ?source=urlscheme& in the background URL.
  const launch = new URLSearchParams(window.location.search);
  if (launch.get("source")?.toLowerCase() === "urlscheme") {
    for (const [parameter] of launch) relay(parameter);
  }
  return () => overwolf.extensions.onAppLaunchTriggered.removeListener(handle);
}
