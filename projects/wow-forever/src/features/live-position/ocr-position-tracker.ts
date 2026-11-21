import type { Worker } from "tesseract.js";
import { isTargetGame } from "../../game-config";
import { clearLivePosition, LIVE_POSITION_FRESH_MS, publishLivePosition, readLivePosition } from "./live-position-store";
import { projectGepPosition } from "./gep-position";
import { createOcrFrameReader, loadPositionOcr } from "./ocr-engine";
import { facingToWorldVector } from "./ocr-panel";
import { createOcrGameCapture } from "./ocr-game-capture";
import { setTrackingStatus } from "./tracking-status";

const FRESH_FOR_MS = 2_500;
const CAPTURE_INTERVAL_MS = 200;
const RETRY_INTERVAL_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, duration: number) {
  let timer: number | undefined;
  return Promise.race([promise, new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error("Timed out")), duration);
  })]).finally(() => window.clearTimeout(timer));
}

export function createOcrPositionTracker() {
  let stopSession: (() => void) | undefined;
  let expiresAt = 0;
  let sequence = Date.now();

  function clear() {
    expiresAt = 0;
    if (readLivePosition()?.source !== "ocr") return;
    clearLivePosition();
    setTrackingStatus("connecting");
  }

  return {
    isLive: () => Date.now() < expiresAt && readLivePosition()?.source === "ocr",
    game(running: boolean) {
      stopSession?.();
      stopSession = undefined;
      if (!running) return;

      let disposed = false, loggedFailure = false;
      let capture = createOcrGameCapture();
      if (!capture) return;
      const reader = createOcrFrameReader();
      let timer: number | undefined;
      let worker: Worker | undefined;
      let heartbeat: number | undefined, heartbeatAt = 0;
      const releaseCapture = () => {
        capture?.close();
        capture = null;
        void worker?.terminate();
        worker = undefined;
      };
      stopSession = () => {
        disposed = true;
        window.clearTimeout(timer);
        releaseCapture();
        clear();
      };

      async function scan() {
        if (disposed) return;
        if (expiresAt && Date.now() >= expiresAt) clear();
        let delay = CAPTURE_INTERVAL_MS;
        const yieldToGep = () => {
          const latest = readLivePosition();
          if (latest?.source !== "gep") return false;
          const remaining = latest.receivedAt + LIVE_POSITION_FRESH_MS - Date.now();
          if (remaining <= 0) return false;
          releaseCapture();
          expiresAt = 0;
          heartbeat = undefined;
          delay = Math.min(RETRY_INTERVAL_MS, remaining);
          return true;
        };
        try {
          if (yieldToGep()) return;
          const info = await withTimeout(new Promise<overwolf.games.GetRunningGameInfoResult | null>(
            resolve => overwolf.games.getRunningGameInfo(resolve)), 3000);
          if (disposed || yieldToGep()) return;
          if (!info?.isRunning || !isTargetGame(info)) {
            clear();
            return;
          }
          capture ??= createOcrGameCapture();
          if (!capture) return;
          const frame = await withTimeout(capture.next(), 3000);
          if (disposed || yieldToGep()) return;
          const metadata = reader.prepare(frame);
          if (!metadata) {
            if (!expiresAt || Date.now() >= expiresAt) delay = RETRY_INTERVAL_MS;
            return;
          }
          if (!worker) {
            let cancelled = false;
            const loading = loadPositionOcr(error => console.warn("[Position OCR] Worker error", error))
              .then(engine => {
                if (disposed || cancelled) void engine.terminate();
                return engine;
              });
            try { worker = await withTimeout(loading, 15_000); }
            catch (error) { cancelled = true; throw error; }
          }
          if (disposed || yieldToGep()) return;
          const sample = await withTimeout(reader.recognize(worker, metadata), 4000);
          if (disposed || yieldToGep() || !sample) return;
          const now = Date.now();
          if (sample.heartbeat !== heartbeat) {
            heartbeat = sample.heartbeat;
            heartbeatAt = now;
          }
          if (now - heartbeatAt >= FRESH_FOR_MS) return;
          const point = projectGepPosition(sample);
          if (!point) {
            clear();
            return;
          }

          if (!expiresAt) console.info("[Position OCR] Connected to the in-game coordinate panel");
          expiresAt = heartbeatAt + FRESH_FOR_MS;
          loggedFailure = false;
          publishLivePosition({ version: 1, ...point, source: "ocr", sequence: ++sequence,
            ...facingToWorldVector(sample.facing), updatedAt: now, receivedAt: now });
          setTrackingStatus("live");
        } catch (error) {
          if (disposed) return;
          releaseCapture();
          delay = RETRY_INTERVAL_MS;
          if (!loggedFailure) console.warn("[Position OCR] Capture or recognition failed", error);
          loggedFailure = true;
        } finally {
          if (!disposed) timer = window.setTimeout(() => void scan(), delay);
        }
      }
      void scan();
    },
  };
}
