import assert from "node:assert/strict";
import { createBiomeCanvas } from "../src/features/generation/biome-canvas.ts";
import { createBiomePanCache, exposedPanStrips } from "../src/features/generation/biome-pan-cache.ts";
import { createBiomeCanopySampler, shadeBiomeCanopy } from "../src/features/generation/biome-canopy.ts";
import { biomeRasterColor, createBiomeRasterPalette } from "../src/features/generation/biome-raster-color.ts";
import { shadeBiomeRasterColor } from "../src/features/generation/biome-raster-color.ts";
import { createBiomeRelief } from "../src/features/generation/biome-relief.ts";
import { worldMarkerCameraTarget } from "../src/features/worlds/world-marker-camera.ts";
import { createWorldMapFrames, shouldPublishWorldMapState, worldMapCameraTransform } from "../src/features/worlds/world-map-frames.ts";

const original = Object.fromEntries(["window", "document", "Element", "ResizeObserver", "requestAnimationFrame", "cancelAnimationFrame"].map(key => [key, globalThis[key]]));
let resize, sequence = 0, frames = new Map(), contexts = [];
const context = () => {
  const value = { calls: [], globalAlpha: 1, setTransform(...args) { this.calls.push(["transform", ...args]); }, fillRect(...args) { this.calls.push(["fill", ...args]); }, strokeRect() {}, beginPath() {},
    moveTo() {}, lineTo() {}, stroke() {}, save() {}, restore() {}, rect() {}, clip() {}, drawImage(...args) { this.calls.push(["draw", this.globalAlpha, ...args]); },
    createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
    putImageData(image) { this.image = image; } };
  contexts.push(value); return value;
};
class FakeElement extends EventTarget {}
class Surface extends FakeElement {
  isConnected = true; clicks = 0;
  closest(selector) { return selector === "[data-world-map-pan-target]" ? this : null; }
  contains(target) { return target === this; }
  focus() {} click() { this.clicks++; }
}
class Canvas extends FakeElement {
  width = 0; height = 0; style = {}; ctx = context();
  parentElement = new Surface();
  getContext() { return this.ctx; }
  getBoundingClientRect() { return { width: 256, height: 256, left: 0, top: 0 }; }
  focus() {} setPointerCapture() {}
}
Object.assign(globalThis, {
  window: { devicePixelRatio: 2, matchMedia: () => ({ matches: false }) }, document: { createElement: () => new Canvas() }, Element: FakeElement,
  ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} disconnect() {} },
  requestAnimationFrame: callback => { frames.set(++sequence, callback); return sequence; }, cancelAnimationFrame: id => frames.delete(id),
});
const flush = (time = performance.now()) => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(time)); };
const settleZoom = async () => { await new Promise(resolve => setTimeout(resolve, 115)); flush(); };
const tick = () => new Promise(resolve => setTimeout(resolve, 100));
const scope = { worldId: "fixture", sourceId: "fixture", dimension: "0", revision: 1 };
const fixture = (initial, keepZoomCentered) => {
  frames.clear(); contexts = [];
  const canvas = new Canvas(), states = [], painted = [], requests = [], manual = [], selections = [], cursors = [];
  const request = (requested, ranges, signal, relief) => new Promise((resolve, reject) => requests.push({ requested, ranges, signal, relief, resolve, reject }));
  const source = { generate: (requested, ranges, signal) => request(requested, ranges, signal, false),
    generateRelief: (requested, ranges, signal) => request(requested, ranges, signal, true) };
  const renderer = createBiomeCanvas(canvas, source, scope, { 14: "#123456" }, (state, painting) => { states.push(state); if (painting) painted.push(state); }, initial,
    () => manual.push(true), selection => selections.push(selection), cursor => cursors.push(cursor), {}, keepZoomCentered);
  resize();
  const complete = async (index = requests.length - 1) => {
    requests[index].resolve(requests[index].ranges.map(range => requests[index].relief
      ? { range, relief: new Int8Array(range.width * range.height).fill(12) }
      : { range, biomes: new Uint16Array(range.width * range.height).fill(14) }));
    await Promise.resolve(); await Promise.resolve(); flush();
  };
  const drain = async () => {
    for (let index = 0; states.at(-1).ready < states.at(-1).total && index < 128; index++) {
      assert(requests[index], "A detail request must be scheduled"); await complete(index);
    }
    assert.equal(states.at(-1).ready, states.at(-1).total);
  };
  return { canvas, renderer, states, painted, requests, complete, drain, manual, selections, cursors };
};
let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
try {
  await check("clicks, small pointer jitter and cancelled presses preserve follow until a real drag", async () => {
    const f = fixture({ x: 10, z: 20, zoom: 1 });
    const pointer = (type, x, y, pointerId = 7) => {
      const event = new Event(type); Object.assign(event, { pointerId, button: 0, clientX: x, clientY: y });
      f.canvas.dispatchEvent(event);
    };
    try {
      flush();
      pointer("pointerdown", 100, 100); pointer("pointerup", 100, 100);
      pointer("pointerdown", 100, 100); pointer("pointermove", 103, 100); pointer("pointerup", 103, 100); flush();
      assert.equal(f.manual.length, 0);
      assert.equal(f.states.at(-1).x, 10); assert.equal(f.states.at(-1).z, 20);
      pointer("pointerdown", 100, 100); pointer("pointercancel", 100, 100);
      assert.equal(f.manual.length, 0);
      pointer("pointerdown", 100, 100);
      f.renderer.center(40, 50);
      pointer("pointermove", 108, 100, 8); assert.equal(f.manual.length, 0, "Ignore other pointers");
      pointer("pointermove", 108, 100); pointer("pointermove", 110, 100); flush();
      assert.equal(f.manual.length, 1);
      assert.equal(f.states.at(-1).x, 30, "Drag starts from the latest followed camera");
      assert.equal(f.states.at(-1).z, 50);
      pointer("pointerup", 110, 100); flush();
      assert.equal(f.states.at(-1).panning, false);
    } finally { f.renderer.dispose(); }
  });
  await check("first paint starts at 400 percent without a player and later follow preserves user zoom", async () => {
    const f = fixture({ x: -200, z: 80, zoom: 1 });
    try {
      flush(); assert.equal(f.states.at(-1).zoom, 1);
      f.renderer.zoom(2); flush(); assert.equal(f.states.at(-1).zoom, 2);
      f.renderer.center(-300, 120); flush(); assert.equal(f.states.at(-1).zoom, 2);
      assert.equal(f.manual.length, 0);
    } finally { f.renderer.dispose(); }
  });
  await check("buttons, wheel and keyboard zoom retain follow and its camera anchor", async () => {
    const f = fixture({ x: -200, z: 80, zoom: 1 }, () => true);
    try {
      f.renderer.zoom(2); flush(); assert.equal(f.states.at(-1).zoom, 2);
      const wheel = new Event("wheel", { cancelable: true });
      Object.assign(wheel, { deltaY: 100, clientX: 240, clientY: 20 });
      f.canvas.dispatchEvent(wheel); flush();
      assert(f.states.at(-1).zoom < 2);
      for (const key of ["+", "-"]) {
        const event = new Event("keydown"); Object.assign(event, { key }); f.canvas.dispatchEvent(event); flush();
      }
      assert.equal(f.states.at(-1).x, -200); assert.equal(f.states.at(-1).z, 80);
      assert.equal(f.manual.length, 0, "Zoom must not disable follow");
      const down = new Event("pointerdown"); Object.assign(down, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      f.canvas.dispatchEvent(down);
      assert.equal(f.manual.length, 0, "Pressing without dragging must preserve follow");
      const move = new Event("pointermove"); Object.assign(move, { pointerId: 1, clientX: 108, clientY: 100 });
      f.canvas.dispatchEvent(move);
      assert.equal(f.manual.length, 1, "Manual panning still releases follow");
    } finally { f.renderer.dispose(); }
  });
  await check("pan strips cover every newly exposed pixel in all directions", () => {
    for (const [x, y] of [[12, 0], [-12, 0], [0, 8], [0, -8], [12, -8], [-12, 8], [0.25, -0.5]]) {
      const strips = exposedPanStrips(64, 48, x, y, 2);
      for (const strip of strips) assert(strip.x >= 0 && strip.y >= 0 && strip.x + strip.width <= 64 && strip.y + strip.height <= 48);
      for (let py = 0.25; py < 48; py += 0.5) for (let px = 0.25; px < 64; px += 0.5) {
        if (px < x || py < y || px >= 64 + x || py >= 48 + y)
          assert(strips.some(s => px >= s.x && py >= s.y && px < s.x + s.width && py < s.y + s.height));
      }
    }
    assert.deepEqual(exposedPanStrips(64, 48, 0, 0, 2), []);
  });
  await check("pan snapshots retain one original image and invalidate on every projection change", () => {
    const canvas = new Canvas(); canvas.width = 512; canvas.height = 512;
    const view = { x: 0, z: 0, zoom: 1, width: 256, height: 256, ratio: 2, blockY: 64 };
    const cache = createBiomePanCache(canvas);
    assert.equal(cache.prepare(view, true), null);
    cache.complete(view, false);
    const first = cache.prepare({ ...view, x: -10 }, true);
    assert.equal(first.x, 10);
    cache.complete({ ...view, x: -10 }, true);
    const second = cache.prepare({ ...view, x: -20 }, true);
    assert.equal(second.canvas, first.canvas);
    assert.equal(second.x, 20, "Translate from the sharp original, not the last resampled frame");
    for (const patch of [{ zoom: 2 }, { ratio: 1 }, { width: 300 }, { height: 300 }, { blockY: 32 }, { x: 100 }]) {
      cache.complete(view, false);
      assert.equal(cache.prepare({ ...view, ...patch }, true), null);
    }
    cache.complete(view, false);
    assert.equal(cache.prepare({ ...view, x: -10 }, false), null, "Release must repaint from tiles");
    cache.complete(view, false); cache.clear();
    assert.equal(cache.prepare(view, true), null);
  });
  await check("manual dragging draws fewer tiles and releasing refreshes the whole viewport", async () => {
    const f = fixture();
    const pointer = (type, x, y) => { const event = new Event(type); Object.assign(event, { pointerId: 7, button: 0, clientX: x, clientY: y }); f.canvas.dispatchEvent(event); };
    try {
      flush(); await tick(); await f.drain();
      f.canvas.ctx.calls.length = 0; f.renderer.center(1, 1); flush();
      const fullDraws = f.canvas.ctx.calls.filter(c => c[0] === "draw").length;
      pointer("pointerdown", 128, 128); pointer("pointermove", 136, 132);
      f.canvas.ctx.calls.length = 0; flush();
      const panDraws = f.canvas.ctx.calls.filter(c => c[0] === "draw").length;
      assert(panDraws < fullDraws, `${panDraws} pan draws should be fewer than ${fullDraws} full draws`);
      assert.equal(f.painted.at(-1).x, 1 - 8 / 0.25);
      assert.equal(f.painted.at(-1).z, 1 - 4 / 0.25);
      pointer("pointerup", 136, 132); f.canvas.ctx.calls.length = 0; flush();
      assert.equal(f.painted.at(-1).panning, false);
      assert(f.canvas.ctx.calls.filter(c => c[0] === "draw").length > panDraws);
    } finally { f.renderer.dispose(); }
  });
  await check("cached canopy shading keeps the exact world-anchored colors", async () => {
    const style = { density: 0.55, spacing: 11, radius: 5 };
    const sample = createBiomeCanopySampler(), base = [54, 104, 69];
    for (let z = -20; z < 20; z++) for (let x = -20; x < 20; x++) {
      const color = shadeBiomeCanopy(base, 6, x + 0.25, z - 0.5, style);
      assert.deepEqual(sample(base, 6, x + 0.25, z - 0.5, style), color);
    }
  });
  await check("zoom frames keep markers at world coordinates and retain their screen size", async () => {
    const anchor = { x: -200, z: 400, zoom: 0.25, width: 1024, height: 768, panning: false, zooming: false,
      ready: 8, total: 8, scale: 4, error: false, biomeIds: [1] };
    const point = { x: 1200, z: -300 };
    let published = anchor, commits = 0;
    for (let index = 1; index <= 120; index++) {
      const current = { ...anchor, x: -200 + index * 5, z: 400 - index * 2,
        zoom: 0.25 + index / 120 * 0.75, zooming: index < 120 };
      const transform = worldMapCameraTransform(anchor, current);
      const anchorX = anchor.width / 2 + (point.x - anchor.x) * anchor.zoom;
      const anchorZ = anchor.height / 2 + (point.z - anchor.z) * anchor.zoom;
      assert(Math.abs(anchorX * transform.scale + transform.x - (current.width / 2 + (point.x - current.x) * current.zoom)) < 1e-8);
      assert(Math.abs(anchorZ * transform.scale + transform.z - (current.height / 2 + (point.z - current.z) * current.zoom)) < 1e-8);
      assert(Math.abs(40 * transform.scale * (1 / transform.scale) - 40) < 1e-8);
      if (shouldPublishWorldMapState(published, current)) { published = current; commits++; }
    }
    assert.equal(commits, 1, "Intermediate zoom scales must not rebuild or recluster markers");
    assert.equal(published.zoom, 1);
  });
  await check("zoom applies the full pointer-anchored step immediately and defers generation", async () => {
    const f = fixture(); try {
      flush();
      const anchorX = (192 - 128) / 0.25, anchorZ = (80 - 128) / 0.25;
      f.renderer.zoom(2, 192, 80);
      flush();
      assert.equal(f.states.at(-1).zoom, 0.5);
      assert.equal(f.states.at(-1).zooming, true);
      assert(Math.abs(128 + (anchorX - f.states.at(-1).x) * 0.5 - 192) < 1e-8);
      assert(Math.abs(128 + (anchorZ - f.states.at(-1).z) * 0.5 - 80) < 1e-8);
      assert.equal(f.requests.length, 0, "The gesture must not submit intermediate tile scales");
      f.renderer.zoom(2, 192, 80); flush();
      assert.equal(f.states.at(-1).zoom, 1);
      assert.equal(f.states.at(-1).zooming, true);
      assert(Math.abs(128 + (anchorX - f.states.at(-1).x) - 192) < 1e-8);
      await settleZoom();
      assert.equal(f.states.at(-1).zooming, false);
      await tick(); assert(f.requests.length > 0, "The settled viewport must still generate detail");
    } finally { f.renderer.dispose(); }
  });
  await check("wheel reversals and zoom limits take effect without animation", async () => {
    const f = fixture(); try {
      flush();
      const wheel = deltaY => { const event = new Event("wheel", { cancelable: true });
        Object.assign(event, { deltaY, clientX: 128, clientY: 128 }); return event; };
      const first = wheel(-100); f.canvas.dispatchEvent(first); assert(first.defaultPrevented);
      flush();
      assert(Math.abs(f.states.at(-1).zoom - 0.25 * Math.exp(0.3)) < 1e-12);
      f.canvas.dispatchEvent(wheel(100)); flush();
      assert(Math.abs(f.states.at(-1).zoom - 0.25) < 1e-12);
      f.renderer.zoom(1000); flush(); assert.equal(f.states.at(-1).zoom, 8);
      f.renderer.zoom(2); flush(); assert.equal(f.states.at(-1).zoom, 8);
      f.renderer.zoom(0.00001); flush(); assert.equal(f.states.at(-1).zoom, 1 / 64);
    } finally { f.renderer.dispose(); }
  });
  await check("wheel input above a marker delegates to the same immediate zoom", async () => {
    const f = fixture(); try {
      flush();
      const event = new Event("wheel", { cancelable: true });
      Object.assign(event, { deltaY: -100, clientX: 128, clientY: 128 });
      f.canvas.parentElement.dispatchEvent(event);
      assert(event.defaultPrevented); flush(); assert.equal(f.states.at(-1).zooming, true);
      assert(Math.abs(f.states.at(-1).zoom - 0.25 * Math.exp(0.3)) < 1e-12);
    } finally { f.renderer.dispose(); }
  });
  await check("manual drag, reset, hiding and disposal cancel an unfinished zoom", async () => {
    const f = fixture(); try {
      flush(); f.renderer.zoom(4); flush();
      const current = f.states.at(-1).zoom;
      const pointer = new Event("pointerdown"); Object.assign(pointer, { pointerId: 7, button: 0, clientX: 128, clientY: 128 });
      f.canvas.dispatchEvent(pointer); flush();
      assert.equal(f.states.at(-1).zooming, true, "A click must not interrupt zoom");
      const move = new Event("pointermove"); Object.assign(move, { pointerId: 7, clientX: 136, clientY: 128 });
      f.canvas.dispatchEvent(move); flush();
      assert.equal(f.states.at(-1).zoom, current); assert.equal(f.states.at(-1).zooming, false);
      f.renderer.zoom(2); f.renderer.reset(); flush(); assert.equal(f.states.at(-1).zoom, 0.25);
      f.renderer.zoom(4); f.renderer.setActive(false); f.renderer.setActive(true); flush();
      assert.equal(f.states.at(-1).zoom, 1); assert.equal(f.states.at(-1).zooming, false);
      f.renderer.zoom(2); f.renderer.dispose(); assert.equal(frames.size, 0);
    } finally { f.renderer.dispose(); }
  });
  await check("fractional follow movement shifts terrain continuously while close pixels stay sharp", async () => {
    const f = fixture(); try {
      await tick(); await f.complete(0);
      const firstImage = f.canvas.ctx.calls.filter(call => call[0] === "draw").at(-1)?.[2];
      assert(firstImage, "A cached tile must be available for the follow frame");
      const drawX = () => f.canvas.ctx.calls.filter(call => call[0] === "draw" && call[2] === firstImage).at(-1)?.[3];
      f.renderer.center(0.25, 0); flush();
      const firstX = drawX();
      f.renderer.center(0.5, 0); flush();
      assert.equal(drawX() - firstX, -0.25 * 0.25,
        "Subpixel camera movement must not be snapped to device pixels");
      assert.equal(f.canvas.ctx.imageSmoothingEnabled, true);
      f.renderer.zoom(32); flush();
      assert.equal(f.canvas.ctx.imageSmoothingEnabled, false);
    } finally { f.renderer.dispose(); }
  });
  await check("reduced motion uses the same instant pointer-anchored zoom", async () => {
    const previousMatchMedia = window.matchMedia; window.matchMedia = () => ({ matches: true });
    const f = fixture(); try {
      f.renderer.zoom(2, 192, 80); flush();
      assert.equal(f.states.at(-1).zoom, 0.5); assert.equal(f.states.at(-1).zooming, true);
      assert.equal(f.states.at(-1).x, 128); assert.equal(f.states.at(-1).z, -96);
    } finally { f.renderer.dispose(); window.matchMedia = previousMatchMedia; }
  });
  await check("close-detail bitmaps are prepared after input settles", async () => {
    const f = fixture(); try {
      f.renderer.zoom(7.5); await settleZoom(); await tick(); await f.drain();
      const countCloseRasters = () => contexts.filter(context => context.image?.width === 256).length;
      const initial = countCloseRasters(); assert.equal(initial, 0);
      f.renderer.zoom(2); flush();
      assert.equal(countCloseRasters(), initial, "Crossing the detail threshold must not rasterize tiles during the gesture");
      await settleZoom(); assert.equal(countCloseRasters(), initial, "Settlement paints retained pixels before refinement tasks");
      await tick(); assert(countCloseRasters() > initial, "High-resolution detail must still arrive after settlement");
    } finally { f.renderer.dispose(); }
  });
  await check("camera frames bypass workspace publication during drag and publish the settled camera", async () => {
    const base = { x: 0, z: 0, zoom: 0.25, width: 1024, height: 768, panning: false,
      ready: 8, total: 8, scale: 4, error: false, biomeIds: [1, 14] };
    const frames = createWorldMapFrames();
    let notifications = 0, cursorNotifications = 0, published = base, commits = 0;
    const unsubscribe = frames.subscribeView(() => { notifications++; });
    const unsubscribeCursor = frames.subscribeCursor(() => { cursorNotifications++; });
    frames.publishView(base);
    for (let index = 1; index <= 120; index++) {
      const next = { ...base, x: index * 8, z: -index * 4, panning: index < 120 };
      if (shouldPublishWorldMapState(published, next)) { published = next; commits++; }
      frames.publishView(next);
      assert.equal(frames.getView().x, next.x, "Moving overlays must see the exact painted camera");
    }
    assert.equal(commits, 2, "Only pan entry and settlement should rebuild the workspace");
    assert.equal(notifications, 121);
    assert.equal(published.x, 960); assert.equal(published.panning, false);
    const stationary = { ...published, biomeIds: [...published.biomeIds] };
    assert.equal(shouldPublishWorldMapState(published, stationary), false, "Tile fades must not rebuild markers");
    frames.publishView(stationary); assert.equal(notifications, 121);
    frames.publishCursor({ biomeId: 14, x: 100, y: 64, z: -20, scale: 4 });
    assert.equal(cursorNotifications, 1); assert.equal(notifications, 121, "Cursor updates are isolated from the camera");
    frames.publishCursor(null); assert.equal(frames.getCursor(), null);
    unsubscribe(); unsubscribeCursor();
    frames.publishView(base); frames.publishCursor(null);
    assert.equal(notifications, 121); assert.equal(cursorNotifications, 2);
  });
  await check("zoom, resize, new tiles and errors still publish without a camera gesture", async () => {
    const base = { x: 0, z: 0, zoom: 0.25, width: 1024, height: 768, panning: false,
      ready: 8, total: 8, scale: 4, error: false, biomeIds: [1] };
    for (const change of [{ zoom: 0.5 }, { width: 800 }, { height: 600 }, { ready: 9, total: 9 },
      { scale: 1 }, { error: true }, { biomeIds: [1, 14] }, { x: 1024 }, { z: -1024 }]) {
      assert(shouldPublishWorldMapState(base, { ...base, ...change }));
    }
    assert.equal(shouldPublishWorldMapState(base, { ...base, x: 40, z: -80 }), false,
      "Small follow frames must not rebuild the marker tree");
    assert(shouldPublishWorldMapState(null, base));
    assert(shouldPublishWorldMapState({ ...base, panning: true }, { ...base, panning: true, zoom: 0.5 }));
    assert(shouldPublishWorldMapState({ ...base, panning: true }, { ...base, panning: true, width: 800 }));
  });
  await check("selected marker lands 72px beside its panel at the existing zoom", async () => {
    const view = { width: 1024, zoom: 0.25 };
    const target = worldMarkerCameraTarget(1000, 500, view, 0, 372);
    assert.equal(view.width / 2 + (1000 - target.x) * view.zoom, 372 + 72);
    assert.equal(target.z, 500);
  });
  await check("selected-marker pan glides at a fixed zoom and manual zoom cancels it", async () => {
    const f = fixture(); try {
      flush();
      const started = performance.now();
      f.renderer.panTo(624, 0, 400);
      flush(started + 200);
      assert(f.states.at(-1).x > 0 && f.states.at(-1).x < 624);
      assert.equal(f.states.at(-1).zoom, 0.25);
      assert.equal(f.states.at(-1).panning, true);
      flush(started + 500);
      assert.equal(f.states.at(-1).x, 624);
      assert.equal(f.states.at(-1).panning, false);
      f.renderer.panTo(1200, 0, 400);
      f.renderer.zoom(2);
      await settleZoom();
      assert.equal(f.states.at(-1).x, 624);
      assert.equal(f.states.at(-1).zoom, 0.5);
    } finally { f.renderer.dispose(); }
  });
  await check("rapid drag publishes one final camera per paint without a trailing overlay frame", async () => {
    const f = fixture(); try {
      flush(); const initial = f.painted.length, initialStates = f.states.length;
      const pointer = (type, x, y) => { const event = new Event(type); Object.assign(event, { pointerId: 7, button: 0, clientX: x, clientY: y }); return event; };
      f.canvas.dispatchEvent(pointer("pointerdown", 128, 128));
      for (let index = 1; index <= 20; index++) f.canvas.dispatchEvent(pointer("pointermove", 128 + index, 128 - index));
      assert.equal(f.painted.length, initial);
      assert.equal(f.states.length, initialStates, "High-rate pointer moves must not repeatedly plan or publish before paint");
      flush(); assert.equal(f.painted.length, initial + 1);
      assert.equal(f.painted.at(-1).x, -80); assert.equal(f.painted.at(-1).z, 80);
      assert.equal(f.painted.at(-1).zoom, 0.25);
      assert.equal(f.painted.at(-1).panning, true);
      f.canvas.dispatchEvent(pointer("pointerup", 148, 108));
      flush(); assert.equal(f.painted.length, initial + 2);
      assert.equal(f.painted.at(-1).panning, false);
    } finally { f.renderer.dispose(); }
  });
  await check("marker gestures delegate to the canvas while stationary presses still activate the marker", async () => {
    const f = fixture(); try {
      flush();
      const pointer = (type, x, y) => { const event = new Event(type, { cancelable: true }); Object.assign(event,
        { pointerId: 9, button: 0, clientX: x, clientY: y }); return event; };
      const marker = f.canvas.parentElement;
      const clickDown = pointer("pointerdown", 120, 120); marker.dispatchEvent(clickDown);
      f.canvas.dispatchEvent(pointer("pointerup", 120, 120));
      assert(clickDown.defaultPrevented); assert.equal(marker.clicks, 1); assert.equal(f.selections.length, 0);
      assert.equal(f.manual.length, 0, "A marker click must not release follow");

      marker.dispatchEvent(pointer("pointerdown", 120, 120));
      f.canvas.dispatchEvent(pointer("pointermove", 136, 120)); flush();
      f.canvas.dispatchEvent(pointer("pointerup", 136, 120)); flush();
      assert.equal(marker.clicks, 1, "Dragging from a marker must not activate it");
      assert.equal(f.manual.length, 1, "A marker drag releases follow once");
      assert.equal(f.states.at(-1).x, -64); assert.equal(f.states.at(-1).panning, false);
    } finally { f.renderer.dispose(); }
  });
  await check("canvas paints owned source colors with opaque alpha and smoothed overview tiles", async () => {
    const f = fixture(); try {
      await tick(); assert.equal(f.requests[0].requested, scope);
      await f.complete();
      assert.equal(f.canvas.width, 512); assert.equal(f.canvas.height, 512);
      assert.equal(f.canvas.ctx.imageSmoothingEnabled, true);
      assert(contexts.some(ctx => ctx.image && Math.abs(ctx.image.data[0] - 0x12) <= 12 && Math.abs(ctx.image.data[1] - 0x34) <= 12
        && Math.abs(ctx.image.data[2] - 0x56) <= 12 && ctx.image.data[3] === 255));
      assert(f.canvas.ctx.calls.some(call => call[0] === "draw"));
      assert(f.canvas.ctx.calls.some(call => call[0] === "draw" && call[1] >= 0 && call[1] < 1), "New tiles should ease in over retained pixels");
      assert(f.states.at(-1).ready < f.states.at(-1).total, "Coarse preview paints before detail completes");
      await f.drain();
      assert.deepEqual(f.states.at(-1).biomeIds, [14]); assert(Object.isFrozen(f.states.at(-1).biomeIds));
      await tick();
      const firstRelief = f.requests.findIndex(request => request.relief);
      assert(firstRelief > 0 && f.requests.slice(0, firstRelief).every(request => !request.relief),
        "Relief work must wait until fast base tiles are ready");
      await f.complete(firstRelief);
      assert(f.canvas.ctx.calls.filter(call => call[0] === "draw").length >= 2, "Relief should crossfade over its base tile");
    } finally { f.renderer.dispose(); }
  });
  await check("new flat zoom tiles cannot cover retained 2.5D relief", async () => {
    const f = fixture(); try {
      await tick(); await f.drain(); await tick();
      const firstRelief = f.requests.findIndex(request => request.relief);
      assert(firstRelief >= 0);
      await f.complete(firstRelief);
      const retainedRelief = contexts.at(-1);
      f.renderer.zoom(2); await settleZoom(); await tick();
      const replacement = f.requests.findIndex(request => !request.relief && request.ranges[0].scale === 1);
      assert(replacement >= 0, "Zooming in must request sharper base tiles");
      const before = f.canvas.ctx.calls.length;
      await f.complete(replacement);
      const newFlat = contexts.at(-1);
      const draws = f.canvas.ctx.calls.slice(before).filter(call => call[0] === "draw");
      const flatIndex = draws.findIndex(call => call[2]?.ctx === newFlat);
      const reliefIndex = draws.findLastIndex(call => call[2]?.ctx === retainedRelief);
      assert(flatIndex >= 0 && reliefIndex > flatIndex,
        "Retained relief must paint above newly generated flat tiles until sharper relief is ready");
    } finally { f.renderer.dispose(); }
  });
  await check("cartographic color texture is deterministic, bounded, varied and free of square seams", async () => {
    const palette = createBiomeRasterPalette({ 1: "#68d83a" });
    const base = palette.get(1); assert(base);
    assert.deepEqual(biomeRasterColor(base, 1, 64, -128), biomeRasterColor(base, 1, 64, -128));
    assert.notDeepEqual(biomeRasterColor(base, 1, 0, 0), biomeRasterColor(base, 1, 384, 0));
    assert(biomeRasterColor([2, 252, 128], 1, 0, 0).every(value => value >= 0 && value <= 255));
    for (const boundary of [32, 128]) {
      const samples = [boundary - 1, boundary, boundary + 1].map(x => biomeRasterColor(base, 1, x, 19)[0]);
      assert(Math.max(...samples) - Math.min(...samples) <= 1, `A visible tone seam remains at ${boundary}`);
    }
    const shades = Array.from({ length: 1024 }, (_, index) => biomeRasterColor(base, 1, index, 73)[0]);
    assert(Math.max(...shades) - Math.min(...shades) <= 6, "Decorative texture must remain subordinate to biome colors");
    const close = Array.from({ length: 64 }, (_, index) => biomeRasterColor(base, 1, index, 73, "close")[0]);
    const overview = Array.from({ length: 64 }, (_, index) => biomeRasterColor(base, 1, index, 73)[0]);
    assert(Math.max(...close) - Math.min(...close) > Math.max(...overview) - Math.min(...overview),
      "Close detail should add fine-scale definition");
    assert(Math.max(...close) - Math.min(...close) <= 12, "Close detail must remain subordinate to biome colors");
    assert.throws(() => createBiomeRasterPalette({ 1: "green" }));
  });
  await check("zoom beyond 800% raises only the close-view high-DPI backing-store cap", async () => {
    const previousRatio = window.devicePixelRatio; window.devicePixelRatio = 3;
    const f = fixture(); try {
      flush(); assert.equal(f.canvas.width, 512);
      for (let index = 0; index < 4; index++) f.renderer.zoom(2);
      flush(); assert.equal(f.canvas.width, 512, "The backing store must not resize during a zoom gesture");
      await settleZoom(); assert.equal(f.states.at(-1).zoom, 4); assert.equal(f.canvas.width, 768);
      assert.equal(f.canvas.style.imageRendering, "pixelated");
      assert(f.canvas.ctx.calls.some(call => call[0] === "transform" && call[1] === 3));
      await tick(); await f.drain(); await tick(); flush();
      assert(contexts.some(ctx => ctx.image?.width === 256 && ctx.image?.height === 256),
        "Visible scale-1 tiles should receive a 2x close-detail raster");
    } finally { f.renderer.dispose(); window.devicePixelRatio = previousRatio; }
  });
  await check("2.5D relief gains contrast only above 700% zoom", async () => {
    const f = fixture(); try {
      f.renderer.zoom(7); await settleZoom();
      assert.equal(f.states.at(-1).zoom, 1.75);
      await tick(); await f.drain();
      await tick(); await tick();
      const firstRelief = f.requests.findIndex(request => request.relief);
      assert(firstRelief >= 0, "Relief should be requested after base tiles");
      await f.complete(firstRelief);
      assert(!contexts.some(ctx => ctx.image?.width === 256),
        "700% must retain the normal relief raster");
      const drawsAtThreshold = f.canvas.ctx.calls.filter(call => call[0] === "draw").length;
      f.renderer.zoom(1.01); await settleZoom(); await tick(); flush();
      assert(f.canvas.ctx.calls.filter(call => call[0] === "draw").length > drawsAtThreshold);
      assert(contexts.some(ctx => ctx.image?.width === 256),
        "Above 700% the loaded relief should gain a 2x contrast raster");
    } finally { f.renderer.dispose(); }
  });
  await check("surface gradients produce bounded north-west relief without tile-edge seams", async () => {
    const grid = (cellX, width, height, scale) => Float32Array.from({ length: (width + 2) * (height + 2) }, (_, index) => {
      const x = index % (width + 2), z = Math.floor(index / (width + 2));
      const worldX = (cellX + x - 1) * scale, worldZ = (z - 1) * scale;
      return 64 + worldX * 0.06 + Math.sin(worldZ / 40) * 9;
    });
    const combined = createBiomeRelief(grid(-8, 16, 8, 4), 16, 8, 4);
    const left = createBiomeRelief(grid(-8, 8, 8, 4), 8, 8, 4);
    const right = createBiomeRelief(grid(0, 8, 8, 4), 8, 8, 4);
    for (let z = 0; z < 8; z++) {
      assert.deepEqual([...left.subarray(z * 8, z * 8 + 8)], [...combined.subarray(z * 16, z * 16 + 8)]);
      assert.deepEqual([...right.subarray(z * 8, z * 8 + 8)], [...combined.subarray(z * 16 + 8, z * 16 + 16)]);
    }
    assert(combined.some(value => value !== 0));
    assert(combined.every(value => value >= -30 && value <= 24));
    const base = [90, 160, 70];
    const shadow = shadeBiomeRasterColor(base, -30), highlight = shadeBiomeRasterColor(base, 25);
    assert(shadow.every((value, index) => value < base[index]));
    assert(highlight.every((value, index) => value > base[index]));
    assert.throws(() => createBiomeRelief(new Float32Array(4), 2, 2, 4));
  });
  await check("click and keyboard inspection resolve only retained biome samples at the selected altitude", async () => {
    const f = fixture(); try {
      await tick(); await f.drain();
      const pointer = type => { const event = new Event(type); Object.assign(event,
        { pointerId: 7, button: 0, clientX: 128, clientY: 128 }); return event; };
      f.canvas.dispatchEvent(pointer("pointerdown")); f.canvas.dispatchEvent(pointer("pointerup"));
      assert.deepEqual(f.selections[0], { biomeId: 14, x: 0, y: 64, z: 0, scale: f.states.at(-1).scale });
      assert(Object.isFrozen(f.selections[0]));
      const key = new Event("keydown", { cancelable: true }); Object.assign(key, { key: "Enter", altKey: false, ctrlKey: false, metaKey: false });
      f.canvas.dispatchEvent(key); assert.equal(f.selections.length, 2); assert(key.defaultPrevented);
      const drag = pointer("pointerdown"); f.canvas.dispatchEvent(drag);
      const move = pointer("pointermove"); Object.assign(move, { clientX: 140 }); f.canvas.dispatchEvent(move);
      const up = pointer("pointerup"); Object.assign(up, { clientX: 140 }); f.canvas.dispatchEvent(up);
      assert.equal(f.selections.length, 2);
    } finally { f.renderer.dispose(); }
  });
  await check("pointer hover reports coordinates and retained biome, then clears on leave", async () => {
    const f = fixture(); try {
      await tick(); await f.drain();
      const move = new Event("pointermove"); Object.assign(move, { pointerId: 7, clientX: 128, clientY: 128 });
      f.canvas.dispatchEvent(move); flush();
      assert.deepEqual(f.cursors.at(-1), { biomeId: 14, x: 0, y: 64, z: 0, scale: f.states.at(-1).scale });
      assert(Object.isFrozen(f.cursors.at(-1)));
      f.canvas.dispatchEvent(new Event("pointerleave"));
      assert.equal(f.cursors.at(-1), null);
    } finally { f.renderer.dispose(); }
  });
  await check("altitude changes abort obsolete work and cannot paint its late response", async () => {
    const f = fixture(); try {
      await tick(); const old = f.requests[0]; f.renderer.setAltitude(-32); assert(old.signal.aborted);
      await f.complete(0); assert.equal(f.canvas.ctx.calls.filter(call => call[0] === "draw").length, 0);
      await tick(); assert(f.requests.at(-1).ranges.every(range => range.blockY === -32));
    } finally { f.renderer.dispose(); }
  });
  await check("hidden views cancel synchronous source work and resume only on activation", async () => {
    const f = fixture(); try {
      await tick(); f.renderer.setActive(false); assert(f.requests[0].signal.aborted);
      const count = f.requests.length; await tick(); assert.equal(f.requests.length, count);
      f.renderer.setActive(true); await tick(); assert(f.requests.length > count);
    } finally { f.renderer.dispose(); }
  });
  await check("keyboard panning and zoom retain exact coordinate directions and origin reset", async () => {
    const f = fixture(); try {
      const event = new Event("keydown", { cancelable: true }); Object.assign(event, { key: "ArrowRight" }); f.canvas.dispatchEvent(event);
      assert.equal(f.states.at(-1).x, 256); assert(event.defaultPrevented);
      f.renderer.zoom(2); await settleZoom(); assert.equal(f.states.at(-1).zoom, .5); assert.equal(f.states.at(-1).x, 256);
      f.renderer.reset(); assert.equal(f.states.at(-1).x, 0); assert.equal(f.states.at(-1).zoom, .25);
    } finally { f.renderer.dispose(); }
  });
  await check("failed tile jobs surface error state and explicit retry submits fresh work", async () => {
    const f = fixture(), log = console.error; console.error = () => {};
    try {
      await tick(); f.requests[0].reject(new Error("Expected fixture failure")); await tick();
      assert(f.states.at(-1).error); f.renderer.retry(); await tick(); assert.equal(f.states.at(-1).error, false); assert.equal(f.requests.length, 4);
    } finally { console.error = log; f.renderer.dispose(); }
  });
  await check("disposal cancels pending jobs, drawing and input listeners; late output is ignored", async () => {
    const f = fixture(); await tick(); f.renderer.dispose(); assert(f.requests[0].signal.aborted); assert.equal(frames.size, 0);
    const count = f.states.length; await f.complete();
    const event = new Event("keydown"); Object.assign(event, { key: "ArrowRight" }); f.canvas.dispatchEvent(event);
    assert.equal(f.states.length, count); f.renderer.dispose();
  });
  await check("programmatic follow retains zoom, ignores duplicate positions and yields to manual controls", async () => {
    const f = fixture(); try {
      f.renderer.center(-1024, 600); assert.equal(f.states.at(-1).x, -1024); assert.equal(f.states.at(-1).z, 600);
      assert.equal(f.states.at(-1).zoom, .25); assert.equal(f.manual.length, 0);
      const count = f.states.length; f.renderer.center(-1024, 600); assert.equal(f.states.length, count);
      for (const key of ["ArrowLeft", "Home", "+"]) {
        const event = new Event("keydown"); Object.assign(event, { key }); f.canvas.dispatchEvent(event);
      }
      f.renderer.reset(); assert.equal(f.manual.length, 3);
      f.renderer.setActive(false); const hidden = f.states.length; f.renderer.center(400, 900); f.renderer.zoom(2); f.renderer.reset();
      assert.equal(f.states.length, hidden); assert.equal(f.manual.length, 3);
    } finally { f.renderer.dispose(); }
  });
  await check("first state measures the actual canvas before ResizeObserver can deliver", async () => {
    const canvas = new Canvas(), states = [];
    const view = createBiomeCanvas(canvas, { generate: async () => [] }, scope, {}, state => states.push(state));
    try {
      view.setActive(false); view.setAltitude(64);
      assert.equal(states[0].width, 256); assert.equal(states[0].height, 256);
    } finally { view.dispose(); }
  });
  await check("continuous follow starts work, never aborts an in-flight camera batch and reprioritizes the next batch", async () => {
    const f = fixture(); try {
      for (let i = 0; i < 6; i++) { f.renderer.center(i * 10000, -i * 10000); await new Promise(resolve => setTimeout(resolve, 20)); }
      assert.equal(f.requests.length, 2); assert.equal(f.requests[0].signal.aborted, false);
      const before = f.requests[0].ranges[0]; await f.complete(0);
      assert.equal(f.requests.length, 3); assert.equal(f.requests[0].signal.aborted, false);
      assert.notEqual(f.requests[2].ranges[0].cellX, before.cellX);
    } finally { f.renderer.dispose(); }
  });
  await check("continuous follow cannot postpone or cancel 2.5D relief indefinitely", async () => {
    const f = fixture(); try {
      await tick(); await f.drain();
      for (let i = 0; i < 5; i++) {
        f.renderer.center(i + 1, 0);
        await new Promise(resolve => setTimeout(resolve, 70));
      }
      const relief = f.requests.find(request => request.relief);
      assert(relief, "Relief should start while the player is still moving");
      assert.equal(relief.signal.aborted, false, "Following the player must retain relief work");
      const index = f.requests.indexOf(relief);
      await f.complete(index);
      assert(f.canvas.ctx.calls.some(call => call[0] === "draw" && call[1] > 0),
        "The completed relief should be drawn without another zoom action");
    } finally { f.renderer.dispose(); }
  });
  console.log(`${checks} biome canvas lifecycle checks passed (stub drawing context, not browser pixel evidence).`);
} finally {
  for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
}
