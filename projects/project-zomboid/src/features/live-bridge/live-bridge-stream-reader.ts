/**
 * Reads an append-only Bridge file through Overwolf's native line stream.
 *
 * Position must not use `readFileContents` as its hot path: that call opens and
 * closes the snapshot for every sample and blocks the shared extension
 * renderer. `listenOnFile` keeps the native handle and delivers only appended
 * lines, leaving the map's main thread free to paint.
 */
import { recordWork } from "../live-position/live-position-diagnostics";
import { getLiveBridgeFileCandidates } from "./live-bridge-paths";

const UTF8_ENCODING = "UTF8" as overwolf.io.enums.eEncoding;
const STARTUP_PROBE_INTERVAL_MS = 1_000;
const PATH_DISCOVERY_INTERVAL_MS = 5_000;

interface LiveBridgeStreamOptions<TPayload> {
  debugLabel?: string;
  relativePath: string;
  parse: (line: string) => TPayload | null;
  publish: (payload: TPayload) => void;
  onFirstLine?: () => void;
  resolveSwitch?: (line: string) => string | null;
  siblingFileName?: (currentFileName: string) => string;
}

const fileExists = (path: string) => new Promise<boolean>((resolve) => {
  overwolf.io.exist(path, (result) => resolve(Boolean(result.success && result.exist)));
});

let listenerSequence = 0;
const resolvedPaths = new Map<string, string>();

export const startLiveBridgeStreamReader = <TPayload>({
  debugLabel,
  relativePath,
  parse,
  publish,
  onFirstLine,
  resolveSwitch,
  siblingFileName,
}: LiveBridgeStreamOptions<TPayload>): (() => void) => {
  if (typeof overwolf === "undefined" || !overwolf.io?.listenOnFile) return () => undefined;

  const debugPrefix = debugLabel ? `[${debugLabel}]` : null;
  let stopped = false;
  let starting = false;
  let listenerId: string | null = null;
  let activePath: string | null = null;
  let firstPayloadDelivered = false;
  let listenerStartedAt = 0;
  let nextDiscoveryAt = 0;

  const stopListener = () => {
    if (!listenerId) return;
    const id = listenerId;
    listenerId = null;
    overwolf.io.stopFileListener(id);
  };

  const findPath = async () => {
    const cached = resolvedPaths.get(relativePath);
    if (cached) return cached;
    if (Date.now() < nextDiscoveryAt) return null;
    nextDiscoveryAt = Date.now() + PATH_DISCOVERY_INTERVAL_MS;
    for (const candidate of getLiveBridgeFileCandidates(relativePath)) {
      if (!await fileExists(candidate)) continue;
      resolvedPaths.set(relativePath, candidate);
      return candidate;
    }
    return null;
  };

  const start = async () => {
    if (stopped || starting || listenerId) return;
    starting = true;
    try {
      const path = activePath ?? await findPath();
      if (!path || stopped) return;
      activePath = path;
      listenerSequence += 1;
      const id = `pzim-stream-${listenerSequence}`;
      listenerId = id;
      listenerStartedAt = Date.now();
      if (debugPrefix) console.log(`${debugPrefix}[stream-start]`, path);

      overwolf.io.listenOnFile(
        id,
        path,
        { skipToEnd: true, encoding: UTF8_ENCODING },
        (result) => {
          if (stopped || listenerId !== id) return;
          if (!result.success) {
            console.error(`${debugPrefix ?? "[Live Bridge]"}[stream-error]`, result.error);
            stopListener();
            return;
          }

          const line = result.content?.trim();
          if (!line) return;
          const nextFileName = resolveSwitch?.(line);
          if (nextFileName) {
            activePath = path.replace(/[^\\]+$/, nextFileName);
            stopListener();
            void start();
            return;
          }

          recordWork("stream", () => {
            const payload = parse(line);
            if (!payload) return;
            if (!firstPayloadDelivered) {
              firstPayloadDelivered = true;
              onFirstLine?.();
              if (debugPrefix) console.log(`${debugPrefix}[stream-live]`);
            }
            publish(payload);
          });
        },
      );
    } finally {
      starting = false;
    }
  };

  const startupProbe = window.setInterval(() => {
    if (stopped) return;
    if (!listenerId) {
      void start();
      return;
    }
    // Both files exist. Before the first line we may have attached to the idle
    // sibling, so alternate once a second until the active writer is found.
    // After delivery begins, rotation handovers name the next file explicitly.
    if (firstPayloadDelivered || Date.now() - listenerStartedAt < STARTUP_PROBE_INTERVAL_MS) return;
    if (activePath && siblingFileName) {
      const currentFileName = activePath.split("\\").pop() ?? "";
      activePath = activePath.replace(/[^\\]+$/, siblingFileName(currentFileName));
    }
    stopListener();
    void start();
  }, STARTUP_PROBE_INTERVAL_MS);

  void start();

  return () => {
    stopped = true;
    window.clearInterval(startupProbe);
    stopListener();
  };
};
