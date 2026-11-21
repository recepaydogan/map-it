import "../src/index.css";
import { NbtFile, NbtCompound, NbtInt, NbtByte, NbtString, NbtList, NbtLongArray } from "deepslate/nbt";
import { createBrowserTerrainPool } from "../src/features/terrain/create-browser-terrain-pool.ts";
import { createTerrainRenderer } from "../src/features/terrain/terrain-renderer.ts";
import { createTerrainSectionStream } from "../src/features/terrain/terrain-section-stream.ts";
import { bindOrbitControls } from "../src/features/terrain/orbit-controls.ts";
import { GAME_COLUMN_TAG_SCHEMA, GAME_NBT_FORMATS, GAME_REGION_COMPRESSION } from "../src/game-config.ts";

const canvas = document.getElementById("terrain"), result = document.getElementById("result");
const selection = document.getElementById("selection"), cameraText = document.getElementById("camera");
const compound = entries => new NbtCompound(new Map(Object.entries(entries)));
const scope = { worldId: "diagnostic-world", sourceId: "synthetic-column", dimension: "fixture", revision: 1 };
const initialCamera = { target: [-8, -58, 40], yaw: -0.8, pitch: 0.62, distance: 34 };
let camera = initialCamera, renderer, removeControls, observer, pool, stream, updateRevision = 0, lineReport = "";

try {
  pool = createBrowserTerrainPool(); pool.setScope(scope);
  const values = new Uint16Array(4096);
  for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const height = 3 + Math.floor(x / 4) + Math.floor(z / 5);
    let state = y < height ? 1 : y === height ? 2 : 0;
    if (x >= 5 && x <= 9 && y >= 2 && y <= 4 && z >= 0 && z <= 10) state = 0;
    if (x >= 11 && x <= 12 && z >= 10 && z <= 11 && y > height && y < 14) state = 3;
    values[x + 16 * z + 256 * y] = state;
  }
  const words = Array.from({ length: 256 }, (_, word) => {
    let value = 0n;
    for (let slot = 0; slot < 16; slot++) value |= BigInt(values[word * 16 + slot]) << BigInt(slot * 4);
    return value;
  });
  const names = ["fixture:empty", "fixture:stone", "fixture:surface", "fixture:column"];
  const file = NbtFile.create();
  file.root = compound({ DataVersion: new NbtInt(100), xPos: new NbtInt(-1), zPos: new NbtInt(2), Status: new NbtString("full"),
    sections: new NbtList([compound({ Y: new NbtByte(-4), block_states: compound({
      palette: new NbtList(names.map(name => compound({ Name: new NbtString(name) })), 10), data: new NbtLongArray(words),
    }) })], 10) });
  const compressed = new Uint8Array(await new Response(new Blob([file.write()]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  const decoded = await pool.submit(scope, { kind: "column",
    payload: { slot: 0, chunkX: -1, chunkZ: 2, timestampSeconds: 0, compressionId: 1, external: false, data: compressed },
    context: { schema: GAME_COLUMN_TAG_SCHEMA, dataVersion: 100, chunkX: -1, chunkZ: 2, minSectionY: -4, maxSectionY: 19 },
    options: { tags: GAME_NBT_FORMATS.java, compressionModes: GAME_REGION_COMPRESSION } });
  if (decoded.kind !== "column") throw new Error("Unexpected decode response");
  const section = decoded.value.sections[0].voxels;
  const rgba = new Uint8Array(16 * 16 * 3 * 4);
  const colors = [[137, 137, 130], [110, 147, 71], [195, 142, 60]];
  for (let layer = 0; layer < 3; layer++) for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const shade = (x * 11 + y * 7 + layer * 3) % 9 - 4;
    const pixel = ((layer * 16 + y) * 16 + x) * 4;
    rgba.set([...colors[layer].map(value => value + shade * 3), 255], pixel);
  }
  const textures = { size: 16, layers: 3, rgba };
  const materials = names.map((_, index) => Array.from({ length: 6 }, (_, face) => ({
    tile: index === 3 ? 2 : index === 2 && face === 3 ? 1 : 0, tint: [1, 1, 1],
  })));
  let recovering = false;
  renderer = createTerrainRenderer(canvas, { background: [13 / 255, 15 / 255, 16 / 255, 1], onStatus(status, error) {
    if (status === "ready") {
      result.textContent = "Ready — verifying rendered pixels…";
      if (recovering) {
        recovering = false;
        queueMicrotask(() => {
          try { result.textContent = `PASS: graphics context restored\nRecovered terrain pixels: ${verifyPixels()}\nRetained camera and cutaway scene rendered again`; }
          catch (failure) { result.textContent = `FAIL: ${failure.message}`; }
        });
      }
    }
    else result.textContent = status === "context-lost" ? "Context lost — waiting for recovery" : `FAIL: ${error?.message ?? status}`;
  } });
  const setCamera = value => {
    camera = value; renderer.setCamera(camera);
    cameraText.textContent = `Target: ${camera.target.map(value => value.toFixed(2)).join(", ")}\nYaw: ${camera.yaw.toFixed(2)}  Pitch: ${camera.pitch.toFixed(2)}\nDistance: ${camera.distance.toFixed(2)}`;
  };
  const capturePixels = () => {
    renderer.renderNow();
    const gl = canvas.getContext("webgl2");
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    if (gl.getError() !== gl.NO_ERROR) throw new Error("Unable to read rendered terrain pixels");
    return pixels;
  };
  const verifyPixels = () => {
    const pixels = capturePixels();
    let terrainPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) if (pixels[index] > 30 || pixels[index + 1] > 30 || pixels[index + 2] > 30) terrainPixels++;
    if (terrainPixels < 100) throw new Error("No visible terrain pixels were rendered");
    return terrainPixels;
  };
  const changedPixels = (left, right) => {
    let changed = 0;
    for (let index = 0; index < left.length; index += 4)
      if (left[index] !== right[index] || left[index + 1] !== right[index + 1] || left[index + 2] !== right[index + 2]) changed++;
    return changed;
  };
  stream = createTerrainSectionStream({ pool, renderer });
  stream.setSource(scope, textures);
  stream.setCutaway(scope, Number(document.getElementById("cut").value));
  const original = { id: "fixture-section", source: { section, origin: [-16, -64, 32],
    shapes: ["empty", "opaque-cube", "opaque-cube", "opaque-cube"] }, materials };
  stream.updateSections(scope, [original]);
  let streamingReport = "";
  const update = async () => {
    const revision = ++updateRevision;
    const cutawayY = Number(document.getElementById("cut").value);
    document.getElementById("cut-value").textContent = String(cutawayY);
    result.textContent = "Streaming requested cutaway through background worker…";
    stream.setCutaway(scope, cutawayY); await stream.whenIdle();
    if (revision !== updateRevision) return;
    const terrainPixels = verifyPixels();
    result.textContent = `PASS: worker-decoded and streamed fixture rendered\nFaces: ${renderer.getStats().faces}\nTerrain pixels: ${terrainPixels}\nDrawing buffer: ${canvas.width} × ${canvas.height}\nTextures: 3 independent 16px layers\nQueued jobs after completion: ${pool.getStats().pending}\nCharged geometry/texture bytes: ${renderer.getStats().chargedGpuBytes}\n${streamingReport}\nSynthetic data; no game save accessed`;
  };
  const size = () => {
    const rect = canvas.getBoundingClientRect(); renderer.resize(rect.width, rect.height, devicePixelRatio); renderer.renderNow();
  };
  setCamera(initialCamera); size(); await update();
  renderer.setLineOverlay([]); const noLinePixels = capturePixels();
  renderer.setLineOverlay([[[-15, -63, 33], [-13, -63, 35]]]); const hiddenLinePixels = capturePixels();
  const hiddenChanges = changedPixels(noLinePixels, hiddenLinePixels);
  if (hiddenChanges !== 0) throw new Error(`Terrain-hidden route changed ${hiddenChanges} visible pixels`);
  renderer.setLineOverlay([[[-15, -50, 33], [-8, -50, 40], [0, -50, 48]]]); const visibleLinePixels = capturePixels();
  const visibleChanges = changedPixels(noLinePixels, visibleLinePixels);
  if (visibleChanges < 40) throw new Error("Depth-tested route did not produce enough visible pixels");
  lineReport = `PASS: 3D route depth, surface visibility and shared context\nVisible route pixels: ${visibleChanges}\nOccluded route pixels: ${hiddenChanges}`;
  result.textContent = lineReport;
  const initialPixels = verifyPixels();
  stream.updateSections(scope, [{ ...original, id: "streamed-neighbor", source: { ...original.source, origin: [0, -64, 32] } }]);
  await stream.whenIdle();
  if (renderer.getStats().gpuEntries !== 2) throw new Error("Streamed neighbor was not uploaded");
  setCamera({ ...initialCamera, target: [8, -58, 40] });
  const expandedPixels = verifyPixels();
  const rect = canvas.getBoundingClientRect();
  let pickedNeighbor = false;
  for (const x of [0.25, 0.5, 0.75]) for (const y of [0.25, 0.5, 0.75])
    if (renderer.pick(rect.width * x, rect.height * y)?.entryId === "streamed-neighbor") pickedNeighbor = true;
  if (!pickedNeighbor) throw new Error("Newly streamed geometry could not be picked");
  stream.updateSections(scope, [], ["streamed-neighbor"]); await stream.whenIdle();
  setCamera(initialCamera);
  const restoredPixels = verifyPixels();
  if (renderer.getStats().gpuEntries !== 1 || restoredPixels !== initialPixels) throw new Error("Eviction did not restore the original visible scene");
  streamingReport = `PASS: adjacent upload, neighbor remesh, exact new-section pick, eviction\nExpanded terrain pixels: ${expandedPixels}\nRestored original pixels: ${restoredPixels}\n${lineReport}`;
  await update();
  observer = new ResizeObserver(size); observer.observe(canvas);
  removeControls = bindOrbitControls(canvas, { getCamera: () => camera, setCamera, onManualCamera: () => {}, onReset: () => setCamera(initialCamera),
    onPick: (x, y) => {
      const hit = renderer.pick(x, y);
      selection.textContent = hit ? `${names[hit.paletteIndex]}\nX ${hit.block[0]} · Y ${hit.block[1]} · Z ${hit.block[2]}\nWorld: ${hit.scope.worldId}\nSource: ${hit.scope.sourceId}\nFace flags: ${hit.flags}` : "No visible block at this point";
    } });
  document.getElementById("cut").addEventListener("input", () => {
    void update().catch(error => { if (error.code !== "cancelled") result.textContent = `FAIL: ${error.message}`; });
  });
  document.getElementById("reset").addEventListener("click", () => setCamera(initialCamera));
  document.getElementById("recover").addEventListener("click", () => {
    const extension = canvas.getContext("webgl2").getExtension("WEBGL_lose_context");
    if (!extension) { result.textContent = "Recovery test unavailable: no context-loss extension"; return; }
    recovering = true; extension.loseContext(); setTimeout(() => extension.restoreContext(), 500);
  });
  document.addEventListener("visibilitychange", () => stream.setActive(!document.hidden));
  window.addEventListener("pagehide", () => { stream.dispose(); pool.dispose(); observer.disconnect(); removeControls(); renderer.dispose(); }, { once: true });
} catch (error) {
  result.textContent = `FAIL: ${error instanceof Error ? error.message : String(error)}`;
  observer?.disconnect(); removeControls?.(); stream?.dispose(); renderer?.dispose(); pool?.dispose();
}
