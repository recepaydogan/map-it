import assert from "node:assert/strict";
import test from "node:test";
import { createMarkerSprites, getMarkerSpriteKey, getMarkerTemplateKey } from "../src/features/map/map-marker-sprites.ts";

function setup(t, ratio = 1) {
  const images = [];
  const canvases = [];
  const replace = (key, value) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else delete globalThis[key];
    });
  };
  replace("Image", class {
    naturalWidth = 1024;
    naturalHeight = 512;
    constructor() { images.push(this); }
  });
  replace("document", { createElement: () => {
    const draws = [];
    const context = { scale() {}, save() {}, restore() {}, beginPath() {}, roundRect() {}, fill() {},
      drawImage: (...args) => draws.push(args) };
    const canvas = { draws, getContext: () => context };
    canvases.push(canvas);
    return canvas;
  } });
  replace("getComputedStyle", () => ({ backgroundColor: "#263238", borderTopColor: "white",
    borderTopWidth: "2px", width: "32px", borderTopLeftRadius: "9999px", color: "white" }));
  replace("XMLSerializer", class { serializeToString() { return "<svg/>"; } });
  const icon = {};
  const elements = new Map();
  const definition = (source, sprite, markerClass = "map-marker-npc") => {
    const appearance = { markerClass, icon, nativeIconPath: source };
    const templateKey = getMarkerTemplateKey(appearance, 2.4);
    elements.set(templateKey, { dataset: { markerTemplate: templateKey },
      querySelector: () => ({ cloneNode: () => ({ setAttribute() {} }) }) });
    return { key: getMarkerSpriteKey(templateKey, source, sprite), templateKey, appearance, sprite, strokeWidth: 2.4 };
  };
  let paints = 0;
  const registry = createMarkerSprites({ querySelectorAll: () => elements.values() }, ratio, () => paints++);
  const finish = async (image) => { image.onload(); await Promise.resolve(); await Promise.resolve(); };
  t.after(() => registry.dispose());
  return { images, canvases, definition, registry, finish, paints: () => paints };
}

test("camera and filter refreshes reuse both loaded and pending artwork", async (t) => {
  const env = setup(t, 2);
  const pin = env.definition("/pin.webp");
  env.registry.update([pin]);
  for (let i = 0; i < 5; i++) env.registry.update([{ ...pin }]);
  assert.equal(env.images.length, 1);
  assert.equal(env.canvases.length, 1);
  assert.equal(env.canvases[0].width, 96);
  await env.finish(env.images[0]);
  for (let i = 0; i < 5; i++) env.registry.update([{ ...pin }]);
  assert.equal(env.canvases[0].draws.length, 1);
  assert.equal(env.paints(), 1);
});

test("different item crops share one atlas request and keep their own UV coordinates", async (t) => {
  const env = setup(t);
  const first = env.definition(undefined, { atlas: "items", u1: 0.25, v1: 0.5, u2: 0.5, v2: 0.75 });
  const second = env.definition(undefined, { atlas: "items", u1: 0.5, v1: 0.25, u2: 0.75, v2: 0.5 });
  env.registry.update([first, second]);
  assert.equal(env.images.length, 1);
  assert.equal(env.images[0].src, "/items/icon-atlases/items.webp");
  await env.finish(env.images[0]);
  assert.deepEqual(env.canvases[0].draws[0].slice(1), [256, 256, 256, 128, 15, 15, 18, 18]);
  assert.deepEqual(env.canvases[1].draws[0].slice(1), [512, 128, 256, 128, 15, 15, 18, 18]);
});

test("artwork which finishes after unmount cannot repaint a disposed surface", async (t) => {
  const env = setup(t);
  env.registry.update([env.definition("/late.webp")]);
  env.registry.dispose();
  await env.finish(env.images[0]);
  assert.equal(env.paints(), 0);
  assert.equal(env.canvases[0].draws.length, 0);
});

test("missing native artwork loads the existing SVG fallback", async (t) => {
  const env = setup(t);
  const originalWarn = console.warn;
  let warnings = 0;
  console.warn = () => warnings++;
  t.after(() => { console.warn = originalWarn; });
  env.registry.update([env.definition("/missing.webp")]);
  env.images[0].onerror();
  await Promise.resolve();
  assert.equal(warnings, 1);
  assert.match(env.images[1].src, /^data:image\/svg\+xml/);
  await env.finish(env.images[1]);
  assert.equal(env.canvases[0].draws.length, 1);
});
