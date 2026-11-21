/* Native hotkey defaults and per-game projection for the imported modules. */
(() => {
  "use strict";
  const parse = binding => {
    const parts = String(binding || "").replaceAll(" ", "").split("+");
    const key = parts.pop()?.toUpperCase();
    const special = { UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39, SPACE: 32, TAB: 9 };
    const virtualKey = /^[A-Z0-9]$/.test(key) ? key.charCodeAt(0) : /^F(?:[1-9]|1[0-2])$/.test(key) ? 111 + Number(key.slice(1)) : special[key];
    if (!virtualKey) return null;
    const modifiers = { ctrl: parts.some(part => /^(?:ctrl|control)$/i.test(part)), alt: parts.some(part => /^alt$/i.test(part)), shift: parts.some(part => /^shift$/i.test(part)) };
    return { virtualKey, modifiers };
  };
  const signature = value => {
    const parsed = typeof value === "string" ? parse(value) : value;
    return parsed ? `${parsed.virtualKey}:${+!!parsed.modifiers.ctrl}:${+!!parsed.modifiers.alt}:${+!!parsed.modifiers.shift}` : "";
  };
  const assigned = item => Boolean(item && !item.IsUnassigned && item.binding?.trim());
  const gameIds = app => app.manifest.data.game_targeting?.game_ids ?? [];
  const pending = new Map();
  function project(result, app) {
    const own = list => (list || []).flatMap(item => Object.entries(app.hotkeys || {}).filter(([, nativeName]) => nativeName === item.name).map(([name]) => ({ ...item, name, title: app.manifest.data.hotkeys?.[name]?.title || item.title })));
    return { ...result, globals: own(result.globals), games: Object.fromEntries(gameIds(app).map(id => [String(id), own(result.games?.[id])])) };
  }
  async function restoreMissing(api, result, app) {
    if (!result?.success || !api.assign) return result;
    const missing = [];
    for (const gameId of gameIds(app)) {
      for (const [name, nativeName] of Object.entries(app.hotkeys || {})) {
        const item = result.games?.[gameId]?.find(key => key.name === nativeName) || result.globals?.find(key => key.name === nativeName);
        if (!assigned(item) && parse(app.manifest.data.hotkeys?.[name]?.default)) missing.push({ name: nativeName, gameId, binding: app.manifest.data.hotkeys[name].default });
      }
    }
    if (!missing.length) return result;
    let all;
    if (api.getAllApps) all = await new Promise(resolve => api.getAllApps(resolve));
    const occupied = gameId => {
      const entries = [...(result.globals || []), ...(result.games?.[gameId] || [])];
      if (all?.success) {
        entries.push(...(all.platform || []));
        for (const item of Object.values(all.apps || {})) entries.push(...(item.globals || []), ...(item.games?.[gameId] || []));
      }
      return new Set(entries.filter(assigned).map(item => signature(item.binding)).filter(Boolean));
    };
    const used = new Map();
    for (const item of missing) {
      const taskKey = `${item.gameId}:${item.name}`;
      if (pending.has(taskKey)) { await pending.get(taskKey); continue; }
      const run = (async () => {
        const reserved = used.get(item.gameId) || occupied(item.gameId);
        used.set(item.gameId, reserved);
        const preferred = parse(item.binding);
        const key = signature(preferred);
        if (reserved.has(key)) return;
        const outcome = await new Promise(resolve => api.assign({ name: item.name, gameId: item.gameId, ...preferred }, resolve));
        if (outcome?.success) reserved.add(key);
      })();
      pending.set(taskKey, run);
      try { await run; } finally { pending.delete(taskKey); }
    }
    return new Promise(resolve => api.get(resolve));
  }
  window.__MAP_IT_HOTKEYS__ = { project, restoreMissing };
})();
