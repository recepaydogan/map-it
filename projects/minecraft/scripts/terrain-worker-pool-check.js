import { createBrowserTerrainPool } from "../src/features/terrain/create-browser-terrain-pool.ts";

const result = document.getElementById("result"), checks = [];
const scope = { worldId: "native-fixture", dimension: "fixture", sourceId: "memory", revision: 1 };
const job = () => ({ kind: "mesh", source: { origin: [-16, -64, 32], shapes: ["opaque-cube"],
  section: { palette: [{ id: "fixture:solid", properties: {} }], indices: new Uint16Array(4096) } } });
const assert = (value, message) => { if (!value) throw new Error(message); };
const rejected = async (promise, code) => {
  try { await promise; } catch (error) { assert(error.code === code, `Expected ${code}, got ${error.code}`); return; }
  throw new Error(`Expected ${code} rejection`);
};
const pass = text => { checks.push(`PASS ${text}`); result.textContent = checks.join("\n"); };
const pool = createBrowserTerrainPool({ maxWorkers: 1, maxJobs: 2, timeoutMs: 10000 });
window.addEventListener("pagehide", () => pool.dispose(), { once: true });
try {
  pool.setScope(scope);
  const input = job(), first = pool.submit(scope, input), second = pool.submit(scope, job());
  await rejected(pool.submit(scope, job()), "budget");
  const [mesh] = await Promise.all([first, second]);
  assert(mesh.kind === "mesh" && mesh.value.blockIndices.length === 1536, "Worker geometry mismatch");
  assert(input.source.section.indices.byteLength === 8192, "Caller storage was detached");
  assert(pool.getStats().pending === 0 && pool.getStats().queuedBytes === 0, "Completed work remains queued");
  pass("native mesh output, caller-buffer ownership and bounded queue");

  const abort = new AbortController();
  const cancelled = rejected(pool.submit(scope, job(), abort.signal), "cancelled");
  const following = pool.submit(scope, job()); abort.abort();
  await cancelled; assert((await following).kind === "mesh", "Replacement worker did not complete");
  pass("active cancellation terminates work and replacement worker continues");

  const staleActive = rejected(pool.submit(scope, job()), "stale");
  const staleQueued = rejected(pool.submit(scope, job()), "stale");
  const nextScope = { ...scope, worldId: "native-other", revision: 2 }; pool.setScope(nextScope);
  await Promise.all([staleActive, staleQueued]);
  await rejected(pool.submit(scope, job()), "stale");
  assert((await pool.submit(nextScope, job())).kind === "mesh", "New world work failed");
  pass("world/revision switch rejects active, queued and obsolete submissions");

  await rejected(pool.submit(nextScope, { ...job(), source: { ...job().source, shapes: [] } }), "worker");
  const cut = await pool.submit(nextScope, { ...job(), cutawayY: -62 });
  assert(cut.value.blockIndices.every(index => (index >> 8) <= 2), "Removed cutaway blocks survived");
  assert(cut.value.faceFlags.filter(value => value === 2).length === 256, "Cutaway cap mismatch");
  pass("decode/mesh errors surface and the next cutaway task still succeeds");

  const disposeActive = rejected(pool.submit(nextScope, job()), "disposed");
  const disposeQueued = rejected(pool.submit(nextScope, job()), "disposed"); pool.dispose();
  await Promise.all([disposeActive, disposeQueued]);
  assert(pool.getStats().workers === 0 && pool.getStats().pending === 0, "Disposed workers remain");
  pass("disposal closes workers and rejects remaining jobs");
  result.textContent += "\nPASS: 5 native worker lifecycle checks; synthetic fixtures only";
} catch (error) { result.textContent += `\nFAIL: ${error.message}`; }
finally { pool.dispose(); }
