import { assertTerrainScope, sameTerrainScope } from "./terrain-scope.ts";
import type { TerrainScope } from "./terrain-scope.ts";
import { copyTerrainWorkData } from "./terrain-work-data.ts";
import type { TerrainWork, TerrainWorkRequest, TerrainWorkResponse, TerrainWorkResult } from "./terrain-work-types.ts";

export type TerrainWorkErrorCode = "cancelled" | "stale" | "disposed" | "budget" | "timeout" | "protocol" | "worker";
export class TerrainWorkError extends Error {
  readonly code: TerrainWorkErrorCode;
  constructor(code: TerrainWorkErrorCode, message: string) { super(message); this.name = "TerrainWorkError"; this.code = code; }
}

type WorkerPort = Pick<Worker, "postMessage" | "terminate" | "addEventListener" | "removeEventListener">;
export interface TerrainWorkerPoolOptions {
  maxWorkers?: number; maxJobs?: number; maxQueuedBytes?: number; timeoutMs?: number;
}

/** Source-scoped bounded work. Cancellation terminates running synchronous CPU work, not just its promise. */
export const createTerrainWorkerPool = <Work extends { kind: string } = TerrainWork, Result extends { kind: string } = TerrainWorkResult>(
  createWorker: () => WorkerPort, options: TerrainWorkerPoolOptions = {},
) => {
  interface Pending {
    request: TerrainWorkRequest<Work>; bytes: number; transfer: ArrayBuffer[];
    resolve: (value: Result) => void; reject: (error: unknown) => void;
    detachAbort?: () => void; timer?: ReturnType<typeof setTimeout>; slot?: Slot;
  }
  interface Slot { worker: WorkerPort; pending?: Pending; message: EventListener; failure: EventListener }
  const maxWorkers = options.maxWorkers ?? 1, maxJobs = options.maxJobs ?? 32;
  const maxBytes = options.maxQueuedBytes ?? 64 * 1024 * 1024, timeoutMs = options.timeoutMs ?? 30000;
  if (!Number.isInteger(maxWorkers) || maxWorkers < 1 || maxWorkers > 4 || !Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 256 ||
    !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 256 * 1024 * 1024 ||
    !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error("Invalid terrain worker limits");
  const slots = new Set<Slot>(), pending = new Map<number, Pending>(), queue: Pending[] = [];
  let scope: TerrainScope | null = null, disposed = false, sequence = 0, queuedBytes = 0, pumping = false;

  const destroySlot = (slot: Slot) => {
    slots.delete(slot);
    slot.worker.removeEventListener("message", slot.message);
    slot.worker.removeEventListener("error", slot.failure);
    slot.worker.removeEventListener("messageerror", slot.failure);
    slot.worker.terminate();
  };
  const settle = (job: Pending, error?: unknown, result?: Result) => {
    if (!pending.delete(job.request.id)) return;
    const index = queue.indexOf(job); if (index !== -1) queue.splice(index, 1);
    queuedBytes -= job.bytes; clearTimeout(job.timer); job.detachAbort?.();
    if (job.slot) job.slot.pending = undefined;
    if (error !== undefined) job.reject(error);
    else if (result) job.resolve(result);
    else job.reject(new TerrainWorkError("protocol", "Terrain result is missing"));
  };
  const stopJob = (job: Pending, error: TerrainWorkError) => {
    if (!pending.has(job.request.id)) return;
    if (job.slot) destroySlot(job.slot);
    settle(job, error); pump();
  };
  const makeSlot = (): Slot => {
    const worker = createWorker();
    const slot: Slot = { worker, message: () => {}, failure: () => {} };
    slot.message = event => {
      if (!slots.has(slot) || disposed) return;
      const job = slot.pending;
      if (!job) { destroySlot(slot); return; }
      const response = (event as MessageEvent<TerrainWorkResponse<Result>>).data;
      try {
        assertTerrainScope(response.scope);
        if (response.id !== job.request.id || !scope || !sameTerrainScope(response.scope, scope) || !sameTerrainScope(response.scope, job.request.scope) ||
          (response.ok !== true && response.ok !== false) ||
          (response.ok ? !response.result || response.result.kind !== job.request.work.kind : typeof response.error !== "string"))
          throw new Error("Mismatched terrain worker response");
      } catch (error) {
        stopJob(job, new TerrainWorkError("protocol", error instanceof Error ? error.message : "Invalid terrain response")); return;
      }
      if (response.ok) settle(job, undefined, response.result);
      else settle(job, new TerrainWorkError("worker", response.error));
      pump();
    };
    slot.failure = event => {
      if (!slots.has(slot) || disposed) return;
      event.preventDefault();
      const error = new TerrainWorkError("worker", "message" in event && typeof event.message === "string" ? event.message : "Terrain worker message could not be read");
      if (slot.pending) stopJob(slot.pending, error);
      else { destroySlot(slot); pump(); }
    };
    worker.addEventListener("message", slot.message);
    worker.addEventListener("error", slot.failure);
    worker.addEventListener("messageerror", slot.failure);
    slots.add(slot); return slot;
  };
  function pump() {
    if (pumping || disposed) return;
    pumping = true;
    try {
      while (queue.length) {
        let slot = [...slots].find(item => !item.pending);
        if (!slot && slots.size >= maxWorkers) break;
        const job = queue.shift()!;
        try {
          slot ??= makeSlot(); slot.pending = job; job.slot = slot;
          job.timer = setTimeout(() => stopJob(job, new TerrainWorkError("timeout", "Terrain worker exceeded its deadline")), timeoutMs);
          slot.worker.postMessage(job.request, job.transfer);
          job.transfer = [];
        } catch (error) {
          if (slot) destroySlot(slot);
          settle(job, new TerrainWorkError("worker", error instanceof Error ? error.message : "Terrain worker could not start"));
        }
      }
    } finally { pumping = false; }
  }
  const clear = (error: TerrainWorkError) => {
    for (const slot of [...slots]) destroySlot(slot);
    for (const job of pending.values()) settle(job, error);
  };
  return {
    setScope(next: TerrainScope | null) {
      if (disposed) throw new TerrainWorkError("disposed", "Terrain worker pool is disposed");
      if (next) assertTerrainScope(next);
      if ((!scope && !next) || (scope && next && sameTerrainScope(scope, next))) return;
      scope = next ? { ...next } : null;
      clear(new TerrainWorkError("stale", "Terrain source changed"));
    },
    submit(requestedScope: TerrainScope, work: Work, signal?: AbortSignal): Promise<Result> {
      if (disposed) return Promise.reject(new TerrainWorkError("disposed", "Terrain worker pool is disposed"));
      if (signal?.aborted) return Promise.reject(new TerrainWorkError("cancelled", "Terrain work cancelled"));
      if (!scope || !sameTerrainScope(scope, requestedScope)) return Promise.reject(new TerrainWorkError("stale", "Terrain work belongs to another source"));
      if (pending.size >= maxJobs) return Promise.reject(new TerrainWorkError("budget", "Terrain queue is full"));
      let snapshot: ReturnType<typeof copyTerrainWorkData<Work>>;
      try { snapshot = copyTerrainWorkData(work, maxBytes - queuedBytes); }
      catch (error) { return Promise.reject(new TerrainWorkError("budget", error instanceof Error ? error.message : "Terrain request cannot be queued")); }
      return new Promise((resolve, reject) => {
        const job: Pending = { request: { id: ++sequence, scope: { ...scope! }, work: snapshot.value },
          bytes: snapshot.bytes, transfer: snapshot.transfer, resolve, reject };
        pending.set(job.request.id, job); queue.push(job); queuedBytes += job.bytes;
        if (signal) {
          const abort = () => stopJob(job, new TerrainWorkError("cancelled", "Terrain work cancelled"));
          signal.addEventListener("abort", abort, { once: true }); job.detachAbort = () => signal.removeEventListener("abort", abort);
        }
        pump();
      });
    },
    getStats() { return { pending: pending.size, queued: queue.length, active: [...slots].filter(slot => slot.pending).length, workers: slots.size, queuedBytes }; },
    dispose() { if (disposed) return; disposed = true; scope = null; clear(new TerrainWorkError("disposed", "Terrain worker pool is disposed")); },
  };
};

export type TerrainWorkerPool = ReturnType<typeof createTerrainWorkerPool<TerrainWork, TerrainWorkResult>>;
