import { recordLiveReadLatency } from "../live-position/live-position-diagnostics";
import { getLiveBridgeFileCandidates } from "./live-bridge-paths";

const REDISCOVERY_INTERVAL_MS = 3_000;
const UTF8_ENCODING = "UTF8" as overwolf.io.enums.eEncoding;

interface LiveBridgeFileReaderOptions<TPayload> {
  debugLabel?: string;
  relativePath: string;
  readIntervalMs: number;
  parse: (content: string) => TPayload | null;
  /** Optional freshness gate used only while choosing a file. Once connected,
   * structurally valid stale payloads keep the path alive during game pauses. */
  acceptCandidate?: (payload: TPayload) => boolean;
  getSequence: (payload: TPayload) => number;
  publish: (payload: TPayload) => void;
  clear: () => void;
  /** Position-like streams should clear at their lifecycle boundaries. Session
   * metadata may opt out so the last known game world survives game exit. */
  clearOnStart?: boolean;
  clearOnStop?: boolean;
  /** Time each read for the diagnostics line. Only the position stream wants
   *  this — the slower streams would only blur the numbers. */
  measure?: boolean;
}

const readTextFile = (path: string) => new Promise<string | null>((resolve) => {
  overwolf.io.readFileContents(
    path,
    UTF8_ENCODING,
    (result) => resolve(result.success && typeof result.content === "string" ? result.content : null),
  );
});

export const startLiveBridgeFileReader = <TPayload>({
  debugLabel,
  relativePath,
  readIntervalMs,
  parse,
  acceptCandidate = () => true,
  getSequence,
  publish,
  clear,
  clearOnStart = true,
  clearOnStop = true,
  measure = false,
}: LiveBridgeFileReaderOptions<TPayload>) => {
  if (typeof overwolf === "undefined" || !overwolf.io) return () => undefined;

  let stopped = false;
  let reading = false;
  let activePath: string | null = null;
  let lastSequence: number | null = null;
  let failedReads = 0;
  let nextDiscoveryAt = 0;
  const debugPrefix = debugLabel ? `[${debugLabel}]` : null;

  if (clearOnStart) clear();
  if (debugPrefix) console.log(`${debugPrefix}[reader-start]`, { relativePath });

  const tick = async () => {
    if (stopped || reading) return;
    reading = true;

    try {
      if (!activePath && Date.now() >= nextDiscoveryAt) {
        nextDiscoveryAt = Date.now() + REDISCOVERY_INTERVAL_MS;
        const candidates = getLiveBridgeFileCandidates(relativePath);
        if (debugPrefix) console.log(`${debugPrefix}[searching]`, candidates);
        for (const candidate of candidates) {
          const content = await readTextFile(candidate);
          const payload = content ? parse(content) : null;
          if (payload && acceptCandidate(payload)) {
            activePath = candidate;
            if (debugPrefix) console.log(`${debugPrefix}[file-found]`, candidate);
            break;
          }
        }
        if (!activePath && debugPrefix) console.warn(`${debugPrefix}[file-not-found]`);
      }

      if (!activePath) return;
      const content = await readTextFile(activePath);
      const payload = content ? parse(content) : null;
      if (!payload) {
        failedReads += 1;
        if (debugPrefix) console.warn(`${debugPrefix}[invalid-read]`, { activePath, failedReads });
        if (failedReads >= 6) {
          activePath = null;
          failedReads = 0;
          nextDiscoveryAt = 0;
        }
        return;
      }

      failedReads = 0;
      const sequence = getSequence(payload);
      if (sequence === lastSequence) return;
      lastSequence = sequence;
      publish(payload);
    } finally {
      reading = false;
    }
  };

  // Always leave the requested idle time AFTER a read. Overwolf IO can take
  // hundreds of milliseconds; subtracting that duration from the interval
  // reduced the delay to zero and turned a slow read into a permanently busy
  // loop precisely when the game started.
  let timer: number | null = null;
  const run = async () => {
    const startedAt = Date.now();
    await tick();
    if (measure) recordLiveReadLatency(Date.now() - startedAt);
    if (stopped) return;
    timer = window.setTimeout(() => void run(), readIntervalMs);
  };
  void run();

  return () => {
    stopped = true;
    if (timer !== null) window.clearTimeout(timer);
    if (clearOnStop) clear();
  };
};
