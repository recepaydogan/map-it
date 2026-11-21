import assert from "node:assert/strict";
import { cameraBasis, cameraRay, normalizeOrbitCamera, orbitCamera, orbitViewProjection, panOrbitCamera, projectOrbitPoint, zoomOrbitCamera } from "../src/features/terrain/orbit-camera.ts";
import { meshVoxelSection, VOXEL_FACES } from "../src/features/terrain/mesh-voxel-section.ts";
import { voxelIndex } from "../src/features/terrain/voxel-section.ts";
import { pickSectionMesh } from "../src/features/terrain/pick-section-mesh.ts";
import { buildTerrainVertices, validateTextureArray, VERTEX_FLOATS } from "../src/features/terrain/terrain-draw-data.ts";
import { sectionIntersectsView, terrainClipPlanes, terrainRayInterval } from "../src/features/terrain/terrain-view-volume.ts";
import { createTerrainRenderer } from "../src/features/terrain/terrain-renderer.ts";
import { buildTerrainLineVertices, prepareTerrainLineOverlay } from "../src/features/terrain/terrain-line-overlay.ts";
import { checkingTerrainCoverageVolumes, loadedTerrainCoverageVolumes, terrainCoverageVolumePaths } from "../src/features/terrain/terrain-coverage-volume.ts";
import { flipTerrainFrameRows } from "../src/features/terrain/terrain-frame-canvas.ts";

let checks = 0;
const check = (name, run) => { run(); checks++; console.log(`PASS ${name}`); };
const close = (actual, expected, epsilon = 1e-7) => assert(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
const camera = { target: [8, 8, 8], yaw: 0, pitch: 0, distance: 32 };
const makeMesh = (blocks = [[8, 8, 8]], origin = [0, 0, 0], cutawayY = null) => {
  const section = { palette: [{ id: "fixture:empty", properties: {} }, { id: "fixture:solid", properties: {} }], indices: new Uint16Array(4096) };
  for (const [x, y, z] of blocks) section.indices[voxelIndex(x, y, z)] = 1;
  return meshVoxelSection(section, { origin, cutawayY, shapes: ["empty", "opaque-cube"] });
};
const materials = Array.from({ length: 2 }, () => Array.from({ length: 6 }, (_, tile) => ({ tile, tint: [1, 0.5, 0.25] })));
const entry = (mesh = makeMesh()) => ({ id: "section", mesh, materials });
const textures = () => ({ size: 1, layers: 6, rgba: new Uint8Array(24).fill(255) });
const scope = { worldId: "fixture-world", dimension: "fixture", sourceId: "fixture-source", revision: 1 };

check("camera normalization rejects nonfinite values and bounds pitch, yaw and distance", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => normalizeOrbitCamera({ ...camera, distance: value }));
    assert.throws(() => normalizeOrbitCamera({ ...camera, target: [value, 0, 0] }));
  }
  const bounded = normalizeOrbitCamera({ ...camera, yaw: 10 * Math.PI, pitch: 8, distance: 1e9 });
  close(bounded.yaw, 0); assert(bounded.pitch < Math.PI / 2); assert.equal(bounded.distance, 4096);
  assert.equal(normalizeOrbitCamera({ ...camera, distance: -1 }).distance, 2);
  assert.notEqual(normalizeOrbitCamera(camera).target, camera.target);
});

check("orbit basis is orthonormal at several headings and near both poles", () => {
  for (const yaw of [-3, 0, 1.3]) for (const pitch of [-1.56, 0, 1.56]) {
    const basis = Object.values(cameraBasis({ ...camera, yaw, pitch }));
    for (const vector of basis) close(Math.hypot(...vector), 1);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++)
      close(basis[i].reduce((sum, value, axis) => sum + value * basis[j][axis], 0), 0);
  }
});

check("center ray faces the target; edge rays use CSS aspect and unit directions", () => {
  const ray = cameraRay(camera, 400, 200, 800, 400);
  assert.deepEqual(ray.origin, [8, 8, 40]); close(ray.direction[2], -1);
  const corner = cameraRay(camera, 800, 0, 800, 400);
  assert(corner.direction[0] > 0 && corner.direction[1] > 0);
  close(corner.direction[0] / corner.direction[1], 2); close(Math.hypot(...corner.direction), 1);
  assert.throws(() => cameraRay(camera, 0, 0, 0, 10));
  assert.throws(() => cameraRay(camera, NaN, 0, 10, 10));
});

check("view matrices are invariant under large positive and negative world translations", () => {
  const matrix = orbitViewProjection(camera, 2);
  for (const target of [[30_000_000, -64, -30_000_000], [-30_000_000, 320, 30_000_000]])
    assert.deepEqual(orbitViewProjection({ ...camera, target }, 2), matrix);
  assert.throws(() => orbitViewProjection(camera, 0));
});

check("terrain frame readback flips WebGL rows without changing pixels", () => {
  const pixels = new Uint8Array([
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 255, 255,
  ]);
  assert.deepEqual([...flipTerrainFrameRows({ width: 2, height: 2, pixels })], [
    0, 0, 255, 255, 255, 255, 255, 255,
    255, 0, 0, 255, 0, 255, 0, 255,
  ]);
  assert.throws(() => flipTerrainFrameRows({ width: 2, height: 2, pixels: pixels.subarray(1) }));
});

check("world-point projection is target-relative, screen-oriented and rejects points behind the camera", () => {
  const center = projectOrbitPoint(camera, camera.target, 800, 400);
  close(center.left, 400); close(center.top, 200); assert.equal(center.visible, true);
  assert(projectOrbitPoint(camera, [12, 8, 8], 800, 400).left > center.left);
  assert.equal(projectOrbitPoint(camera, [8, 8, 50], 800, 400), null);
  const moved = { ...camera, target: [30_000_000, 8, -30_000_000] };
  const translated = projectOrbitPoint(moved, moved.target, 800, 400);
  close(translated.left, center.left); close(translated.top, center.top);
  assert.throws(() => projectOrbitPoint(camera, [0, 0, 0], 0, 400));
});

check("orbit, pan and zoom preserve independent camera ownership and clamp extremes", () => {
  assert.equal(orbitCamera(camera, 10, 5).pitch, 0.03);
  const panned = panOrbitCamera(camera, 20, 10, 400);
  assert(panned.target[0] < camera.target[0]); assert(panned.target[1] > camera.target[1]);
  assert.deepEqual(camera.target, [8, 8, 8]);
  assert(zoomOrbitCamera(camera, -100).distance < camera.distance);
  assert.equal(zoomOrbitCamera({ ...camera, distance: 4096 }, 1e8).distance, 4096);
  assert.throws(() => panOrbitCamera(camera, 0, 0, 0));
});

check("all six emitted faces pick the correct block and face at negative world coordinates", () => {
  const origin = [-30_000_000, -64, 30_000_000], local = [2, 5, 7];
  const mesh = makeMesh([local], origin);
  VOXEL_FACES.forEach(({ normal }, face) => {
    const ray = { origin: origin.map((value, axis) => value + local[axis] + 0.5 + normal[axis] * 5), direction: normal.map(value => -value) };
    const hit = pickSectionMesh(ray, mesh);
    assert(hit); assert.equal(hit.face, face); assert.equal(hit.paletteIndex, 1); close(hit.distance, 4.5);
    assert.deepEqual(hit.block, origin.map((value, axis) => value + local[axis]));
  });
});

check("selection returns the nearest visible cube, with misses and back faces excluded", () => {
  const mesh = makeMesh([[8, 8, 8], [8, 8, 12]]);
  const ray = { origin: [8.5, 8.5, 20], direction: [0, 0, -1] };
  assert.deepEqual(pickSectionMesh(ray, mesh).block, [8, 8, 12]);
  assert.equal(pickSectionMesh(ray, mesh, 6), null);
  assert.equal(pickSectionMesh({ ...ray, origin: [18, 8, 20] }, mesh), null);
  assert.equal(pickSectionMesh({ origin: [8.5, 8.5, 8.5], direction: [0, 0, 1] }, makeMesh()), null);
});

check("cutaway removes upper blocks from picking and exposes labeled lower faces", () => {
  const mesh = makeMesh([[8, 8, 8], [8, 9, 8]], [0, 0, 0], 8);
  const hit = pickSectionMesh({ origin: [8.5, 20, 8.5], direction: [0, -1, 0] }, mesh);
  assert.deepEqual(hit.block, [8, 8, 8]); assert.equal(hit.face, 3); assert.equal(hit.flags, 2);
});

check("near-clipped faces cannot intercept a pick intended for visible terrain", () => {
  const mesh = makeMesh([[8, 8, 8], [8, 8, 6]]);
  const ray = { origin: [8.5, 8.5, 9.05], direction: [0, 0, -1] };
  assert.deepEqual(pickSectionMesh(ray, mesh).block, [8, 8, 8]);
  assert.deepEqual(pickSectionMesh(ray, mesh, 100, 0.1).block, [8, 8, 6]);
});

check("perspective far clipping uses forward depth even for an oblique screen ray", () => {
  const center = terrainRayInterval(camera, cameraRay(camera, 400, 200, 800, 400));
  close(center.near, 0.1); close(center.far, 16384);
  const edgeRay = cameraRay(camera, 800, 0, 800, 400);
  const edge = terrainRayInterval(camera, edgeRay);
  assert(edge.far > center.far); close(edge.far * -edgeRay.direction[2], 16384);
  assert.throws(() => terrainRayInterval(camera, { origin: [0, 0, 0], direction: [0, 0, 1] }));
});

check("frustum rejects sections behind, beside, above and beyond the camera, not intersecting boxes", () => {
  const planes = terrainClipPlanes(orbitViewProjection(camera, 1));
  assert(sectionIntersectsView([0, 0, 0], camera.target, planes));
  for (const origin of [[0, 0, 64], [512, 0, 0], [-512, 0, 0], [0, 512, 0], [0, -512, 0], [0, 0, -20000]])
    assert.equal(sectionIntersectsView(origin, camera.target, planes), false);
  assert(sectionIntersectsView([16, 0, 0], camera.target, planes));
  const shiftedTarget = camera.target.map(value => value + 30_000_000);
  assert(sectionIntersectsView([30_000_000, 30_000_000, 30_000_000], shiftedTarget, planes));
  assert.throws(() => terrainClipPlanes(new Float32Array(4)));
});

check("draw vertices retain per-face material, tint, normal and coverage metadata", () => {
  const item = entry(makeMesh([[0, 0, 0]]));
  const data = buildTerrainVertices(item, 6);
  assert.equal(data.length, 6 * 4 * VERTEX_FLOATS);
  for (let face = 0; face < 6; face++) {
    const offset = face * 4 * VERTEX_FLOATS;
    assert.equal(data[offset + 8], face);
    assert.deepEqual([...data.slice(offset + 9, offset + 12)], [1, 0.5, 0.25]);
    assert.equal(data[offset + 12], item.mesh.faceFlags[face]);
  }
});

check("draw validation rejects wrong triangle identity, geometry, material and texture bounds", () => {
  for (const mutate of [
    item => { item.mesh.triangles[0] = 1; },
    item => { item.mesh.positions[0] += 0.5; },
    item => { item.mesh.normals[0] = 1; },
    item => { item.mesh.blockIndices[0] = 0; },
    item => { item.mesh.faceFlags[0] = 4; },
  ]) { const item = entry(); mutate(item); assert.throws(() => buildTerrainVertices(item, 6)); }
  assert.throws(() => buildTerrainVertices(entry(), 5));
  assert.throws(() => buildTerrainVertices({ ...entry(), materials: [] }, 6));
  validateTextureArray(textures());
  for (const bad of [{ ...textures(), size: 257 }, { ...textures(), layers: 0 }, { ...textures(), rgba: new Uint8Array(23) }])
    assert.throws(() => validateTextureArray(bad));
});

check("terrain line overlays own bounded paths and retain target-relative precision", () => {
  const source = [[[29_999_990, 70, -29_999_990], [29_999_991, 71, -29_999_988], [29_999_993, 72, -29_999_985]]];
  const overlay = prepareTerrainLineOverlay(source);
  assert.equal(overlay.points, 3); assert.equal(overlay.segments, 2); assert.equal(overlay.gpuBytes, 2 * 6 * 7 * 4);
  source[0][0][0] = 0;
  const vertices = buildTerrainLineVertices(overlay, [29_999_990, 70, -29_999_990]);
  assert.deepEqual([...vertices.slice(0, 7)], [0, 0, 0, 1, 1, 2, -1]);
  assert.throws(() => prepareTerrainLineOverlay([[[Infinity, 0, 0], [0, 0, 0]]]));
  assert.throws(() => prepareTerrainLineOverlay(Array.from({ length: 4_097 }, () => [[0, 0, 0], [1, 0, 0]])));
  assert.throws(() => buildTerrainLineVertices(overlay, [NaN, 0, 0]));
});

check("coverage volumes preserve source bounds, merge loaded sections and clip wireframes at cutaway", () => {
  const checking = checkingTerrainCoverageVolumes([{ chunkX: -2, chunkZ: 3 }], -4, 19);
  assert.deepEqual(checking, [{ x: -32, z: 48, minY: -64, maxY: 320, state: "checking" }]);
  const loaded = loadedTerrainCoverageVolumes([
    { id: "low", origin: [-32, -64, 48], status: "ready" },
    { id: "high", origin: [-32, -48, 48], status: "partial" },
    { id: "other", origin: [0, 0, 0], status: "ready" },
  ]);
  assert.deepEqual(loaded, [
    { x: -32, z: 48, minY: -64, maxY: -32, state: "partial" },
    { x: 0, z: 0, minY: 0, maxY: 16, state: "ready" },
  ]);
  const clipped = terrainCoverageVolumePaths(loaded, -48);
  assert.equal(clipped.partial.length, 6); assert.equal(clipped.ready.length, 0);
  assert(clipped.partial[1].every(point => point[1] === -47));
  assert.equal(terrainCoverageVolumePaths(loaded, -65).partial.length, 0);
  assert.throws(() => checkingTerrainCoverageVolumes([{ chunkX: Number.MAX_SAFE_INTEGER, chunkZ: 0 }], -4, 19));
  assert.throws(() => loadedTerrainCoverageVolumes([{ id: "bad", origin: [0, 0, 0], status: "checking" }]));
  assert.throws(() => terrainCoverageVolumePaths([{ x: 0, z: 0, minY: 2, maxY: 1, state: "ready" }], null));
});

// The stub tests lifecycle/state only. Real shader, texture and pixel evidence comes from the browser diagnostic.
const rendererFixture = (options = {}) => {
  let drawCalls = 0, error = 0, nextFrame = 0;
  let uploads = 0, bufferUpdates = 0, overlayDrawCalls = 0, textureUploads = 0, programs = 0, deletedVaos = 0;
  let mipmapCalls = 0;
  let failUpload = false, failUploadAt = -1;
  const frames = new Map(), statuses = [], textureParameters = [];
  globalThis.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const constants = new Map();
  const gl = new Proxy({
    getParameter: key => key === gl.MAX_VIEWPORT_DIMS ? [8192, 8192] : 8192,
    getError: () => { const result = error; error = 0; return result; },
    NO_ERROR: 0, isContextLost: () => false,
    createProgram: () => { programs++; return {}; }, createShader: () => ({}), createTexture: () => ({}), createVertexArray: () => ({}), createBuffer: () => ({}),
    bufferData: () => { uploads++; if (failUpload || uploads === failUploadAt) { failUpload = false; throw new Error("fixture upload failure"); } },
    bufferSubData: () => { bufferUpdates++; },
    texImage3D: () => { textureUploads++; },
    texParameteri: (...parameters) => { textureParameters.push(parameters); },
    generateMipmap: () => { mipmapCalls++; },
    deleteVertexArray: () => { deletedVaos++; },
    getShaderParameter: () => true, getProgramParameter: () => true, getUniformLocation: () => ({}),
    drawElements: () => { drawCalls++; },
    drawArrays: () => { overlayDrawCalls++; },
  }, { get: (target, key) => {
    if (key in target) return target[key];
    if (/^[A-Z_0-9]+$/.test(key)) { if (!constants.has(key)) constants.set(key, constants.size + 1); return constants.get(key); }
    return () => {};
  } });
  const canvas = new EventTarget(); canvas.width = 1; canvas.height = 1; canvas.getContext = () => gl;
  const renderer = createTerrainRenderer(canvas, { background: [0, 0, 0, 1], onStatus: status => statuses.push(status), ...options });
  renderer.resize(800, 400, 2); renderer.setCamera({ ...camera, target: [8.5, 8.5, 8.5] });
  return { renderer, canvas, statuses, frames, drawCalls: () => drawCalls, failDraw: () => { error = 999; },
    failUpload: () => { failUpload = true; }, failUploadAt: value => { failUploadAt = value; },
    textureState: () => ({
      min: textureParameters.find(([, parameter]) => parameter === gl.TEXTURE_MIN_FILTER)?.[2],
      mag: textureParameters.find(([, parameter]) => parameter === gl.TEXTURE_MAG_FILTER)?.[2],
      nearest: gl.NEAREST,
      nearestMipNearest: gl.NEAREST_MIPMAP_NEAREST,
      nearestMipLinear: gl.NEAREST_MIPMAP_LINEAR,
      mipmapCalls,
    }),
    counters: () => ({ uploads, bufferUpdates, overlayDrawCalls, textureUploads, programs, deletedVaos }) };
};

check("terrain occlusion hides points behind blocks but retains markers attached to their surface", () => {
  const { renderer } = rendererFixture();
  renderer.setCamera(camera); renderer.setScene(scope, textures(), [entry()]);
  assert.equal(renderer.isPointOccluded(camera.target), false);
  assert.equal(renderer.isPointOccluded([8, 8, -8]), true);
  assert.equal(renderer.isPointOccluded([18, 8, 8]), false);
  assert.throws(() => renderer.isPointOccluded([NaN, 0, 0]));
  renderer.dispose();
});

check("renderer picks only a successfully drawn scene and retains exact source identity", () => {
  const fixture = rendererFixture(), { renderer } = fixture;
  renderer.setScene(scope, textures(), [entry()]);
  const sampler = fixture.textureState();
  assert.equal(sampler.mag, sampler.nearest);
  assert.equal(sampler.min, sampler.nearestMipNearest);
  assert.notEqual(sampler.min, sampler.nearestMipLinear);
  assert.equal(sampler.mipmapCalls, 1);
  assert.equal(renderer.pick(400, 200), null);
  renderer.renderNow();
  const hit = renderer.pick(400, 200); assert(hit); assert.deepEqual(hit.scope, scope); assert.equal(hit.entryId, "section");
  hit.scope.worldId = "mutated"; assert.equal(renderer.pick(400, 200).scope.worldId, scope.worldId);
  renderer.setCamera(camera); assert.equal(renderer.pick(400, 200), null);
  renderer.dispose();
});

check("depth-tested line overlays draw, reuse relative buffers and recover with the terrain context", () => {
  const fixture = rendererFixture(), { renderer, canvas } = fixture;
  renderer.setScene(scope, textures(), [entry()]);
  renderer.setLineOverlay([[[8, 9, 20], [8, 9, 8], [10, 9, 6]]]);
  assert.equal(renderer.getStats().overlaySegments, 2);
  assert.equal(renderer.getStats().overlayBytes, 2 * 6 * 7 * 4);
  renderer.renderNow();
  const first = fixture.counters(); assert.equal(first.overlayDrawCalls, 2); assert.equal(first.bufferUpdates, 1);
  renderer.setCamera({ ...camera, target: [8.5, 8.5, 8.5], yaw: 0.5 }); renderer.renderNow();
  const orbit = fixture.counters(); assert.equal(orbit.overlayDrawCalls, 4); assert.equal(orbit.bufferUpdates, 1);
  renderer.setCamera({ ...camera, target: [9, 8.5, 8.5] }); renderer.renderNow();
  assert.equal(fixture.counters().bufferUpdates, 2);
  canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  assert.equal(renderer.getStats().chargedGpuBytes, 0);
  canvas.dispatchEvent(new Event("webglcontextrestored")); renderer.renderNow();
  assert.equal(renderer.getStats().overlaySegments, 2); assert.equal(fixture.counters().bufferUpdates, 3);
  renderer.setLineOverlay([]); renderer.renderNow(); assert.equal(renderer.getStats().overlaySegments, 0);
  assert.equal(fixture.counters().overlayDrawCalls, 8); renderer.dispose();
});

check("coverage layers draw independently from the journey and recover atomically with context", () => {
  const fixture = rendererFixture(), { renderer, canvas } = fixture;
  renderer.setScene(scope, textures(), [entry()]);
  renderer.setLineOverlay([[[8, 9, 20], [8, 9, 8]]]);
  renderer.setCoverageOverlay({
    checking: [[[0, 0, 0], [1, 0, 0]]],
    partial: [[[0, 1, 0], [1, 1, 0]]],
    ready: [[[0, 2, 0], [1, 2, 0]]],
  });
  let stats = renderer.getStats();
  assert.equal(stats.overlaySegments, 1); assert.equal(stats.coverageSegments, 3);
  assert.equal(stats.coverageBytes, 3 * 6 * 7 * 4);
  renderer.renderNow(); assert.equal(fixture.counters().overlayDrawCalls, 8);
  canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  assert.equal(renderer.getStats().chargedGpuBytes, 0);
  canvas.dispatchEvent(new Event("webglcontextrestored")); renderer.renderNow();
  stats = renderer.getStats(); assert.equal(stats.overlaySegments, 1); assert.equal(stats.coverageSegments, 3);
  renderer.setCoverageOverlay({ checking: [], partial: [], ready: [] });
  assert.equal(renderer.getStats().coverageSegments, 0); assert.equal(renderer.getStats().overlaySegments, 1);
  renderer.dispose();

  const limited = rendererFixture({ maxGpuBytes: 1_600 }).renderer;
  limited.setScene(scope, textures(), [entry()]);
  limited.setCoverageOverlay({ checking: [], partial: [], ready: [[[0, 0, 0], [1, 0, 0]]] });
  assert.equal(limited.getStats().coverageSegments, 1);
  assert.throws(() => limited.setCoverageOverlay({ checking: [], partial: [],
    ready: [[[0, 0, 0], [1, 0, 0], [2, 0, 0]]] }), /memory budget/);
  assert.equal(limited.getStats().coverageSegments, 1); limited.dispose();
});

check("line overlay budgets reject replacement without losing the current route", () => {
  const { renderer } = rendererFixture({ maxGpuBytes: 1_600 });
  renderer.setScene(scope, textures(), [entry()]);
  renderer.setLineOverlay([[[8, 9, 20], [8, 9, 8]]]);
  assert.equal(renderer.getStats().chargedGpuBytes, 1_592);
  assert.throws(() => renderer.setLineOverlay([[[8, 9, 20], [8, 9, 8], [10, 9, 6]]]), /memory budget/);
  assert.equal(renderer.getStats().overlaySegments, 1); renderer.renderNow(); renderer.dispose();
});

check("renderer owns its buffers and does not retain prior-world data after rejected replacement", () => {
  const { renderer } = rendererFixture(), item = entry();
  renderer.setScene(scope, textures(), [item]); item.mesh.blockIndices.fill(0); item.mesh.positions.fill(0);
  renderer.renderNow(); assert.deepEqual(renderer.pick(400, 200).block, [8, 8, 8]);
  assert.throws(() => renderer.setScene({ ...scope, worldId: "" }, textures(), [entry()]));
  renderer.renderNow(); assert.equal(renderer.pick(400, 200), null); renderer.dispose();
});

check("draw failure prevents phantom picks and context recovery rebuilds the retained scene", () => {
  const fixture = rendererFixture(), { renderer, canvas, statuses } = fixture;
  renderer.setScene(scope, textures(), [entry()]); renderer.renderNow();
  fixture.failDraw(); renderer.renderNow(); assert.equal(statuses.at(-1), "failed"); assert.equal(renderer.pick(400, 200), null);
  const lost = new Event("webglcontextlost", { cancelable: true }); canvas.dispatchEvent(lost);
  assert(lost.defaultPrevented); assert.equal(statuses.at(-1), "context-lost"); assert.equal(renderer.pick(400, 200), null);
  canvas.dispatchEvent(new Event("webglcontextrestored")); renderer.renderNow();
  assert.equal(statuses.at(-1), "ready"); assert(renderer.pick(400, 200)); renderer.dispose();
});

check("frustum culling skips GPU calls for offscreen sections while preserving visible terrain", () => {
  const fixture = rendererFixture(), { renderer } = fixture;
  renderer.setScene(scope, textures(), [entry(), { ...entry(makeMesh([[8, 8, 8]], [512, 0, 0])), id: "offscreen" }]);
  renderer.renderNow(); assert.equal(fixture.drawCalls(), 1); assert(renderer.pick(400, 200)); renderer.dispose();
});

check("hidden, zero-sized, cleared and disposed renderers cannot select stale blocks", () => {
  const fixture = rendererFixture(), { renderer, frames } = fixture;
  renderer.setScene(scope, textures(), [entry()]); renderer.renderNow();
  renderer.setActive(false); assert.equal(frames.size, 0); assert.equal(renderer.pick(400, 200), null);
  renderer.setActive(true); renderer.renderNow(); assert(renderer.pick(400, 200));
  renderer.resize(0, 0, 1); assert.equal(renderer.pick(0, 0), null);
  renderer.resize(800, 400, 1); renderer.renderNow(); assert(renderer.pick(400, 200));
  renderer.clear(); assert.equal(renderer.pick(400, 200), null);
  renderer.dispose(); renderer.dispose(); assert.equal(frames.size, 0); assert.throws(() => renderer.renderNow());
});

check("incremental additions upload only the new geometry and reuse textures and shaders", () => {
  const fixture = rendererFixture(), { renderer } = fixture;
  renderer.setScene(scope, textures(), [entry()]);
  const before = fixture.counters();
  renderer.updateEntries(scope, [{ ...entry(makeMesh([[8, 8, 8]], [16, 0, 0])), id: "new" }]);
  assert.deepEqual(fixture.counters(), { ...before, uploads: before.uploads + 2 });
  assert.equal(renderer.getStats().entries, 2); assert.equal(renderer.getStats().gpuEntries, 2);
  renderer.renderNow(); assert.equal(renderer.pick(400, 200).entryId, "section");
  renderer.dispose();
});
check("replacement and eviction remove stale picks and only release affected GPU entries", () => {
  const fixture = rendererFixture(), { renderer } = fixture;
  renderer.setScene(scope, textures(), [entry(), { ...entry(makeMesh([[8, 8, 8]], [16, 0, 0])), id: "other" }]);
  const before = fixture.counters();
  renderer.updateEntries(scope, [entry(makeMesh([[8, 8, 12]]))]);
  assert.equal(renderer.pick(400, 200), null);
  renderer.renderNow(); assert.deepEqual(renderer.pick(400, 200).block, [8, 8, 12]);
  assert.equal(fixture.counters().deletedVaos, before.deletedVaos + 1);
  const current = fixture.counters();
  renderer.updateEntries(scope, [], ["section"]); renderer.renderNow();
  assert.equal(renderer.pick(400, 200), null); assert.equal(renderer.getStats().entries, 1);
  assert.equal(fixture.counters().uploads, current.uploads);
  assert.equal(fixture.counters().deletedVaos, current.deletedVaos + 1);
  renderer.dispose();
});
check("late or malformed incremental updates cannot damage the current valid scene", () => {
  const { renderer } = rendererFixture(); renderer.setScene(scope, textures(), [entry()]); renderer.renderNow();
  for (const patch of [{ worldId: "new" }, { dimension: "other" }, { sourceId: "other" }, { revision: 2 }])
    assert.throws(() => renderer.updateEntries({ ...scope, ...patch }, [], ["section"]), /another source/);
  assert.throws(() => renderer.updateEntries(scope, [entry(), entry()]), /identity/);
  assert.throws(() => renderer.updateEntries(scope, [entry()], ["section"]), /identity/);
  assert.throws(() => renderer.updateEntries(scope, [{ ...entry(), id: " " }]), /identity/);
  assert.throws(() => renderer.updateEntries(scope, [{ ...entry(), materials: [] }]), /material/);
  assert.equal(renderer.getStats().entries, 1); assert(renderer.pick(400, 200)); renderer.dispose();
});
check("incremental updates retain independent owned buffers for recovery and picking", () => {
  const { renderer, canvas } = rendererFixture(); renderer.setScene(scope, textures(), []);
  const next = entry(); renderer.updateEntries(scope, [next]);
  next.mesh.blockIndices.fill(0); next.mesh.positions.fill(0);
  canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  assert.equal(renderer.getStats().chargedGpuBytes, 0);
  renderer.updateEntries(scope, [{ ...entry(makeMesh([[8, 8, 12]])), id: "recovered" }], ["section"]);
  assert.equal(renderer.getStats().gpuEntries, 0);
  canvas.dispatchEvent(new Event("webglcontextrestored")); renderer.renderNow();
  assert.equal(renderer.getStats().gpuEntries, 1); assert.equal(renderer.pick(400, 200).entryId, "recovered");
  renderer.dispose();
});
check("staging memory is bounded before GPU allocation and explicit eviction releases capacity", () => {
  // One isolated cube: 6 faces × (4 vertices × 13 floats × 4 bytes + 6 indices × 4 bytes) = 1392 bytes.
  const fixture = rendererFixture({ maxGpuBytes: 1450 }), { renderer } = fixture;
  renderer.setScene(scope, textures(), [entry()]);
  const before = fixture.counters();
  assert.throws(() => renderer.updateEntries(scope, [entry()]), /including staging/);
  assert.deepEqual(fixture.counters(), before);
  renderer.updateEntries(scope, [], ["section"]);
  renderer.updateEntries(scope, [entry()]); renderer.renderNow();
  assert.equal(renderer.getStats().chargedGpuBytes, 1424); assert(renderer.pick(400, 200)); renderer.dispose();
});
check("failed incremental upload preserves prior entries and releases staged resources", () => {
  const fixture = rendererFixture(), { renderer } = fixture;
  renderer.setScene(scope, textures(), [entry()]);
  const before = fixture.counters(); fixture.failUpload();
  assert.throws(() => renderer.updateEntries(scope, [entry(makeMesh([[8, 8, 12]]))]), /fixture upload failure/);
  assert.equal(fixture.counters().deletedVaos, before.deletedVaos + 1);
  assert.equal(renderer.getStats().entries, 1); renderer.renderNow();
  assert.deepEqual(renderer.pick(400, 200).block, [8, 8, 8]);
  const staged = fixture.counters(); fixture.failUploadAt(staged.uploads + 3);
  assert.throws(() => renderer.updateEntries(scope, [entry(makeMesh([[8, 8, 12]])), { ...entry(), id: "second" }]), /fixture upload failure/);
  assert.equal(fixture.counters().deletedVaos, staged.deletedVaos + 2);
  assert.equal(renderer.getStats().entries, 1); renderer.renderNow();
  assert.deepEqual(renderer.pick(400, 200).block, [8, 8, 8]); renderer.dispose();
});

delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
console.log(`${checks} terrain renderer checks passed.`);
