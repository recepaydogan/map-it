import { assertTerrainScope } from "./terrain-scope.ts";
import { copyTerrainWorkData } from "./terrain-work-data.ts";
import type { TerrainWorkRequest, TerrainWorkResponse } from "./terrain-work-types.ts";

/** Shared, sequential worker protocol for decoding, meshing and generated map data. */
export const installSourceWorker = <Work, Result>(run: (work: Work) => Promise<Result>, maxOutputBytes: number) => {
  const worker = globalThis as unknown as {
    onmessage: ((event: MessageEvent<TerrainWorkRequest<Work>>) => void) | null;
    postMessage(message: TerrainWorkResponse<Result>, transfer?: Transferable[]): void;
  };
  let busy = false;
  worker.onmessage = async ({ data }) => {
    const { id, scope, work } = data;
    if (busy) { worker.postMessage({ id, scope, ok: false, error: "Overlapping source request" }); return; }
    try {
      assertTerrainScope(scope);
      if (!Number.isSafeInteger(id) || id < 1) throw new Error("Invalid source request");
      busy = true;
      const output = copyTerrainWorkData(await run(work), maxOutputBytes);
      worker.postMessage({ id, scope, ok: true, result: output.value }, output.transfer);
    } catch (error) {
      worker.postMessage({ id, scope, ok: false, error: error instanceof Error ? error.message : "Source worker failed" });
    } finally { busy = false; }
  };
};
