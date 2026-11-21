import { validateTextureArray, VERTEX_FLOATS } from "./terrain-draw-data.ts";
import type { TerrainDrawEntry, TerrainTextureArray } from "./terrain-draw-data.ts";
import { cameraBasis, cameraRay, normalizeOrbitCamera, orbitViewProjection } from "./orbit-camera.ts";
import type { OrbitCamera } from "./orbit-camera.ts";
import { pickSectionMesh } from "./pick-section-mesh.ts";
import { createTerrainGpuMesh, createTerrainProgram, createTerrainTextures, deleteTerrainGpuMesh } from "./terrain-gl-resources.ts";
import type { TerrainGpuMesh } from "./terrain-gl-resources.ts";
import { createTerrainLineOverlayGpu, deleteTerrainLineOverlayGpu, drawTerrainLineOverlay, prepareTerrainLineOverlay } from "./terrain-line-overlay.ts";
import type { TerrainLineOverlay, TerrainLineOverlayGpu, TerrainLineOverlayStyle } from "./terrain-line-overlay.ts";
import type { Point3 } from "./orbit-camera.ts";
import type { TerrainCoveragePaths, TerrainCoverageState } from "./terrain-coverage-volume.ts";
import { sectionIntersectsView, terrainClipPlanes, terrainRayInterval } from "./terrain-view-volume.ts";
import { assertTerrainScope, sameTerrainScope } from "./terrain-scope.ts";
import type { TerrainScope } from "./terrain-scope.ts";
import { entryGpuBytes, prepareTerrainEntry } from "./prepare-terrain-entry.ts";
import type { PreparedTerrainEntry } from "./prepare-terrain-entry.ts";

export type { TerrainScope } from "./terrain-scope.ts";
export type RendererStatus = "ready" | "context-lost" | "failed";
interface Scene { scope: TerrainScope; textures: TerrainTextureArray; entries: PreparedTerrainEntry[] }
const textureGpuBytes = (textures: TerrainTextureArray) => Math.ceil(textures.rgba.byteLength * 4 / 3);

export interface TerrainRendererOptions {
  background: readonly [number, number, number, number];
  onStatus?: (status: RendererStatus, error?: unknown) => void;
  maxGpuBytes?: number;
}

const COVERAGE_STATES = ["checking", "partial", "ready"] as const satisfies readonly TerrainCoverageState[];
const COVERAGE_STYLES: Readonly<Record<TerrainCoverageState, TerrainLineOverlayStyle>> = Object.freeze({
  checking: Object.freeze({ outerWidth: 2.25, innerWidth: 1, outerColor: [0.04, 0.04, 0.03, 0.72] as const,
    innerColor: [0.886, 0.722, 0.435, 0.82] as const, depthBias: 0.00025 }),
  partial: Object.freeze({ outerWidth: 2.5, innerWidth: 1.2, outerColor: [0.04, 0.04, 0.03, 0.78] as const,
    innerColor: [0.886, 0.722, 0.435, 0.96] as const, depthBias: 0.0003 }),
  ready: Object.freeze({ outerWidth: 2.25, innerWidth: 1, outerColor: [0.04, 0.04, 0.03, 0.72] as const,
    innerColor: [0.518, 0.659, 0.471, 0.9] as const, depthBias: 0.00025 }),
});
const emptyCoverage = (): Record<TerrainCoverageState, TerrainLineOverlay> => ({
  checking: prepareTerrainLineOverlay([]), ready: prepareTerrainLineOverlay([]), partial: prepareTerrainLineOverlay([]),
});
const emptyCoverageGpu = (): Record<TerrainCoverageState, TerrainLineOverlayGpu | null> => ({ checking: null, ready: null, partial: null });

/** Retained source buffers permit context recovery; drawing is demand-driven, not a permanent loop. */
export const createTerrainRenderer = (canvas: HTMLCanvasElement, options: TerrainRendererOptions) => {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: false });
  if (!gl) throw new Error("WebGL2 is unavailable");
  const gpuBudget = options.maxGpuBytes ?? 128 * 1024 * 1024;
  const maxDimension = Math.min(8192, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
  if (!Number.isSafeInteger(gpuBudget) || gpuBudget < 1 || options.background.length !== 4 ||
    Array.from(options.background).some(value => !Number.isFinite(value) || value < 0 || value > 1))
    throw new Error("Invalid renderer options");
  let program: WebGLProgram | null = null, texture: WebGLTexture | null = null;
  let lineOverlay: TerrainLineOverlay = prepareTerrainLineOverlay([]), lineGpu: TerrainLineOverlayGpu | null = null;
  let coverageOverlays = emptyCoverage(), coverageGpus = emptyCoverageGpu();
  let meshes = new Map<string, TerrainGpuMesh>(), scene: Scene | null = null;
  let camera: OrbitCamera = { target: [0, 0, 0], yaw: Math.PI / 4, pitch: 0.6, distance: 48 };
  let disposed = false, lost = gl.isContextLost(), active = true, frame = 0;
  let rendered = false;
  let width = 1, height = 1, pixelWidth = 1, pixelHeight = 1;
  const coverageBytes = () => COVERAGE_STATES.reduce((sum, state) => sum + coverageOverlays[state].gpuBytes, 0);
  const releaseGpu = () => {
    for (const mesh of meshes.values()) deleteTerrainGpuMesh(gl, mesh);
    meshes.clear();
    if (lineGpu) deleteTerrainLineOverlayGpu(gl, lineGpu);
    for (const state of COVERAGE_STATES) if (coverageGpus[state]) deleteTerrainLineOverlayGpu(gl, coverageGpus[state]!);
    if (texture) gl.deleteTexture(texture);
    if (program) gl.deleteProgram(program);
    texture = null; program = null; lineGpu = null; coverageGpus = emptyCoverageGpu();
  };
  const rebuild = () => {
    releaseGpu();
    if (lost || !scene) return;
    try {
      program = createTerrainProgram(gl);
      texture = createTerrainTextures(gl, scene.textures);
      for (const entry of scene.entries) meshes.set(entry.id, createTerrainGpuMesh(gl, entry.vertices, entry.mesh.triangles));
      for (const state of COVERAGE_STATES) if (coverageOverlays[state].segments)
        coverageGpus[state] = createTerrainLineOverlayGpu(gl, coverageOverlays[state]);
      if (lineOverlay.segments) lineGpu = createTerrainLineOverlayGpu(gl, lineOverlay);
      options.onStatus?.("ready");
    } catch (error) { releaseGpu(); throw error; }
  };
  const draw = () => {
    frame = 0;
    rendered = false;
    if (disposed || lost || !active || width <= 0 || height <= 0) return;
    try {
      gl.viewport(0, 0, pixelWidth, pixelHeight);
      gl.clearColor(...options.background); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!scene || !program || !texture) return;
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      gl.disable(gl.BLEND); gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
      gl.uniform1i(gl.getUniformLocation(program, "uTextures"), 0);
      const viewProjection = orbitViewProjection(camera, width / height);
      const planes = terrainClipPlanes(viewProjection);
      gl.uniformMatrix4fv(gl.getUniformLocation(program, "uViewProjection"), false, viewProjection);
      const offsetLocation = gl.getUniformLocation(program, "uOffset");
      scene.entries.forEach(entry => {
        if (!sectionIntersectsView(entry.mesh.origin, camera.target, planes)) return;
        const offset = entry.mesh.origin.map((value, axis) => value - camera.target[axis]);
        gl.uniform3f(offsetLocation, offset[0], offset[1], offset[2]);
        const mesh = meshes.get(entry.id);
        if (!mesh) throw new Error("Terrain GPU entry is missing");
        gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
      });
      for (const state of COVERAGE_STATES) {
        const resource = coverageGpus[state]; if (resource) drawTerrainLineOverlay(gl, resource, coverageOverlays[state], camera,
          viewProjection, pixelWidth, pixelHeight, width, COVERAGE_STYLES[state]);
      }
      if (lineGpu) drawTerrainLineOverlay(gl, lineGpu, lineOverlay, camera, viewProjection, pixelWidth, pixelHeight, width);
      gl.bindVertexArray(null);
      if (gl.getError() !== gl.NO_ERROR) throw new Error("Terrain drawing failed");
      rendered = true;
    } catch (error) { options.onStatus?.("failed", error); }
  };
  const invalidate = () => { rendered = false; if (!frame && !disposed && !lost && active) frame = requestAnimationFrame(draw); };
  const onLost = (event: Event) => {
    event.preventDefault(); lost = true; rendered = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0; meshes = new Map(); texture = null; program = null; lineGpu = null; coverageGpus = emptyCoverageGpu();
    options.onStatus?.("context-lost");
  };
  const onRestored = () => {
    if (disposed) return;
    lost = false;
    try { rebuild(); invalidate(); } catch (error) { options.onStatus?.("failed", error); }
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  const assertOpen = () => { if (disposed) throw new Error("Terrain renderer is disposed"); };
  return {
    setScene(scope: TerrainScope, textures: TerrainTextureArray, entries: readonly TerrainDrawEntry[]) {
      assertOpen();
      // Never leave a previous world's terrain visible after a rejected replacement.
      releaseGpu(); scene = null; invalidate();
      assertTerrainScope(scope);
      if (entries.length > 256 ||
        new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error("Invalid terrain scene identity or size");
      validateTextureArray(textures);
      const meshBytes = entries.reduce((sum, entry) => sum + entry.mesh.blockIndices.length * (4 * VERTEX_FLOATS * 4 + 6 * 4), 0);
      if (meshBytes + textureGpuBytes(textures) + lineOverlay.gpuBytes + coverageBytes() > gpuBudget)
        throw new Error("Terrain scene exceeds graphics memory budget");
      const prepared = entries.map(entry => prepareTerrainEntry(entry, textures.layers));
      scene = { scope: { ...scope }, textures: { size: textures.size, layers: textures.layers, rgba: new Uint8Array(textures.rgba) }, entries: prepared };
      try { rebuild(); invalidate(); } catch (error) { scene = null; options.onStatus?.("failed", error); throw error; }
    },
    /** Same-source transaction: only changed entries upload. Late updates cannot clear a new world. */
    updateEntries(scope: TerrainScope, upsert: readonly TerrainDrawEntry[], remove: readonly string[] = []) {
      assertOpen(); assertTerrainScope(scope);
      if (!scene || !sameTerrainScope(scope, scene.scope)) throw new Error("Terrain update belongs to another source");
      const ids = upsert.map(entry => entry.id), removed = new Set(remove);
      if (upsert.length > 256 || remove.length > 256 || new Set(ids).size !== ids.length || removed.size !== remove.length ||
        remove.some(id => typeof id !== "string" || !id.trim() || id.length > 512) || ids.some(id => removed.has(id)))
        throw new Error("Invalid terrain update identity or size");
      const replaced = new Set(ids);
      const retained = scene.entries.filter(entry => !removed.has(entry.id) && !replaced.has(entry.id));
      if (retained.length + upsert.length > 256) throw new Error("Terrain scene exceeds section limit");
      const incomingBytes = upsert.reduce((sum, entry) => sum + entry.mesh.blockIndices.length * (4 * VERTEX_FLOATS * 4 + 6 * 4), 0);
      // Stage before replacing live buffers. Include the temporary old + new allocation in the budget.
      const baseBytes = (lost ? retained : scene.entries).reduce((sum, entry) => sum + entryGpuBytes(entry), textureGpuBytes(scene.textures))
        + lineOverlay.gpuBytes + coverageBytes();
      if (baseBytes + incomingBytes > gpuBudget) throw new Error("Terrain update exceeds graphics memory budget including staging");
      const prepared = upsert.map(entry => prepareTerrainEntry(entry, scene!.textures.layers));
      const staged = new Map<string, TerrainGpuMesh>();
      try {
        if (!lost) for (const entry of prepared) staged.set(entry.id, createTerrainGpuMesh(gl, entry.vertices, entry.mesh.triangles));
      } catch (error) {
        for (const mesh of staged.values()) deleteTerrainGpuMesh(gl, mesh);
        invalidate(); options.onStatus?.("failed", error); throw error;
      }
      for (const id of [...removed, ...replaced]) {
        const previous = meshes.get(id);
        if (previous) deleteTerrainGpuMesh(gl, previous);
        meshes.delete(id);
      }
      for (const [id, mesh] of staged) meshes.set(id, mesh);
      scene.entries = [...retained, ...prepared];
      invalidate();
    },
    setLineOverlay(paths: readonly (readonly Point3[])[]) {
      assertOpen();
      const next = prepareTerrainLineOverlay(paths);
      const sceneBytes = scene?.entries.reduce((sum, entry) => sum + entryGpuBytes(entry), textureGpuBytes(scene.textures)) ?? 0;
      if (sceneBytes + next.gpuBytes + coverageBytes() > gpuBudget) throw new Error("Terrain line overlay exceeds graphics memory budget");
      let staged: TerrainLineOverlayGpu | null = null;
      try { if (!lost && scene && next.segments) staged = createTerrainLineOverlayGpu(gl, next); }
      catch (error) { options.onStatus?.("failed", error); throw error; }
      if (lineGpu) deleteTerrainLineOverlayGpu(gl, lineGpu);
      lineOverlay = next; lineGpu = staged; invalidate();
    },
    setCoverageOverlay(paths: TerrainCoveragePaths) {
      assertOpen();
      if (!paths || COVERAGE_STATES.some(state => !Array.isArray(paths[state]))) throw new Error("Invalid terrain coverage overlay");
      const next = Object.fromEntries(COVERAGE_STATES.map(state => [state, prepareTerrainLineOverlay(paths[state])])) as Record<TerrainCoverageState, TerrainLineOverlay>;
      const sceneBytes = scene?.entries.reduce((sum, entry) => sum + entryGpuBytes(entry), textureGpuBytes(scene.textures)) ?? 0;
      const nextBytes = COVERAGE_STATES.reduce((sum, state) => sum + next[state].gpuBytes, 0);
      if (sceneBytes + lineOverlay.gpuBytes + nextBytes > gpuBudget) throw new Error("Terrain coverage overlay exceeds graphics memory budget");
      const staged = emptyCoverageGpu();
      try {
        if (!lost && scene) for (const state of COVERAGE_STATES) if (next[state].segments)
          staged[state] = createTerrainLineOverlayGpu(gl, next[state]);
      } catch (error) {
        for (const state of COVERAGE_STATES) if (staged[state]) deleteTerrainLineOverlayGpu(gl, staged[state]!);
        options.onStatus?.("failed", error); throw error;
      }
      for (const state of COVERAGE_STATES) if (coverageGpus[state]) deleteTerrainLineOverlayGpu(gl, coverageGpus[state]!);
      coverageOverlays = next; coverageGpus = staged; invalidate();
    },
    getStats() {
      assertOpen();
      const geometryBytes = scene?.entries.reduce((sum, entry) => sum + entryGpuBytes(entry), 0) ?? 0;
      const textureBytes = scene ? textureGpuBytes(scene.textures) : 0;
      const coverageSegments = COVERAGE_STATES.reduce((sum, state) => sum + coverageOverlays[state].segments, 0);
      return { entries: scene?.entries.length ?? 0, faces: scene?.entries.reduce((sum, entry) => sum + entry.mesh.blockIndices.length, 0) ?? 0,
        gpuEntries: meshes.size, geometryBytes, textureBytes, overlaySegments: lineOverlay.segments,
        overlayBytes: lineOverlay.gpuBytes, coverageSegments, coverageBytes: coverageBytes(),
        chargedGpuBytes: lost ? 0 : geometryBytes + textureBytes + (lineGpu ? lineOverlay.gpuBytes : 0) +
          COVERAGE_STATES.reduce((sum, state) => sum + (coverageGpus[state] ? coverageOverlays[state].gpuBytes : 0), 0), maxGpuBytes: gpuBudget };
    },
    clear() { assertOpen(); releaseGpu(); scene = null; invalidate(); },
    renderNow() { assertOpen(); if (frame) cancelAnimationFrame(frame); draw(); },
    captureFrame() {
      assertOpen();
      if (!scene || lost || !active || width <= 0 || height <= 0) throw new Error("Terrain frame is unavailable");
      if (frame) cancelAnimationFrame(frame);
      draw();
      if (!rendered) throw new Error("Terrain frame did not render");
      const pixels = new Uint8Array(pixelWidth * pixelHeight * 4);
      gl.readPixels(0, 0, pixelWidth, pixelHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      if (gl.getError() !== gl.NO_ERROR) throw new Error("Terrain frame capture failed");
      return { width: pixelWidth, height: pixelHeight, pixels };
    },
    setCamera(value: OrbitCamera) { assertOpen(); camera = normalizeOrbitCamera(value); invalidate(); },
    resize(cssWidth: number, cssHeight: number, ratio: number) {
      assertOpen();
      if (![cssWidth, cssHeight, ratio].every(Number.isFinite) || cssWidth < 0 || cssHeight < 0 || ratio <= 0) throw new Error("Invalid terrain viewport");
      width = cssWidth; height = cssHeight; rendered = false;
      if (!width || !height) return;
      const scale = Math.min(ratio, maxDimension / width, maxDimension / height, Math.sqrt(16777216 / (width * height)));
      pixelWidth = Math.max(1, Math.round(width * scale)); pixelHeight = Math.max(1, Math.round(height * scale));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      invalidate();
    },
    setActive(value: boolean) {
      assertOpen(); active = value;
      if (!active && frame) { cancelAnimationFrame(frame); frame = 0; }
      else invalidate();
    },
    /** CPU ray test against retained terrain; a small endpoint tolerance keeps markers attached to their own surface visible. */
    isPointOccluded(point: Point3, tolerance = 2) {
      assertOpen();
      if (point.length !== 3 || Array.from(point).some(value => !Number.isFinite(value))
        || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 16) throw new Error("Invalid terrain occlusion point");
      if (!scene || lost || !active || width <= 0 || height <= 0) return false;
      const { backward } = cameraBasis(camera);
      const origin = camera.target.map((value, axis) => value + backward[axis] * camera.distance) as [number, number, number];
      const delta = point.map((value, axis) => value - origin[axis]) as [number, number, number];
      const distance = Math.hypot(...delta);
      if (!Number.isFinite(distance) || distance <= tolerance) return false;
      const ray = { origin, direction: delta.map(value => value / distance) as [number, number, number] };
      const interval = terrainRayInterval(camera, ray), far = Math.min(interval.far, distance - tolerance);
      if (far <= interval.near) return false;
      const planes = terrainClipPlanes(orbitViewProjection(camera, width / height));
      return scene.entries.some(entry => sectionIntersectsView(entry.mesh.origin, camera.target, planes)
        && pickSectionMesh(ray, entry.mesh, far, interval.near) !== null);
    },
    pick(x: number, y: number) {
      assertOpen();
      if (!scene || !rendered || lost || !active || width <= 0 || height <= 0 || x < 0 || y < 0 || x > width || y > height) return null;
      const ray = cameraRay(camera, x, y, width, height);
      const interval = terrainRayInterval(camera, ray);
      const planes = terrainClipPlanes(orbitViewProjection(camera, width / height));
      let result: (NonNullable<ReturnType<typeof pickSectionMesh>> & { entryId: string; scope: TerrainScope }) | null = null;
      for (const entry of scene.entries) {
        if (!sectionIntersectsView(entry.mesh.origin, camera.target, planes)) continue;
        const hit = pickSectionMesh(ray, entry.mesh, result?.distance ?? interval.far, interval.near);
        if (hit) result = { ...hit, entryId: entry.id, scope: { ...scene.scope } };
      }
      return result;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0; releaseGpu(); scene = null; lineOverlay = prepareTerrainLineOverlay([]); coverageOverlays = emptyCoverage();
      canvas.removeEventListener("webglcontextlost", onLost); canvas.removeEventListener("webglcontextrestored", onRestored);
    },
  };
};

export type TerrainRenderer = ReturnType<typeof createTerrainRenderer>;
