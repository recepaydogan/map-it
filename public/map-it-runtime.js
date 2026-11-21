/* Compatibility boundary for imported app builds. Source projects stay untouched. */
(() => {
  "use strict";
  const app = window.__MAP_IT_APP__;
  if (!app) return;
  const scope = `map-it:app:${app.id}:`;
  const params = new URLSearchParams(location.search);
  const surface = params.get("window") || "main";
  const hostedMain = surface === "main" && params.get("host-sidebar") === "true" && window.parent !== window;
  const subscriptions = [];
  const nativeObjects = new Set();
  const childProcesses = new Map();
  const rawLocalStorage = window.localStorage;
  // The host owns the sole live ads SDK and its persistent containers. Imported
  // modules keep their application code, but never create another ad session.
  if (typeof document !== "undefined") {
    class HostOwnedAd {
      constructor(container) { container.closest?.("aside")?.setAttribute("data-map-it-imported-ad", ""); }
      addEventListener() { return true; }
      removeEventListener() { return true; }
      removeAd() {}
      refreshAd() {}
      pause() {}
      resume() {}
      updateSize() {}
      shutdown() { return Promise.resolve(); }
    }
    Object.defineProperty(window, "OwAd", { configurable: false, get: () => HostOwnedAd, set() {} });
    const adsStyle = document.createElement("style");
    adsStyle.textContent = `[data-map-it-imported-ad]{display:none!important}
      html[data-map-it-host-rail] .app-dashboard-window > header:has(+ div [data-map-it-game-navigation]){display:none!important}
      html[data-map-it-host-rail] .app-dashboard-window > div:has([data-map-it-game-navigation]){
        box-sizing:border-box!important;padding-right:440px!important
      }
      html[data-map-it-host-rail] .app-dashboard-window :is(.app-window-ad-column, aside[class~="w-[440px]"]){
        display:none!important
      }`;
    document.head.append(adsStyle);
    if (hostedMain) {
      const scrollbars = document.createElement("link");
      scrollbars.rel = "stylesheet";
      scrollbars.href = "/map-it-scrollbars.css";
      document.head.append(scrollbars);
    }
    if (hostedMain && params.get("host-ad-rail") === "true") {
      document.documentElement.setAttribute("data-map-it-host-rail", "");
    }
    const brandLabel = params.get("host-brand-label");
    const returnLabel = params.get("host-library-label");
    if (hostedMain && brandLabel && returnLabel) {
      const home = document.createElement("button");
      home.type = "button";
      home.className = "app-navigation-item";
      home.setAttribute("data-map-it-library-home", "");
      home.title = returnLabel;

      const icon = document.createElement("span");
      icon.className = "app-navigation-icon";
      const logo = document.createElement("img");
      // Resolve the host logo before installing the game's scoped asset adapter.
      logo.src = "/icon.png";
      logo.alt = "";
      logo.draggable = false;
      icon.append(logo);

      const label = document.createElement("span");
      label.className = "app-navigation-label";
      label.textContent = brandLabel;
      home.append(icon, label);
      home.addEventListener("click", () => window.parent.postMessage({ type: "map-it:open-library" }, location.origin));

      const style = document.createElement("style");
      style.textContent = ".app-navigation-panel > [data-map-it-library-home] { width: calc(100% - 12px); margin: 6px 6px 0; color: var(--app-nav-text); font-weight: 650; }";
      document.head.append(style);

      const mountHome = () => {
        if (!home.isConnected) document.querySelector("[data-map-it-game-navigation]")?.prepend(home);
      };
      const observer = new MutationObserver(mountHome);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      mountHome();
      subscriptions.push(() => {
        observer.disconnect();
        home.remove();
        style.remove();
      });
    }
  }
  if (surface === "main" && typeof document !== "undefined") {
    const picker = document.createElement("script");
    picker.src = "/map-it-picker.js";
    document.head.append(picker);
  }

  function scopedStorage(storage) {
    const sharedAuth = key => typeof key === "string" && (key === "map-it-auth" || key.startsWith("map-it-auth-"));
    const storageKey = key => sharedAuth(key) ? key : scope + key;
    const keys = () => Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(key => key?.startsWith(scope));
    const api = {
      getItem: key => storage.getItem(storageKey(key)),
      setItem: (key, value) => storage.setItem(storageKey(key), value),
      removeItem: key => storage.removeItem(storageKey(key)),
      clear: () => keys().forEach(key => storage.removeItem(key)),
      key: index => keys()[index]?.slice(scope.length) ?? null,
    };
    return new Proxy(api, {
      get(target, key) { return key === "length" ? keys().length : key in target ? target[key] : typeof key === "string" ? target.getItem(key) : undefined; },
      set(target, key, value) { target.setItem(key, value); return true; },
      deleteProperty(target, key) { target.removeItem(key); return true; },
      ownKeys: () => keys().map(key => key.slice(scope.length)),
      getOwnPropertyDescriptor: () => ({ configurable: true, enumerable: true }),
    });
  }
  Object.defineProperty(window, "localStorage", { value: scopedStorage(rawLocalStorage) });
  Object.defineProperty(window, "sessionStorage", { value: scopedStorage(window.sessionStorage) });
  window.addEventListener("storage", event => {
    if (!event.isTrusted) return;
    if (event.key === "map-it-auth" || event.key?.startsWith("map-it-auth-")) return;
    event.stopImmediatePropagation();
    if (!event.key?.startsWith(scope)) return;
    const translated = new StorageEvent("storage", { key: event.key.slice(scope.length), oldValue: event.oldValue, newValue: event.newValue, url: event.url });
    Object.defineProperty(translated, "storageArea", { value: window.localStorage });
    window.dispatchEvent(translated);
  }, true);

  if (window.BroadcastChannel) {
    const NativeChannel = window.BroadcastChannel;
    window.BroadcastChannel = class extends NativeChannel { constructor(name) { super(name === "map-it-auth" ? name : scope + name); } };
  }
  if (window.indexedDB) {
    const database = window.indexedDB;
    Object.defineProperty(window, "indexedDB", { value: new Proxy(database, {
      get(target, key) {
        if (key === "open" || key === "deleteDatabase") return (name, ...args) => target[key](scope + name, ...args);
        const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
      },
    }) });
  }

  function assetUrl(value) {
    if (typeof value !== "string" && !(value instanceof URL)) return value;
    const string = String(value);
    if (/^(?:(?:data|blob):|#)/.test(string)) return value;
    const url = new URL(string, location.href);
    if (url.origin === location.origin && !url.pathname.startsWith(app.prefix + "/") && app.roots.includes(url.pathname.split("/")[1])) url.pathname = app.prefix + url.pathname;
    // Imported CDN helpers may receive an already scoped local path. Their
    // immutable CDN base must not acquire a second /apps/<game>/ directory.
    if (url.origin !== location.origin && window.__MAP_IT_CONTENT_CONFIG__?.aliases.some(alias => alias.origin === url.origin)) {
      const scope = app.prefix + "/";
      const index = url.pathname.indexOf(scope);
      if (index > 0 && /\/(?:assets|releases)\/[a-f0-9]{8,64}$/.test(url.pathname.slice(0, index))) url.pathname = url.pathname.slice(0, index) + "/" + url.pathname.slice(index + scope.length);
    }
    return window.__MAP_IT_CONTENT__?.resolveAsset(url.href) ?? url.href;
  }
  // Content's native fetch already passes through the account adapter. Keep
  // it outermost so signing in does not bypass verified caching and retries.
  const nativeFetch = window.__MAP_IT_CONTENT__?.fetchContent ?? window.__MAP_IT_ACCOUNT_FETCH__ ?? window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (input instanceof Request) return nativeFetch(new Request(assetUrl(input.url), input), init);
    return nativeFetch(assetUrl(input), init);
  };
  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) { return nativeOpen.call(this, method, assetUrl(url), ...args); };
  const nativeSetAttribute = Element.prototype.setAttribute;
  const rewriteStyle = value => typeof value === "string" ? value.replace(/url\((['"]?)([^)'"\s]+)\1\)/gi, (_match, quote, url) => `url(${quote}${assetUrl(url)}${quote})`) : value;
  window.__MAP_IT_REWRITE_STYLE__ = rewriteStyle;
  if (typeof CSSStyleDeclaration !== "undefined") {
    const prototype = CSSStyleDeclaration.prototype;
    const setProperty = prototype.setProperty;
    prototype.setProperty = function(name, value, priority) { return setProperty.call(this, name, rewriteStyle(value), priority); };
    for (const name of ["background", "backgroundImage", "maskImage", "webkitMaskImage", "listStyleImage", "borderImageSource", "cursor", "cssText"]) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (descriptor?.set && descriptor.configurable) Object.defineProperty(prototype, name, { ...descriptor, set(value) { descriptor.set.call(this, rewriteStyle(value)); } });
    }
  }
  const rewriteHtml = value => typeof value === "string" ? value.replace(/\b(src|href|poster)=(['"])(.*?)\2/gi, (_match, name, quote, url) => `${name}=${quote}${assetUrl(url)}${quote}`) : value;
  const innerHtml = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
  if (innerHtml?.set) Object.defineProperty(Element.prototype, "innerHTML", { ...innerHtml, set(value) { innerHtml.set.call(this, rewriteHtml(value)); } });
  const insertHtml = Element.prototype.insertAdjacentHTML;
  if (insertHtml) Element.prototype.insertAdjacentHTML = function(position, value) { return insertHtml.call(this, position, rewriteHtml(value)); };
  Element.prototype.setAttribute = function(name, value) {
    return nativeSetAttribute.call(this, name, ["src", "href", "poster"].includes(name.toLowerCase()) ? assetUrl(value) : value);
  };
  for (const [prototype, name] of [[HTMLImageElement.prototype, "src"], [HTMLScriptElement.prototype, "src"], [HTMLLinkElement.prototype, "href"], [HTMLMediaElement.prototype, "src"], [HTMLSourceElement.prototype, "src"]]) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (descriptor?.set) Object.defineProperty(prototype, name, { ...descriptor, set(value) { descriptor.set.call(this, assetUrl(value)); } });
  }
  if (window.Worker) {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker { constructor(url, options) { super(assetUrl(url), options); } };
  }

  const native = window.overwolf || window.parent?.overwolf;
  if (native) {
    // Declared windows belong to Map It. The embedded document exposes the game's manifest.
    const hostWindows = window.parent !== window ? window.parent.overwolf?.windows : undefined;
    const nativeGames = native.games;
    const nativeHotkeys = native.settings?.hotkeys;
    const io = native.io;
    let trackingFileSystem;
    if (app.roots.includes("tracking-mod") && typeof io?.copyFile === "function") {
      const copyFile = (source, ...args) => {
        const bundled = typeof source === "string" && source.startsWith("tracking-mod/payload/");
        return io.copyFile(bundled ? `${app.prefix.slice(1)}/${source}` : source, ...args);
      };
      // Use a separate target so CEF's fixed file methods can keep their native receiver.
      trackingFileSystem = new Proxy({}, {
        get(_target, key) {
          if (key === "copyFile") return copyFile;
          const value = Reflect.get(io, key, io);
          return typeof value === "function" ? value.bind(io) : value;
        },
        has(_target, key) { return key in io; },
      });
    }
    const reverseWindows = Object.fromEntries(Object.entries(app.windows).map(([key, value]) => [value, key]));
    const reverseHotkeys = Object.fromEntries(Object.entries(app.hotkeys || {}).map(([key, value]) => [value, key]));
    const cache = new WeakMap();
    const listenerMaps = new WeakMap();
    const translate = (value, dictionary = reverseWindows) => {
      if (!value || typeof value !== "object") return typeof value === "string" ? dictionary[value] ?? value : value;
      if (Array.isArray(value)) return value.map(item => translate(item, dictionary));
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [dictionary[key] ?? key, translate(item, dictionary)]));
    };
    function eventProxy(event, path) {
      let map = listenerMaps.get(event);
      if (!map) { map = new Map(); listenerMaps.set(event, map); }
      return {
        addListener(listener) {
          if (map.has(listener)) return;
          const wrapped = payload => {
            if (path.endsWith("onMessageReceived")) {
              if (!payload?.id?.startsWith(scope)) return;
              listener({ ...translate(payload), id: payload.id.slice(scope.length) });
            } else if (path === "extensions.onAppLaunchTriggered" && /gamelaunchevent/i.test(payload?.origin || "")) {
              // The aggregate manifest receives launches for every supported game.
              // An outgoing module must not react to another game's launch.
              nativeGames.getRunningGameInfo(info => {
                if (!disposed && info?.isRunning && app.manifest.data.game_targeting?.game_ids?.includes(Number(info.classId))) listener(payload);
              });
            } else if (path.includes("hotkeys")) {
              const key = payload?.name ?? payload?.hotkey;
              if (key && !reverseHotkeys[key]) return;
              listener(translate(payload, reverseHotkeys));
            } else listener(path.startsWith("windows.") ? translate(payload) : payload);
          };
          map.set(listener, wrapped); event.addListener(wrapped);
          subscriptions.push(() => event.removeListener(wrapped));
        },
        removeListener(listener) { const wrapped = map.get(listener); if (wrapped) event.removeListener(wrapped); map.delete(listener); },
      };
    }
    function wrap(target, path = "") {
      if (!target || (typeof target !== "object" && typeof target !== "function")) return target;
      if (cache.has(target)) return cache.get(target);
      if (typeof target.addListener === "function" && typeof target.removeListener === "function") return eventProxy(target, path);
      const proxy = new Proxy(target, {
        get(object, key) {
          const value = Reflect.get(object, key, object);
          if (!path && key === "io") return trackingFileSystem ?? value;
          if (!path && key === "windows" && hostWindows) return wrap(hostWindows, "windows");
          const route = path ? `${path}.${String(key)}` : String(key);
          if (typeof value !== "function") return value && typeof value === "object" ? wrap(value, route) : value;
          if (route === "windows.getMainWindow") return () => {
            const host = value.call(object); host.__mapItSessions ??= {};
            return host.__mapItSessions[app.id] ??= {};
          };
          if (route === "extensions.current.getManifest") return callback => callback(app.manifest);
          // One system-tray owner for the aggregate app.
          if (route === "os.tray.setMenu" || route === "os.tray.destroy") return (...args) => args.at(-1)?.({ success: true });
          return (...args) => {
            if (path === "windows" && typeof args[0] === "string" && app.windows[args[0]]) args[0] = app.windows[args[0]];
            if (route === "windows.sendMessage") args[1] = scope + args[1];
            if (path.includes("hotkeys")) args = args.map(arg => typeof arg === "string" ? app.hotkeys?.[arg] ?? arg : arg && typeof arg === "object" && "name" in arg ? { ...arg, name: app.hotkeys?.[arg.name] ?? arg.name } : arg);
            const callbackIndex = args.findLastIndex(arg => typeof arg === "function");
            if (callbackIndex !== -1) {
              const callback = args[callbackIndex];
              args[callbackIndex] = async result => {
                if (route === "windows.getCurrentWindow" && result?.window) result = { ...result, window: { ...result.window, name: surface } };
                else if (path === "windows") result = translate(result);
                if (path.includes("hotkeys")) {
                  if (route.endsWith(".get") && result && window.__MAP_IT_HOTKEYS__) {
                    const hotkeys = nativeHotkeys ?? native.settings?.hotkeys;
                    result = window.__MAP_IT_HOTKEYS__.project(await window.__MAP_IT_HOTKEYS__.restoreMissing(hotkeys, result, app), app);
                  } else result = translate(result, reverseHotkeys);
                }
                if (route === "extensions.current.getExtensionData" && result?.data?.path_on_disk) result = { ...result, data: { ...result.data, path_on_disk: result.data.path_on_disk + "\\apps\\" + app.id } };
                if (route === "extensions.current.getExtraObject" && result?.object) { nativeObjects.add(result.object); result = { ...result, object: wrap(result.object, "native-plugin") }; }
                if (route === "native-plugin.launchProcess" && result?.data) childProcesses.set(result.data, object);
                callback(result);
              };
            }
            return value.apply(object, args);
          };
        },
      });
      cache.set(target, proxy); return proxy;
    }
    const adapter = wrap(native);
    const descriptor = Object.getOwnPropertyDescriptor(window, "overwolf");
    if (descriptor?.configurable === false && descriptor.writable !== true) {
      // CEF locks the global in background frames but leaves its namespaces writable.
      const namespaces = ["windows", "io", "games", "settings", "extensions", "profile", "os"];
      const replacements = namespaces.filter(key => Object.getOwnPropertyDescriptor(native, key)?.writable)
        .map(key => [key, adapter[key]]);
      Object.assign(native, Object.fromEntries(replacements));
    } else {
      Object.defineProperty(window, "overwolf", { configurable: descriptor?.configurable ?? true, value: adapter });
    }
  }
  let disposed = false;
  function dispose() {
    if (disposed) return; disposed = true;
    subscriptions.forEach(stop => { try { stop(); } catch { /* Host is closing. */ } });
    nativeObjects.forEach(object => { try { object.stop?.(() => {}); } catch { /* Reader may already have stopped. */ } });
    childProcesses.forEach((object, pid) => { try { object.terminateProcess(pid); } catch { /* Process may already have exited. */ } });
  }
  window.__MAP_IT_DISPOSE__ = dispose;
  window.addEventListener("pagehide", dispose, { once: true });
  window.addEventListener("error", event => window.parent.postMessage({ type: "map-it:module-error", appId: app.id, message: event.message }, "*"));
  window.parent.postMessage({ type: "map-it:module-ready", appId: app.id }, "*");
})();
