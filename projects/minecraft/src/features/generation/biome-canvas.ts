import { BIOME_DEFAULT_ZOOM, BIOME_TILE_LIMIT, clampBiomeCamera, planBiomeTiles, tileKey } from "./biome-viewport.ts";
import type { BiomeCamera } from "./biome-viewport.ts";
import type { BiomeTileSource } from "./biome-tile-source.ts";
import type { TerrainScope } from "../terrain/terrain-scope.ts";
import type { BiomeWorkResult } from "./biome-work-types.ts";
import { biomeRasterColor, createBiomeRasterPalette, shadeBiomeRasterColor } from "./biome-raster-color.ts";
import { createBiomeCanopySampler, type BiomeCanopyStyle } from "./biome-canopy.ts";
import { createBiomePanCache } from "./biome-pan-cache.ts";

type BiomeResultTile = Extract<BiomeWorkResult, { kind: "biomes" }>["tiles"][number];
type Tile = BiomeResultTile & {
  canvas: HTMLCanvasElement;
  reliefCanvas: HTMLCanvasElement | null;
  closeCanvas: HTMLCanvasElement | null;
  closeReliefCanvas: HTMLCanvasElement | null;
  relief: Int8Array | null;
  biomeIds: readonly number[];
  revealedAt: number;
  reliefRevealedAt: number;
  reliefResolved: boolean;
};
export interface BiomeCanvasState { ready: number; total: number; scale: number; error: boolean; panning: boolean; zooming: boolean; x: number; z: number; zoom: number;
  width: number; height: number; biomeIds: readonly number[] }
export interface BiomeCanvasSelection { biomeId: number; x: number; y: number; z: number; scale: number }
export interface BiomeCanvasCursor { biomeId: number | null; x: number; y: number; z: number; scale: number }

const TILE_REVEAL_MS = 180;
const RELIEF_REVEAL_MS = 220;
const RELIEF_IDLE_MS = 180;
const ZOOM_IDLE_MS = 100;
const CLOSE_DETAIL_ZOOM = BIOME_DEFAULT_ZOOM * 8;
const RELIEF_DETAIL_ZOOM = BIOME_DEFAULT_ZOOM * 7;
const CLOSE_DETAIL_RASTER_SCALE = 2;
const RELIEF_DETAIL_STRENGTH = 1.4;
const reliefDetailBlend = (zoom: number) => Math.max(0, Math.min(1,
  (zoom - RELIEF_DETAIL_ZOOM) / (CLOSE_DETAIL_ZOOM - RELIEF_DETAIL_ZOOM)));
const closeReliefOpacity = (zoom: number) => {
  const transition = Math.max(0, Math.min(1, (zoom - BIOME_DEFAULT_ZOOM * 6) / (BIOME_DEFAULT_ZOOM * 2)));
  const closeOpacity = Math.max(0.35, 0.55 - Math.max(0, Math.log2(zoom / CLOSE_DETAIL_ZOOM)) * 0.1);
  return 1 + (closeOpacity - 1) * transition;
};
const revealProgress = (startedAt: number, duration: number, now: number) => {
  const progress = Math.max(0, Math.min(1, (now - startedAt) / duration));
  return 1 - (1 - progress) ** 3;
};

/** Viewport-bounded schematic raster with optional approximate terrain hillshade. */
export const createBiomeCanvas = (canvas: HTMLCanvasElement, source: BiomeTileSource, scope: TerrainScope,
  colors: Readonly<Record<number, string>>, onState: (state: BiomeCanvasState, painting?: boolean) => void, initial?: BiomeCamera,
  onManualCamera?: () => void, onInspect?: (selection: Readonly<BiomeCanvasSelection>) => void,
  onCursor?: (cursor: Readonly<BiomeCanvasCursor> | null) => void,
  canopyStyles: Readonly<Record<number, BiomeCanopyStyle>> = {}, keepZoomCentered: () => boolean = () => false) => {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas rendering unavailable");
  const panCache = createBiomePanCache(canvas);
  const initialBounds = canvas.getBoundingClientRect();
  let camera = clampBiomeCamera(initial ?? { x: 0, z: 0, zoom: BIOME_DEFAULT_ZOOM }),
    width = Math.max(1, initialBounds.width), height = Math.max(1, initialBounds.height), blockY = 64;
  let active = true, disposed = false, failure = false, frame = 0, cursorFrame = 0, reliefReady = false;
  let cameraPanFrame = 0, programmaticPan = false;
  let zoomSettling = false;
  let zoomTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingDragUpdate = false;
  let timer: ReturnType<typeof setTimeout> | undefined, reliefTimer: ReturnType<typeof setTimeout> | undefined;
  let detailTimer: ReturnType<typeof setTimeout> | undefined;
  let abort: AbortController | null = null;
  let drag: {
    id: number;
    x: number;
    y: number;
    camera: BiomeCamera;
    moved: boolean;
    activationTarget: HTMLElement | null;
  } | null = null;
  let cursor: { clientX: number; clientY: number } | null = null;
  let lastCursorValue = "";
  const cache = new Map<string, Tile>();
  let visible = planBiomeTiles({ width, height, camera, blockY });
  let preview = planBiomeTiles({ width, height, camera, blockY }, (visible[0]?.scale ?? 1) * 4);
  const palette = createBiomeRasterPalette(colors);
  const announce = (painting = false) => {
    const biomeIds = Object.freeze([...new Set(visible.flatMap(range => cache.get(tileKey(range))?.biomeIds ?? []))].sort((left, right) => left - right));
    onState({ ready: visible.filter(range => cache.has(tileKey(range))).length, total: visible.length,
      panning: Boolean(drag?.moved || programmaticPan),
      zooming: zoomSettling,
      scale: visible[0]?.scale ?? 1, error: failure, width, height, biomeIds, ...camera }, painting);
  };
  const draw = () => {
    frame = 0; if (disposed || !active) return;
    if (pendingDragUpdate) { pendingDragUpdate = false; update(false, true); }
    // Publish the exact camera being painted so DOM overlays can commit before
    // this frame is presented, rather than trailing the raster by one frame.
    announce(true);
    // Close views contain fewer tiles, so they can afford a denser backing store on
    // high-DPI displays. Overviews keep the cheaper cap that protects frame time.
    const ratioCap = zoomSettling && canvas.width ? canvas.width / width
      : camera.zoom > CLOSE_DETAIL_ZOOM ? 3 : 2;
    const ratio = Math.min(ratioCap, window.devicePixelRatio || 1, 4096 / width, 4096 / height);
    const panView = { ...camera, width, height, ratio, blockY };
    const pan = panCache.prepare(panView, Boolean(drag?.moved));
    const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    canvas.style.imageRendering = camera.zoom >= CLOSE_DETAIL_ZOOM ? "pixelated" : "auto";
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    // Follow motion often lands between device pixels. Interpolate overview tiles
    // at their exact camera position so hillshade does not jump in pixel steps.
    context.imageSmoothingEnabled = camera.zoom < CLOSE_DETAIL_ZOOM;
    context.fillStyle = "#0d0f10"; context.fillRect(0, 0, width, height);
    if (pan) {
      context.globalAlpha = 1;
      context.drawImage(pan.canvas, pan.x, pan.y, width, height);
      context.save(); context.beginPath();
      for (const strip of pan.strips) context.rect(strip.x, strip.y, strip.width, strip.height);
      context.clip();
      context.fillRect(0, 0, width, height);
    }
    const left = camera.x - width / camera.zoom / 2, top = camera.z - height / camera.zoom / 2;
    // Retain coarser and previous-zoom pixels until sharper replacements arrive.
    const drawable = [...cache.values()].filter(tile => tile.range.blockY === blockY &&
      tile.range.cellX * tile.range.scale < left + width / camera.zoom && (tile.range.cellX + tile.range.width) * tile.range.scale > left &&
      tile.range.cellZ * tile.range.scale < top + height / camera.zoom && (tile.range.cellZ + tile.range.height) * tile.range.scale > top)
      // A newly loaded flat tile must not cover relief already available at a
      // coarser scale. Keep shaded pixels visible until their replacement is ready.
      .sort((a, b) => Number(Boolean(a.reliefCanvas)) - Number(Boolean(b.reliefCanvas))
        || b.range.scale - a.range.scale);
    const now = Date.now(); let animating = false;
    for (const tile of drawable) {
      const range = tile.range;
      // Derive both edges from world coordinates. Neighboring tiles then share
      // the same edge while the entire raster follows a fractional camera.
      const x0 = (range.cellX * range.scale - left) * camera.zoom;
      const y0 = (range.cellZ * range.scale - top) * camera.zoom;
      const x1 = ((range.cellX + range.width) * range.scale - left) * camera.zoom;
      const y1 = ((range.cellZ + range.height) * range.scale - top) * camera.zoom;
      if (pan && !pan.strips.some(strip => x0 < strip.x + strip.width && x1 > strip.x
        && y0 < strip.y + strip.height && y1 > strip.y)) continue;
      const tileReveal = revealProgress(tile.revealedAt, TILE_REVEAL_MS, now);
      const close = camera.zoom >= CLOSE_DETAIL_ZOOM && range.scale === 1;
      const reliefBlend = range.scale === 1 ? reliefDetailBlend(camera.zoom) : 0;
      context.globalAlpha = tileReveal;
      context.drawImage(close && tile.closeCanvas ? tile.closeCanvas : tile.canvas, x0, y0, x1 - x0, y1 - y0);
      const reliefCanvas = tile.reliefCanvas;
      if (reliefCanvas) {
        const reliefReveal = revealProgress(tile.reliefRevealedAt, RELIEF_REVEAL_MS, now);
        context.globalAlpha = tileReveal * reliefReveal * closeReliefOpacity(camera.zoom);
        context.drawImage(reliefCanvas, x0, y0, x1 - x0, y1 - y0);
        // Add contrast only above 700%; the same approximate height samples remain the source.
        if (reliefBlend > 0 && tile.closeReliefCanvas) {
          context.globalAlpha = tileReveal * reliefReveal * reliefBlend;
          context.drawImage(tile.closeReliefCanvas, x0, y0, x1 - x0, y1 - y0);
        }
        if (reliefReveal < 1) animating = true;
      }
      if (tileReveal < 1) animating = true;
    }
    const retainedCloseTiles = new Set(drawable);
    for (const tile of zoomSettling ? [] : cache.values()) {
      if (!retainedCloseTiles.has(tile) || camera.zoom < CLOSE_DETAIL_ZOOM) tile.closeCanvas = null;
      if (!retainedCloseTiles.has(tile) || camera.zoom <= RELIEF_DETAIL_ZOOM) tile.closeReliefCanvas = null;
    }
    context.globalAlpha = 1;
    // Coordinate origin is a cross, not an assumed spawn or player marker.
    const x = -left * camera.zoom, z = -top * camera.zoom;
    context.strokeStyle = "#f0ede7"; context.lineWidth = 1; context.beginPath();
    context.moveTo(x - 5, z); context.lineTo(x + 5, z); context.moveTo(x, z - 5); context.lineTo(x, z + 5); context.stroke();
    if (pan) context.restore();
    panCache.complete(panView, Boolean(pan));
    scheduleCloseDetail();
    if (animating) redraw();
  };
  const redraw = () => { if (!frame && !disposed && active) frame = requestAnimationFrame(draw); };
  const renderTile = (tile: BiomeResultTile, relief: Int8Array | null = null, rasterScale = 1, reliefStrength = 1) => {
    const image = document.createElement("canvas"); image.width = tile.range.width * rasterScale; image.height = tile.range.height * rasterScale;
    const ctx = image.getContext("2d"); if (!ctx) throw new Error("Tile canvas unavailable");
    const pixels = ctx.createImageData(image.width, image.height), biomeIds = new Set<number>();
    const shadeCanopy = createBiomeCanopySampler();
    for (let i = 0; i < image.width * image.height; i++) {
      // Unknown IDs are visibly neutral; never invent a semantic biome name or material.
      const pixelX = i % image.width, pixelZ = Math.floor(i / image.width);
      const localX = Math.floor(pixelX / rasterScale), localZ = Math.floor(pixelZ / rasterScale);
      const biomeIndex = localZ * tile.range.width + localX, biomeId = tile.biomes[biomeIndex];
      biomeIds.add(biomeId);
      const base = palette.get(biomeId) ?? [0x77, 0x77, 0x77] as const;
      const worldX = (tile.range.cellX + localX + pixelX % rasterScale / rasterScale) * tile.range.scale;
      const worldZ = (tile.range.cellZ + localZ + pixelZ % rasterScale / rasterScale) * tile.range.scale;
      const textured = biomeRasterColor(base, biomeId, worldX, worldZ, rasterScale > 1 ? "close" : "overview");
      const canopy = tile.range.scale === 1 && canopyStyles[biomeId]
        ? shadeCanopy(textured, biomeId, worldX, worldZ, canopyStyles[biomeId]) : textured;
      const rgb = relief ? shadeBiomeRasterColor(canopy, Math.round(relief[biomeIndex] * reliefStrength)) : canopy, offset = i * 4;
      pixels.data[offset] = rgb[0]; pixels.data[offset + 1] = rgb[1];
      pixels.data[offset + 2] = rgb[2]; pixels.data[offset + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    return { canvas: image, biomeIds: Object.freeze([...biomeIds].sort((left, right) => left - right)) };
  };
  const makeTile = (tile: BiomeResultTile): Tile => {
    const base = renderTile(tile), now = Date.now();
    return { ...tile, ...base, reliefCanvas: null, closeCanvas: null, closeReliefCanvas: null, relief: null,
      revealedAt: now, reliefRevealedAt: now, reliefResolved: false };
  };
  const scheduleCloseDetail = () => {
    if (disposed || !active || drag?.moved || zoomSettling || camera.zoom <= RELIEF_DETAIL_ZOOM || detailTimer !== undefined) return;
    // Refine one retained tile per task after zoom settles; never build every
    // high-resolution bitmap inside a camera paint.
    detailTimer = setTimeout(() => {
      detailTimer = undefined;
      if (disposed || !active || drag?.moved || zoomSettling) return;
      const left = camera.x - width / camera.zoom / 2, top = camera.z - height / camera.zoom / 2;
      const tile = [...cache.values()].find(tile => tile.range.blockY === blockY && tile.range.scale === 1 &&
        tile.range.cellX < left + width / camera.zoom && tile.range.cellX + tile.range.width > left &&
        tile.range.cellZ < top + height / camera.zoom && tile.range.cellZ + tile.range.height > top &&
        ((camera.zoom >= CLOSE_DETAIL_ZOOM && !tile.closeCanvas) ||
          (camera.zoom > RELIEF_DETAIL_ZOOM && tile.relief && !tile.closeReliefCanvas)));
      if (!tile) return;
      if (camera.zoom >= CLOSE_DETAIL_ZOOM && !tile.closeCanvas)
        tile.closeCanvas = renderTile(tile, null, CLOSE_DETAIL_RASTER_SCALE).canvas;
      else tile.closeReliefCanvas = renderTile(tile, tile.relief, CLOSE_DETAIL_RASTER_SCALE, RELIEF_DETAIL_STRENGTH).canvas;
      redraw(); scheduleCloseDetail();
    }, 16);
  };
  const load = async () => {
    // A moving camera must not continually cancel the only worker before it produces a tile.
    if (!active || disposed || zoomSettling || (abort && !abort.signal.aborted)) return;
    const current = new AbortController(); abort = current;
    const pending = new Set<string>();
    try {
      const lane = async () => {
      while (!disposed && active && !zoomSettling && !current.signal.aborted) {
        const missingBase = [...preview, ...visible].find(range => !cache.has(tileKey(range)) && !pending.has(`base:${tileKey(range)}`));
        const missingRelief = missingBase || !reliefReady ? undefined : visible.find(range => {
          const key = tileKey(range), tile = cache.get(key);
          return tile && !tile.reliefResolved && !pending.has(`relief:${key}`);
        });
        const range = missingBase ?? missingRelief;
        if (!range) break;
        const wantsRelief = !missingBase;
        const pendingKey = `${wantsRelief ? "relief" : "base"}:${tileKey(range)}`;
        pending.add(pendingKey);
        if (wantsRelief) {
          const tiles = await source.generateRelief(scope, [range], current.signal);
          if (disposed || current.signal.aborted) return;
          for (const tile of tiles) {
            const key = tileKey(tile.range), existing = cache.get(key);
            if (!existing) throw new Error("Biome relief has no base tile");
            existing.relief = tile.relief;
            existing.closeReliefCanvas = null;
            if (tile.relief) { existing.reliefCanvas = renderTile(existing, tile.relief).canvas; existing.reliefRevealedAt = Date.now(); }
            existing.reliefResolved = true; cache.delete(key); cache.set(key, existing); pending.delete(pendingKey);
          }
        } else {
          const tiles = await source.generate(scope, [range], current.signal);
          if (disposed || current.signal.aborted) return;
          for (const tile of tiles) {
            const key = tileKey(tile.range); cache.delete(key); cache.set(key, makeTile(tile)); pending.delete(pendingKey);
          }
        }
        const needed = new Set([...visible, ...preview].map(tileKey));
        for (const [key] of cache) { if (cache.size <= BIOME_TILE_LIMIT) break; if (!needed.has(key)) cache.delete(key); }
        announce(); queueCursor(); redraw();
      }
      };
      await Promise.all([lane(), lane()]);
    } catch (error) {
      if (!disposed && !current.signal.aborted) { failure = true; reliefReady = false; clearTimeout(reliefTimer); reliefTimer = undefined;
        current.abort(); console.error("Biome viewport generation failed", error); announce(); redraw(); }
    } finally { if (abort === current) abort = null; }
  };
  const deferRelief = (preserveSchedule = false) => {
    if (preserveSchedule && (reliefReady || reliefTimer !== undefined)) return;
    reliefReady = false; clearTimeout(reliefTimer);
    if (!active || failure) { reliefTimer = undefined; return; }
    reliefTimer = setTimeout(() => { reliefTimer = undefined; reliefReady = true; void load(); }, RELIEF_IDLE_MS);
  };
  const update = (preserveReliefWork = false, duringPaint = false) => {
    if (disposed) return;
    pendingDragUpdate = false;
    // Manual camera changes cancel stale refinement so new base tiles stay responsive.
    // Live follow moves continuously: keep its current tile in flight and let the
    // next iteration prioritize the latest visible base tiles.
    if (reliefReady && !preserveReliefWork) abort?.abort();
    try { visible = planBiomeTiles({ width, height, camera, blockY });
      preview = planBiomeTiles({ width, height, camera, blockY }, (visible[0]?.scale ?? 1) * 4); failure = false; }
    catch (error) { failure = true; visible = []; abort?.abort(); console.error("Biome viewport planning failed", error); }
    deferRelief(preserveReliefWork);
    if (!duringPaint) { announce(); queueCursor(); redraw(); }
    // Throttle starts; do not debounce indefinitely under continuous player updates.
    if (active && !failure && timer === undefined) timer = setTimeout(() => { timer = undefined; void load(); }, 80);
  };
  const stopCameraMotion = (settleZoom = true) => {
    if (cameraPanFrame) cancelAnimationFrame(cameraPanFrame);
    cameraPanFrame = 0;
    programmaticPan = false;
    clearTimeout(zoomTimer);
    zoomTimer = undefined;
    if (zoomSettling) {
      zoomSettling = false;
      if (settleZoom && active && !disposed) update();
    }
  };
  const zoom = (factor: number, px = width / 2, py = height / 2) => {
    if (disposed || !active) return;
    const next = clampBiomeCamera({ ...camera, zoom: camera.zoom * factor });
    if (keepZoomCentered()) { px = width / 2; py = height / 2; }
    next.x += (px - width / 2) * (1 / camera.zoom - 1 / next.zoom);
    next.z += (py - height / 2) * (1 / camera.zoom - 1 / next.zoom);
    const target = clampBiomeCamera(next);
    if (target.zoom === camera.zoom) return;
    if (cameraPanFrame) cancelAnimationFrame(cameraPanFrame);
    cameraPanFrame = 0;
    programmaticPan = false;
    // Apply every wheel step immediately. Keep cached pixels and markers in the
    // paint path; tile planning and marker reclustering wait until input pauses.
    if (!zoomSettling) {
      abort?.abort(); clearTimeout(timer); clearTimeout(reliefTimer); clearTimeout(detailTimer);
      timer = undefined; reliefTimer = undefined; detailTimer = undefined; reliefReady = false;
      zoomSettling = true;
    }
    camera = target;
    queueCursor(); redraw();
    clearTimeout(zoomTimer);
    zoomTimer = setTimeout(() => {
      zoomTimer = undefined;
      zoomSettling = false;
      update();
    }, ZOOM_IDLE_MS);
  };
  const down = (event: PointerEvent, activationTarget: HTMLElement | null = null) => {
    if (!active || event.button !== 0) return;
    if (activationTarget) activationTarget.focus({ preventScroll: true });
    else canvas.focus();
    canvas.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, camera: { ...camera }, moved: false, activationTarget };
  };
  const move = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const cursorInside = event.clientX >= rect.left && event.clientX <= rect.left + rect.width
      && event.clientY >= rect.top && event.clientY <= rect.top + rect.height;
    cursor = cursorInside ? { clientX: event.clientX, clientY: event.clientY } : null;
    if (drag?.id === event.pointerId) {
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) {
        stopCameraMotion();
        drag.moved = true;
        // Follow may have advanced while the pointer was held still.
        drag.camera = { ...camera };
        onManualCamera?.();
      }
      if (drag.moved) {
        camera = clampBiomeCamera({ ...camera, x: drag.camera.x - (event.clientX - drag.x) / drag.camera.zoom,
          z: drag.camera.z - (event.clientY - drag.y) / drag.camera.zoom });
        // High-rate pointers can emit several moves before one display frame.
        // Plan and schedule only the latest camera when that frame is painted.
        pendingDragUpdate = true; redraw();
      }
    }
    if (cursor) queueCursor();
    else if (lastCursorValue) { lastCursorValue = ""; onCursor?.(null); }
  };
  const sampleWorld = (worldX: number, worldZ: number): Readonly<BiomeCanvasCursor> => {
    const x = Math.floor(worldX), z = Math.floor(worldZ);
    const range = visible.find(item => x >= item.cellX * item.scale && x < (item.cellX + item.width) * item.scale
      && z >= item.cellZ * item.scale && z < (item.cellZ + item.height) * item.scale && cache.has(tileKey(item)));
    if (!range) return Object.freeze({ biomeId: null, x, y: blockY, z, scale: visible[0]?.scale ?? 1 });
    const tile = cache.get(tileKey(range))!;
    const cellX = Math.floor(x / range.scale), cellZ = Math.floor(z / range.scale);
    const biomeId = tile.biomes[(cellZ - range.cellZ) * range.width + cellX - range.cellX];
    return Object.freeze({ biomeId: Number.isSafeInteger(biomeId) ? biomeId : null, x, y: blockY, z, scale: range.scale });
  };
  const inspectWorld = (worldX: number, worldZ: number) => {
    const selection = sampleWorld(worldX, worldZ);
    if (selection.biomeId === null) return;
    onInspect?.(Object.freeze({ ...selection, biomeId: selection.biomeId }));
  };
  const sampleScreen = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return sampleWorld(camera.x + (clientX - rect.left - width / 2) / camera.zoom,
      camera.z + (clientY - rect.top - height / 2) / camera.zoom);
  };
  const inspectScreen = (clientX: number, clientY: number) => {
    const selection = sampleScreen(clientX, clientY);
    if (selection.biomeId !== null) onInspect?.(Object.freeze({ ...selection, biomeId: selection.biomeId }));
  };
  function announceCursor() {
    if (!cursor || !onCursor) return;
    const value = sampleScreen(cursor.clientX, cursor.clientY);
    const key = [value.biomeId, value.x, value.y, value.z, value.scale].join(":");
    if (key === lastCursorValue) return;
    lastCursorValue = key;
    onCursor(value);
  }
  function queueCursor() {
    if (!cursorFrame && cursor && onCursor) cursorFrame = requestAnimationFrame(() => { cursorFrame = 0; announceCursor(); });
  }
  const leave = () => {
    cursor = null; lastCursorValue = ""; cancelAnimationFrame(cursorFrame); cursorFrame = 0; onCursor?.(null);
  };
  const up = (event: PointerEvent) => {
    const current = drag; drag = null;
    if (current?.id === event.pointerId && !current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) <= 4) {
      if (current.activationTarget?.isConnected) current.activationTarget.click();
      else inspectScreen(event.clientX, event.clientY);
    }
    else if (current?.id === event.pointerId && current.moved) redraw();
  };
  const cancel = () => { const wasPanning = Boolean(drag?.moved); drag = null; if (wasPanning) redraw(); };
  const wheel = (event: WheelEvent) => {
    if (!active) return; event.preventDefault(); const rect = canvas.getBoundingClientRect();
    zoom(Math.exp(-Math.max(-200, Math.min(200, event.deltaY)) * 0.003), event.clientX - rect.left, event.clientY - rect.top);
  };
  const key = (event: KeyboardEvent) => {
    if (!active || event.altKey || event.ctrlKey || event.metaKey) return;
    if (["Enter", " "].includes(event.key)) inspectWorld(camera.x, camera.z);
    else if (["+", "=", "-"].includes(event.key)) zoom(event.key === "-" ? 0.5 : 2);
    else if (event.key === "Home") { stopCameraMotion(); onManualCamera?.(); camera = { x: 0, z: 0, zoom: BIOME_DEFAULT_ZOOM }; update(); }
    else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      stopCameraMotion();
      onManualCamera?.();
      camera = clampBiomeCamera({ ...camera, x: camera.x + (event.key === "ArrowLeft" ? -64 : event.key === "ArrowRight" ? 64 : 0) / camera.zoom,
        z: camera.z + (event.key === "ArrowUp" ? -64 : event.key === "ArrowDown" ? 64 : 0) / camera.zoom }); update();
    } else return;
    event.preventDefault(); event.stopPropagation();
  };
  // Structure and destination markers are DOM siblings painted above the
  // canvas, so their pointer events cannot bubble into it. Delegate only
  // explicitly marked controls from the shared map surface and let the canvas
  // own the pointer for the rest of the gesture.
  const surface = canvas.parentElement;
  const markerTarget = (event: Event) => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-world-map-pan-target]")
      : null;
    return target && surface?.contains(target) ? target : null;
  };
  const delegatedDown = (event: PointerEvent) => {
    const target = markerTarget(event);
    if (!target) return;
    event.preventDefault();
    down(event, target);
  };
  const delegatedWheel = (event: WheelEvent) => { if (markerTarget(event)) wheel(event); };
  surface?.addEventListener("pointerdown", delegatedDown, true);
  surface?.addEventListener("wheel", delegatedWheel, { capture: true, passive: false });
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", cancel); canvas.addEventListener("lostpointercapture", cancel);
  canvas.addEventListener("pointerleave", leave);
  canvas.addEventListener("wheel", wheel, { passive: false }); canvas.addEventListener("keydown", key);
  const observer = new ResizeObserver(() => { const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) { width = rect.width; height = rect.height; update(); } }); observer.observe(canvas);
  return {
    zoom,
    reset() { if (disposed || !active) return; stopCameraMotion(); onManualCamera?.(); camera = { x: 0, z: 0, zoom: BIOME_DEFAULT_ZOOM }; update(); },
    center(x: number, z: number) {
      if (disposed || !active) return;
      stopCameraMotion();
      const next = clampBiomeCamera({ ...camera, x, z });
      if (next.x === camera.x && next.z === camera.z) return;
      camera = next; update(true);
    },
    panTo(x: number, z: number, duration = 400) {
      if (disposed || !active) return;
      stopCameraMotion();
      const target = clampBiomeCamera({ ...camera, x, z });
      const start = { ...camera };
      if (target.x === start.x && target.z === start.z) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        camera = target; update(true); return;
      }
      programmaticPan = true;
      const startedAt = performance.now();
      const animate = (time: number) => {
        cameraPanFrame = 0;
        if (disposed || !active) { stopCameraMotion(); return; }
        const progress = Math.min(1, (time - startedAt) / duration);
        const eased = 1 - (1 - progress) ** 3;
        camera = clampBiomeCamera({ ...camera,
          x: start.x + (target.x - start.x) * eased,
          z: start.z + (target.z - start.z) * eased });
        if (progress === 1) programmaticPan = false;
        update(true);
        if (progress < 1) cameraPanFrame = requestAnimationFrame(animate);
      };
      cameraPanFrame = requestAnimationFrame(animate);
    },
    retry() { update(); },
    setAltitude(value: number) { blockY = value; abort?.abort(); update(); },
    setActive(value: boolean) { active = value; if (!value) { stopCameraMotion(); abort?.abort(); clearTimeout(timer); clearTimeout(reliefTimer); clearTimeout(detailTimer);
      timer = undefined; reliefTimer = undefined; detailTimer = undefined; reliefReady = false; drag = null; leave(); } else update(); },
    dispose() { disposed = true; stopCameraMotion(); abort?.abort(); clearTimeout(timer); clearTimeout(reliefTimer); clearTimeout(detailTimer); cancelAnimationFrame(frame); cancelAnimationFrame(cursorFrame);
      observer.disconnect(); cache.clear(); panCache.clear();
      surface?.removeEventListener("pointerdown", delegatedDown, true);
      surface?.removeEventListener("wheel", delegatedWheel, true);
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel); canvas.removeEventListener("lostpointercapture", cancel);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("wheel", wheel); canvas.removeEventListener("keydown", key); },
  };
};
