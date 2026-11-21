import assert from "node:assert/strict";
import { build } from "esbuild";

class MemoryStorage {
  #items = new Map();
  getItem(key) { return this.#items.get(key) ?? null; }
  setItem(key, value) { this.#items.set(key, String(value)); }
  clear() { this.#items.clear(); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = new EventTarget();
const compiled = await build({
  entryPoints: ["src/features/onboarding/new-page-badges.ts"],
  bundle: true, write: false, platform: "node", format: "esm",
  plugins: [{ name: "react-stub", setup(bundler) {
    bundler.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "stub" }));
    bundler.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const useSyncExternalStore = (_subscribe, snapshot) => snapshot();" }));
  } }],
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`;

localStorage.setItem("gm:onboarded-v2", "1");
const existing = await import(`${moduleUrl}#existing`);
assert.equal(existing.useNewPageBadge("wings"), true);
assert.equal(existing.useNewPageBadge("events"), true);
assert.equal(existing.useNewPageBadge("profile"), true);
for (const page of ["quests", "titles", "activities", "achievements"]) {
  assert.equal(existing.useNewPageBadge(page), true);
}
existing.markNewPageVisited("wings");
existing.markNewPageVisited("events");
existing.markNewPageVisited("quests");
existing.markNewPageVisited("activities");
assert.equal(existing.useNewPageBadge("wings"), false);
assert.equal(existing.useNewPageBadge("events"), false);
const reopened = await import(`${moduleUrl}#reopened`);
assert.equal(reopened.useNewPageBadge("wings"), false);
assert.equal(reopened.useNewPageBadge("events"), false);
assert.equal(reopened.useNewPageBadge("profile"), true);
assert.equal(reopened.useNewPageBadge("quests"), false);
assert.equal(reopened.useNewPageBadge("titles"), true);
assert.equal(reopened.useNewPageBadge("activities"), false);
assert.equal(reopened.useNewPageBadge("achievements"), true);
reopened.markNewPageVisited("profile");
assert.equal(reopened.useNewPageBadge("profile"), false);

localStorage.clear();
const newUser = await import(`${moduleUrl}#new-user`);
assert.equal(newUser.useNewPageBadge("wings"), false);
assert.equal(newUser.useNewPageBadge("events"), false);
for (const page of ["quests", "titles", "activities", "achievements"]) {
  assert.equal(newUser.useNewPageBadge(page), true);
}
localStorage.setItem("gm:onboarded-v2", "1");
const afterTour = await import(`${moduleUrl}#after-tour`);
assert.equal(afterTour.useNewPageBadge("wings"), false);
assert.equal(afterTour.useNewPageBadge("events"), false);
assert.equal(afterTour.useNewPageBadge("profile"), false);

localStorage.clear();
localStorage.setItem("gm:onboarded-v2", "1");
localStorage.setItem("gm:new-page-badges-v1", JSON.stringify({ wings: false, profile: false }));
const migrated = await import(`${moduleUrl}#migrated`);
assert.equal(migrated.useNewPageBadge("wings"), false);
assert.equal(migrated.useNewPageBadge("profile"), false);
assert.equal(migrated.useNewPageBadge("events"), true);
for (const page of ["quests", "titles", "activities", "achievements"]) {
  assert.equal(migrated.useNewPageBadge(page), true);
  migrated.markNewPageVisited(page);
  assert.equal(migrated.useNewPageBadge(page), false);
}
migrated.markNewPageVisited("events");
assert.equal(JSON.parse(localStorage.getItem("gm:new-page-badges-v1")).events, false);
assert.equal(JSON.parse(localStorage.getItem("gm:new-page-badges-v1")).achievements, false);

console.log("New page badge tests passed.");
