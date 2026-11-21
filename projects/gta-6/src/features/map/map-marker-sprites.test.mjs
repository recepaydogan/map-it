import assert from "node:assert/strict";
import test from "node:test";
import { createMarkerSprites, getMarkerSpriteKey, getMarkerTemplateKey } from "./map-marker-sprites.ts";
import { getMapMarkerIconSize } from "./map-marker-zoom.ts";

function setup(t) {
  const images = [];
  const canvases = [];
  const elements = new Map();
  const replace = (key, value) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else delete globalThis[key];
    });
  };
  replace("Image", class {
    naturalWidth = 32;
    naturalHeight = 32;
    constructor() { images.push(this); }
  });
  replace("document", { createElement: () => {
    const draws = [];
    const stack = [];
    const context = { filter: "none", scale() {},
      save() { stack.push(this.filter); }, restore() { this.filter = stack.pop(); },
      drawImage: (...args) => draws.push(args) };
    const canvas = { draws, getContext: () => context };
    canvases.push(canvas);
    return canvas;
  } });
  replace("getComputedStyle", () => ({ transform: "none", color: "white" }));
  replace("XMLSerializer", class { serializeToString() { return "<svg/>"; } });
  const definition = (path, markerClass = "map-marker-icon-only") => {
    const appearance = { markerClass, itemArt: false, icon: { displayName: "Pin" }, nativeIconPath: path };
    const templateKey = getMarkerTemplateKey(appearance);
    elements.set(templateKey, {
      dataset: { markerTemplate: templateKey },
      querySelector: () => ({ cloneNode: () => ({ setAttribute() {} }) }),
    });
    return { key: getMarkerSpriteKey(appearance), templateKey, appearance };
  };
  const templates = { querySelectorAll: () => elements.values() };
  let paints = 0;
  const create = (definitions, ratio = 1) => createMarkerSprites(templates, definitions, ratio, () => paints++);
  const finish = async (image) => { image.onload(); await Promise.resolve(); };
  return { images, canvases, definition, create, finish, paints: () => paints };
}

test("periodic list refreshes preserve loaded marker artwork without new image requests", async t => {
  const env = setup(t);
  const pin = env.definition("/pin.png");
  const registry = env.create([pin]);
  await env.finish(env.images[0]);
  const sprite = registry.sprites.get(pin.key);
  for (let index = 0; index < 5; index++) {
    registry.update([{ ...pin, appearance: { ...pin.appearance } }]);
    assert.equal(registry.sprites.get(pin.key), sprite);
    assert.equal(sprite.draws.length, 1);
  }
  assert.equal(env.images.length, 1);
  assert.equal(env.canvases.length, 1);
  registry.dispose();
});

test("refreshes during image loading preserve the pending request and its eventual paint", async t => {
  const env = setup(t);
  const pin = env.definition("/pin.png");
  const registry = env.create([pin]);
  const sprite = registry.sprites.get(pin.key);
  registry.update([{ ...pin }]);
  assert.equal(env.images.length, 1);
  await env.finish(env.images[0]);
  assert.equal(registry.sprites.get(pin.key), sprite);
  assert.equal(sprite.draws.length, 1);
  assert.equal(env.paints(), 1);
  registry.dispose();
});

test("filter and appearance changes add new artwork while retaining existing pins", async t => {
  const env = setup(t);
  const first = env.definition("/first.png");
  const registry = env.create([first]);
  await env.finish(env.images[0]);
  const sprite = registry.sprites.get(first.key);
  registry.update([]);
  const second = env.definition("/second.png", "map-marker-icon-only alternate");
  registry.update([second]);
  registry.update([first, second]);
  assert.equal(registry.sprites.get(first.key), sprite);
  assert.equal(sprite.draws.length, 1);
  assert.equal(env.images.length, 2);
  await env.finish(env.images[1]);
  assert.equal(registry.sprites.get(second.key).draws.length, 1);
  registry.dispose();
});

test("device scale changes use fresh canvases and disposed requests cannot repaint", async t => {
  const env = setup(t);
  const pin = env.definition("/pin.png");
  const old = env.create([pin]);
  old.dispose();
  const current = env.create([pin], 2);
  await env.finish(env.images[0]);
  assert.equal(env.paints(), 0);
  assert.equal(old.sprites.get(pin.key).draws.length, 0);
  await env.finish(env.images[1]);
  assert.equal(env.paints(), 1);
  assert.equal(current.sprites.get(pin.key).width, 144);
  assert.notEqual(current.sprites.get(pin.key), old.sprites.get(pin.key));
  current.dispose();
});

test("normal artwork retains selected size and enough source pixels for enlarged markers", async t => {
  const env = setup(t);
  const pin = env.definition("/restaurant.png");
  pin.appearance.itemArt = true;
  const registry = env.create([pin], 1);
  await env.finish(env.images[0]);
  const sprite = registry.sprites.get(pin.key);
  const selectedSize = getMapMarkerIconSize("place-restaurant", false, true, "selected");
  assert.equal(getMapMarkerIconSize("place-restaurant", false, true, "normal"), selectedSize);
  assert.equal(sprite.draws[0][3], selectedSize);
  assert.equal(sprite.draws[0][4], selectedSize);
  assert.equal(sprite.width, 144);
  registry.dispose();
});
