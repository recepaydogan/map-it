export interface InspectorContext { readonly worldId: string | null; readonly edition: string; readonly version: string; readonly dimension: string | null; readonly catalogRevision: string }
export interface InspectorSubject { readonly kind: "poi" | "biome" | "item" | "entity" | "block" | "loot" | "trade" | "enchantment" | "effect" | "advancement" | "recipe" | "tag" | "mechanic" | "tutorial"; readonly id: string }
export interface InspectorEntry { readonly key: number; readonly subject: InspectorSubject }
export interface InspectorViewState { scrollTop: number; focusKey: string | null }
export interface InspectorSnapshot { readonly context: InspectorContext; readonly entries: readonly InspectorEntry[]; readonly notice: "history-limit" | null }

const sameSubject = (left: InspectorSubject, right: InspectorSubject) => left.kind === right.kind && left.id === right.id;
export const sameInspectorContext = (left: InspectorContext, right: InspectorContext): boolean =>
  left.worldId === right.worldId && left.edition === right.edition && left.version === right.version &&
  left.dimension === right.dimension && left.catalogRevision === right.catalogRevision;

/** No camera commands live here: following a knowledge link cannot move the map. */
export const createInspectorController = (initialContext: InspectorContext) => {
  let sequence = 0;
  const freezeSnapshot = (context: InspectorContext, entries: readonly InspectorEntry[], notice: InspectorSnapshot["notice"] = null): InspectorSnapshot => Object.freeze({
    context: Object.freeze({ ...context }),
    entries: Object.freeze(entries.map(entry => Object.freeze({ ...entry, subject: Object.freeze({ ...entry.subject }) }))),
    notice,
  });
  let snapshot = freezeSnapshot(initialContext, []);
  const listeners = new Set<() => void>(), views = new Map<number, InspectorViewState>();
  const validateSubject = (subject: InspectorSubject) => {
    if (!subject || !["poi", "biome", "item", "entity", "block", "loot", "trade", "enchantment", "effect", "advancement", "recipe", "tag", "mechanic", "tutorial"].includes(subject.kind) || typeof subject.id !== "string" || !subject.id.trim() || subject.id.length > 1024)
      throw new Error("Invalid inspector subject");
  };
  const publish = (entries: readonly InspectorEntry[], context = snapshot.context, notice: InspectorSnapshot["notice"] = null) => {
    const retained = new Set(entries.map(entry => entry.key));
    for (const key of views.keys()) if (!retained.has(key)) views.delete(key);
    snapshot = freezeSnapshot(context, entries, notice);
    listeners.forEach(listener => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setContext(context: InspectorContext) {
      if (!sameInspectorContext(snapshot.context, context)) publish([], { ...context });
    },
    open(subject: InspectorSubject) {
      validateSubject(subject);
      if (snapshot.entries.length === 1 && sameSubject(snapshot.entries[0].subject, subject)) return;
      publish([{ key: ++sequence, subject: { ...subject } }]);
    },
    navigate(fromKey: number, subject: InspectorSubject) {
      validateSubject(subject);
      const index = snapshot.entries.findIndex(entry => entry.key === fromKey);
      if (index === -1) return; // A late action from an unmounted/world-switched panel is obsolete.
      const current = snapshot.entries.at(-1)!;
      if (index < snapshot.entries.length - 1 && sameSubject(current.subject, subject)) {
        publish(snapshot.entries.slice(0, index + 1)); return;
      }
      const ancestors = snapshot.entries.slice(0, index + 1);
      const previous = ancestors.findIndex(entry => sameSubject(entry.subject, subject));
      if (previous !== -1) { if (previous !== snapshot.entries.length - 1) publish(ancestors.slice(0, previous + 1)); return; }
      // At the safety bound retain the originating panel instead of losing the return path.
      if (ancestors.length >= 64) {
        if (snapshot.notice !== "history-limit") publish(snapshot.entries, snapshot.context, "history-limit");
        return;
      }
      publish([...ancestors, { key: ++sequence, subject: { ...subject } }]);
    },
    back() { if (snapshot.entries.length) publish(snapshot.entries.slice(0, -1)); },
    closeCompanion() { if (snapshot.entries.length > 1) publish(snapshot.entries.slice(0, 1)); },
    close() { if (snapshot.entries.length) publish([]); },
    saveView(key: number, state: InspectorViewState) {
      if (!Number.isFinite(state.scrollTop) || state.scrollTop < 0 || state.focusKey !== null && (typeof state.focusKey !== "string" || state.focusKey.length > 2048))
        throw new Error("Invalid inspector view state");
      if (snapshot.entries.some(entry => entry.key === key)) views.set(key, { ...state });
    },
    getView(key: number): InspectorViewState { return { ...(views.get(key) ?? { scrollTop: 0, focusKey: null }) }; },
  };
};

export type InspectorController = ReturnType<typeof createInspectorController>;
