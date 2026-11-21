/* Shared Map It authentication boundary. Imported solo builds stay unchanged. */
(() => {
  "use strict";
  const app = window.__MAP_IT_APP__;
  if (!app) return;
  const config = window.parent.__MAP_IT_ACCOUNT_CONFIG__ || { url: "", key: "", storageKey: "map-it-auth" };
  window.__MAP_IT_OPEN_ACCOUNT__ = () => window.parent.postMessage({ type: "map-it:open-account", appId: app.id }, location.origin);
  window.__MAP_IT_OPEN_SUPPORT__ = () => window.parent.postMessage({ type: "map-it:open-support", appId: app.id }, location.origin);
  const nativeFetch = window.__MAP_IT_CONTENT__?.fetchContent || window.fetch.bind(window);
  const tables = {
    "aion-2": ["user_saved_data"], "baldurs-gate-3": ["map_saved_states"],
    "elden-ring": ["user", "rpc/user_save"],
    "minecraft": ["user_progress", "user_journey_progress", "rpc/user_progress_save", "rpc/user_journey_progress_save"],
    "gta-6": ["user_saved_state"],
    "enshrouded": ["user_saved_state"], "phantom-blade": ["user_saved_state"],
    "wow-forever": ["user_saved_state"], "peak": ["expeditions"],
  };
  const prefix = `map_it_${app.id.replaceAll("-", "_")}_`;
  window.__MAP_IT_ACCOUNT_FETCH__ = window.fetch = (input, init) => {
    const value = input instanceof Request ? input.url : String(input);
    const target = new URL(value, location.href);
    if (!(window.__MAP_IT_SOLO_ACCOUNT_ORIGINS__ || []).includes(target.origin) || !/^\/(auth|rest|storage|functions)\/v1\//.test(target.pathname)) return nativeFetch(input, init);
    // Imported support pollers are retired. Only the host's game-aware RPCs
    // may file feedback; legacy forms cannot bypass the mandatory game field.
    const legacySupport = target.pathname.match(/^\/rest\/v1\/rpc\/(is_support_admin|support_\w+)$/)?.[1];
    if (legacySupport) {
      const result = legacySupport === "is_support_admin" ? false : legacySupport === "support_claim_threads" ? 0 : /list_threads|inbox_threads|thread_messages/.test(legacySupport) ? [] : null;
      const read = /^(?:is_support_admin|support_(?:claim_threads|list_threads|inbox_threads|thread_messages|mark_read))$/.test(legacySupport);
      return Promise.resolve(new Response(JSON.stringify(read ? result : { message: "Open shared Map It support.", code: "MAP_IT_SHARED_SUPPORT" }), { status: read ? 200 : 409, headers: { "content-type": "application/json" } }));
    }
    if (!config.url || !config.key) return Promise.resolve(new Response(JSON.stringify({ message: "Map It accounts are not configured.", code: "MAP_IT_ACCOUNT_UNAVAILABLE" }), { status: 503, headers: { "content-type": "application/json" } }));
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((entry, name) => headers.set(name, entry));
    const oldKey = headers.get("apikey");
    const authorization = headers.get("authorization");
    headers.set("apikey", config.key);
    if (!authorization || authorization === `Bearer ${oldKey}`) headers.set("authorization", `Bearer ${config.key}`);
    const route = target.pathname.replace(/^\/rest\/v1\//, "");
    if (tables[app.id]?.includes(route)) {
      const rpc = route.startsWith("rpc/");
      target.pathname = `/rest/v1/${rpc ? "rpc/" : ""}${prefix}${rpc ? route.slice(4) : route}`;
    }
    const url = config.url + target.pathname + target.search;
    if (input instanceof Request) return nativeFetch(new Request(url, input), { ...init, headers });
    return nativeFetch(url, { ...init, headers });
  };
  // Match by the account icon, including translated labels and a user's name.
  // Capture precedes React, so the solo account page never opens behind ours.
  const accountIcon = ".lucide-circle-user-round,.lucide-circle-user,.lucide-user-round,.lucide-user-circle,.lucide-user";
  const supportIcon = ".lucide-message-circle-question-mark,.lucide-message-circle-question,.lucide-life-buoy";
  const style = document.createElement("style");
  style.textContent = '[data-map-it-support-trigger][data-map-it-support-unread]::after{content:"";display:inline-block;width:6px;height:6px;margin-left:5px;border-radius:50%;background:#d5dae1}';
  document.head.appendChild(style);
  let supportUnread = false;
  const mark = () => {
    let identity;
    try { const user = JSON.parse(localStorage.getItem(config.storageKey) || "null")?.user; identity = user?.user_metadata?.display_name || user?.email?.split("@")[0]; } catch { /* No persisted account. */ }
    document.querySelectorAll("header button").forEach(button => {
      if (button.querySelector(accountIcon) || (identity && [button.getAttribute("aria-label"), button.title, button.textContent?.trim()].includes(identity))) button.setAttribute("data-map-it-account-trigger", "");
      if (button.querySelector(supportIcon) || button.dataset.tour === "support") {
        button.setAttribute("data-map-it-support-trigger", "");
        button.toggleAttribute("data-map-it-support-unread", supportUnread);
      }
    });
  };
  const receiveClick = event => {
    const button = event.target.closest?.("button,[role=button],a");
    if (!button) return;
    const support = button.hasAttribute("data-map-it-support-trigger") || (button.closest("header") && button.querySelector(supportIcon));
    if (!support && !button.hasAttribute("data-map-it-account-trigger") && !(button.closest("header") && button.querySelector(accountIcon))) {
      if (button.closest("header") && (button.closest("nav") || button.querySelector(".lucide-settings,.lucide-circle-help"))) window.parent.postMessage({ type: "map-it:leave-shared-page" }, location.origin);
      return;
    }
    event.preventDefault(); event.stopImmediatePropagation();
    if (support) window.__MAP_IT_OPEN_SUPPORT__(); else window.__MAP_IT_OPEN_ACCOUNT__();
  };
  document.addEventListener("click", receiveClick, true);
  const observer = new MutationObserver(mark);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  mark();
  window.addEventListener("message", event => {
    if (event.source !== window.parent || event.origin !== location.origin || event.data?.type !== "map-it:support-badge") return;
    supportUnread = Number(event.data.count) > 0;
    mark();
  });
  window.parent.postMessage({ type: "map-it:support-ready" }, location.origin);
  let owner;
  const registration = `${app.id}:${location.search}:${Math.random()}`;
  try {
    owner = (window.overwolf || window.parent.overwolf)?.windows.getMainWindow() || window.parent;
    owner.__MAP_IT_ACCOUNT_WINDOWS__ ??= {};
    owner.__MAP_IT_ACCOUNT_WINDOWS__[registration] = userId => window.__MAP_IT_FLUSH_ACCOUNT__?.(userId) ?? Promise.resolve(true);
  } catch { /* Direct-frame flushing remains available in the browser. */ }
  window.addEventListener("pagehide", () => { observer.disconnect(); document.removeEventListener("click", receiveClick, true); if (owner?.__MAP_IT_ACCOUNT_WINDOWS__) delete owner.__MAP_IT_ACCOUNT_WINDOWS__[registration]; }, { once: true });
})();
