/* Shared switcher, mounted in each imported game's native header. */
(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  if (!window.__MAP_IT_APP__ || params.get("window") !== "main" || params.get("host-sidebar") === "true") return;
  const app = window.__MAP_IT_APP__;
  const currentGameId = params.get("game") || app.id;
  const gameIcon = id => `/game-cards/icons/${id}.png`;
  const selectedLabel = params.get("selected-label") || "";
  const libraryLabel = params.get("library-label");
  let apps = [];
  let currentGame;
  let menu;
  let trigger;
  let menuDocument = document;
  try {
    if (window.frameElement?.hasAttribute("data-map-app")) menuDocument = window.parent.document;
  } catch { /* Standalone builds keep their own menu document. */ }
  for (const target of new Set([document, menuDocument])) {
    if (target.getElementById("map-it-shared-picker-style")) continue;
    const style = target.createElement("link");
    style.id = "map-it-shared-picker-style";
    style.rel = "stylesheet";
    style.href = "/map-it-picker.css";
    target.head.append(style);
  }
  const stopDrag = event => event.stopPropagation();
  const svg = pathData => {
    const icon = menuDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) icon.setAttribute(key, value);
    const path = menuDocument.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData); icon.append(path);
    return icon;
  };
  function close(focus = false) {
    menu?.remove(); menu = null;
    trigger?.setAttribute("aria-expanded", "false");
    trigger?.removeAttribute("aria-controls");
    if (focus) trigger?.focus();
  }
  function open() {
    if (menu) { close(); return; }
    if (!apps.length) return;
    const pickerLabel = params.get("picker-label") || currentGame.name;
    const searchLabel = params.get("search-label") || pickerLabel;
    const emptyLabel = params.get("empty-label") || searchLabel;
    menu = menuDocument.createElement("div");
    menu.id = "map-it-game-switcher";
    menu.className = "map-it-picker-menu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", pickerLabel);
    const heading = menuDocument.createElement("div"); heading.className = "map-it-picker-heading";
    const title = menuDocument.createElement("span"); title.textContent = pickerLabel;
    const count = menuDocument.createElement("span"); count.textContent = String(apps.length).padStart(2, "0");
    heading.append(title, count);
    const field = menuDocument.createElement("label"); field.className = "map-it-picker-search";
    const input = menuDocument.createElement("input");
    input.type = "search"; input.placeholder = searchLabel; input.setAttribute("aria-label", searchLabel);
    input.autocomplete = "off"; input.spellcheck = false;
    field.append(svg("m21 21-4.5-4.5 M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0"), input);
    const results = menuDocument.createElement("div"); results.className = "map-it-picker-results";
    results.setAttribute("role", "menu"); results.setAttribute("aria-label", pickerLabel);
    const empty = menuDocument.createElement("p"); empty.className = "map-it-picker-empty";
    empty.textContent = emptyLabel; empty.setAttribute("role", "status"); empty.hidden = true;
    const preview = menuDocument.createElement("div"); preview.className = "map-it-picker-preview"; preview.setAttribute("aria-hidden", "true");
    const previewImage = menuDocument.createElement("img"); previewImage.alt = ""; previewImage.draggable = false;
    const previewNumber = menuDocument.createElement("span"); previewNumber.className = "map-it-picker-preview-number";
    const previewName = menuDocument.createElement("span"); previewName.className = "map-it-picker-preview-name";
    const previewArrow = svg("M7 17 17 7 M7 7h10v10");
    preview.append(previewImage, previewNumber, previewName, previewArrow);
    const showPreview = item => {
      if (!item || preview.dataset.game === item.id) return;
      preview.dataset.game = item.id;
      previewImage.removeAttribute("data-fallback");
      previewImage.src = `/game-cards/worlds/${item.id}.webp`;
      previewImage.onerror = () => { previewImage.onerror = null; previewImage.setAttribute("data-fallback", ""); previewImage.src = gameIcon(item.id); };
      previewName.textContent = item.name;
      previewNumber.textContent = String(apps.findIndex(candidate => candidate.id === item.id) + 1).padStart(2, "0");
      results.querySelectorAll("button").forEach(button => { button.toggleAttribute("data-preview", button.dataset.game === item.id); });
      if (!hostMotionReduced()) previewImage.animate([{ opacity: .25 }, { opacity: 1 }], { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" });
    };
    const hostMotionReduced = () => (menuDocument.defaultView || window).matchMedia("(prefers-reduced-motion: reduce)").matches;
    const render = () => {
      results.replaceChildren();
      const normalize = text => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
      const filtered = apps.filter(item => normalize(item.name).includes(normalize(input.value.trim())));
      count.textContent = String(filtered.length).padStart(2, "0");
      empty.hidden = filtered.length > 0;
      for (const item of filtered) {
        const selected = item.id === currentGame.id;
        const option = menuDocument.createElement("button");
        option.type = "button"; option.className = "map-it-picker-option";
        option.dataset.game = item.id;
        option.tabIndex = -1;
        option.setAttribute("role", "menuitemradio"); option.setAttribute("aria-checked", String(selected));
        option.setAttribute("aria-label", item.name);
        const image = menuDocument.createElement("img");
        image.setAttribute("data-game-art", item.id);
        image.src = `/game-cards/worlds/${item.id}.webp`; image.alt = ""; image.draggable = false;
        image.width = 76; image.height = 42; image.decoding = "async";
        image.onerror = () => { image.onerror = null; image.setAttribute("data-fallback", ""); image.src = gameIcon(item.id); };
        const caption = menuDocument.createElement("span"); caption.className = "map-it-picker-caption";
        const gameName = menuDocument.createElement("span"); gameName.className = "map-it-picker-game-name"; gameName.textContent = item.name;
        caption.append(gameName);
        if (selected && selectedLabel) {
          const status = menuDocument.createElement("span"); status.className = "map-it-picker-status"; status.textContent = selectedLabel;
          caption.append(status);
        }
        const mark = svg(selected ? "m5 12 4 4L19 6" : "M5 12h14 m-5-5 5 5-5 5");
        mark.classList.add("map-it-picker-mark");
        const number = menuDocument.createElement("span"); number.className = "map-it-picker-option-number";
        number.textContent = String(apps.indexOf(item) + 1).padStart(2, "0"); number.setAttribute("aria-hidden", "true");
        option.append(number, image, caption, mark);
        option.onpointerenter = event => { if (event.pointerType === "mouse") showPreview(item); };
        option.onfocus = () => showPreview(item);
        option.onclick = () => {
          close(true);
          if (!selected) window.parent.postMessage({ type: "map-it:select-app", appId: item.id }, location.origin);
        };
        results.append(option);
      }
      const initial = results.querySelector('[aria-checked="true"]') || results.querySelector("button");
      if (initial) initial.tabIndex = 0;
      const previewItem = filtered.find(item => item.id === currentGame.id) || filtered[0];
      preview.hidden = !previewItem;
      delete preview.dataset.game;
      showPreview(previewItem);
    };
    input.addEventListener("input", render);
    render();
    menu.append(heading, preview, field, results, empty);
    if (libraryLabel) {
      const library = menuDocument.createElement("button"); library.type = "button";
      library.className = "map-it-picker-library";
      const label = menuDocument.createElement("span"); label.textContent = libraryLabel;
      library.append(svg("M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z"), label, svg("M5 12h14 m-5-5 5 5-5 5"));
      library.onclick = () => { close(); window.parent.postMessage({ type: "map-it:open-library" }, location.origin); };
      menu.append(library);
    }
    for (const event of ["pointerdown", "mousedown"]) menu.addEventListener(event, stopDrag);
    menu.onkeydown = event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); close(true); return; }
      const options = [...results.querySelectorAll("button")];
      const index = options.indexOf(menuDocument.activeElement);
      const inSearch = menuDocument.activeElement === input;
      let next;
      if (event.key === "ArrowDown") next = (index + 1) % options.length;
      if (event.key === "ArrowUp") next = index < 0 ? options.length - 1 : (index - 1 + options.length) % options.length;
      if (!inSearch && event.key === "Home") next = 0;
      if (!inSearch && event.key === "End") next = options.length - 1;
      if (next !== undefined && options[next]) {
        event.preventDefault();
        options.forEach(option => { option.tabIndex = -1; });
        options[next].tabIndex = 0; options[next].focus();
      }
      if (event.key === "Tab") {
        const focusable = [input, ...options.filter(option => option.tabIndex === 0), ...menu.querySelectorAll(".map-it-picker-library")];
        const current = focusable.indexOf(menuDocument.activeElement);
        const target = focusable[current + (event.shiftKey ? -1 : 1)];
        event.preventDefault();
        if (target) target.focus(); else close(true);
      }
    };
    (menuDocument.getElementById("ow-portal-root") || menuDocument.body).append(menu);
    const bounds = trigger.getBoundingClientRect();
    const frameBounds = menuDocument !== document ? window.frameElement.getBoundingClientRect() : { left: 0, top: 0 };
    const hostWindow = menuDocument.defaultView || window;
    // The imported frame fills the host, including its reserved ad rail.
    const adInset = window.overwolf || params.get("host-ad-rail") === "true" ? 440 : 0;
    const availableRight = Math.min(hostWindow.innerWidth, frameBounds.left + innerWidth) - adInset;
    const panelWidth = Math.min(660, Math.max(0, availableRight - 16));
    const top = bounds.bottom + frameBounds.top + 8;
    menu.style.width = `${panelWidth}px`;
    menu.toggleAttribute("data-compact", panelWidth < 520);
    menu.style.left = `${Math.max(8, Math.min(bounds.left + frameBounds.left, availableRight - panelWidth - 8))}px`;
    menu.style.top = `${top}px`;
    menu.style.maxHeight = `${Math.max(0, Math.min(660, hostWindow.innerHeight - top - 12))}px`;
    trigger.setAttribute("aria-expanded", "true");
    if (menuDocument === document) trigger.setAttribute("aria-controls", menu.id);
    input.focus();
  }
  function mount() {
    if (!currentGame) return;
    if (trigger?.isConnected) return;
    const image = [...document.querySelectorAll("header img")].find(img => new URL(img.src, location.href).pathname === `${app.prefix}/icon.png`);
    if (!image) return;
    const brand = image.closest("button") || image.parentElement;
    brand.setAttribute("data-map-it-brand", "");
    trigger = document.createElement("button"); trigger.type = "button";
    trigger.className = "map-it-picker";
    trigger.setAttribute("data-ow-no-drag", "");
    trigger.setAttribute("aria-label", params.get("picker-label") || currentGame.name);
    trigger.setAttribute("title", currentGame.name);
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    const icon = document.createElement("img"); icon.src = gameIcon(currentGame.id); icon.alt = "";
    const name = document.createElement("span"); name.className = "map-it-picker-name"; name.textContent = currentGame.name;
    const arrow = svg("m6 9 6 6 6-6"); arrow.classList.add("map-it-picker-chevron");
    trigger.append(icon, name, arrow);
    for (const event of ["pointerdown", "mousedown"]) trigger.addEventListener(event, stopDrag);
    trigger.onclick = open;
    trigger.onkeydown = event => { event.stopPropagation(); if (event.key === "ArrowDown") { event.preventDefault(); if (!menu) open(); } };
    brand.before(trigger);
  }
  const outside = event => { if (menu && !menu.contains(event.target) && !trigger.contains(event.target)) close(); };
  document.addEventListener("pointerdown", outside);
  if (menuDocument !== document) menuDocument.addEventListener("pointerdown", outside);
  const resize = () => close();
  window.addEventListener("pagehide", () => {
    close();
    menuDocument.removeEventListener("pointerdown", outside);
    document.removeEventListener("pointerdown", outside);
    window.removeEventListener("resize", resize);
    observer.disconnect();
  }, { once: true });
  window.addEventListener("resize", resize);
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const readRegistry = async path => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Game registry: ${response.status}`);
    return response.json();
  };
  Promise.all([readRegistry("/app-library.json"), readRegistry("/game-library-variants.json")])
    .then(([registry, variants]) => {
      apps = registry.flatMap(item => variants[item.id] || [item]);
      currentGame = apps.find(item => item.id === currentGameId) || apps.find(item => item.id === app.id);
      mount();
    })
    .catch(console.error);
})();

