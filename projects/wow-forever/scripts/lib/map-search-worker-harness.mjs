import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

const root = fileURLToPath(new URL("../../", import.meta.url));
const built = await build({ entryPoints: [fileURLToPath(new URL("../../src/features/map/map-search-worker.ts", import.meta.url))],
  bundle: true, write: false, format: "cjs", platform: "browser", define: { "import.meta.env": "{}" } });
const source = `const { parentPort } = require("node:worker_threads");
globalThis.self = { postMessage: (data, options) => parentPort.postMessage(data, options?.transfer ?? []) };
parentPort.on("message", data => self.onmessage({ data }));
${built.outputFiles[0].text}`;

export function createSearchWorker() {
  return new Worker(source, { eval: true });
}

export async function loadSearchFunctions() {
  const bundle = await build({ stdin: { contents: 'export * from "./src/features/map/map-global-search.ts"; export * from "./src/features/map/map-fuzzy-search.ts"; export * from "./src/features/map/map-search-match.ts";',
    resolveDir: root, loader: "ts" }, bundle: true, write: false, format: "esm", platform: "node", define: { "import.meta.env": "{}" } });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
}

export function queryWorker(worker, request) {
  return new Promise((resolve, reject) => {
    const onMessage = result => {
      if (result.id !== request.id) return;
      cleanup();
      if (result.type === "error") reject(new Error("Search worker failed"));
      else resolve(result);
    };
    const cleanup = () => { worker.off("message", onMessage); worker.off("error", onError); };
    const onError = error => { cleanup(); reject(error); };
    worker.on("message", onMessage);
    worker.on("error", onError);
    worker.postMessage(request);
  });
}
