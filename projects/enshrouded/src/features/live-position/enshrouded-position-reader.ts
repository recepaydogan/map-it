import { clearLivePosition, publishLivePosition } from "./live-position-store";
import type { LivePosition } from "./live-position-types";

interface NativeReader {
  start(processId: number, callback: (result: { success: boolean }) => void): void;
  getSnapshot(callback: (snapshot: string) => void): void;
  stop(callback: () => void): void;
}

let sequence = 0;

/** Native X/Z are the ground plane; the map's vertical axis points south. */
export const decodeNativePosition = (raw: string, now: number):
  { sourceSequence: number; position: LivePosition } | null => {
  try {
    const sample = JSON.parse(raw);
    if (sample?.state !== "live" || !Number.isSafeInteger(sample.sequence) || sample.sequence < 1
      || ![sample.x, sample.y, sample.z, sample.dx, sample.dz].every(Number.isFinite)
      || sample.x < 0 || sample.x > 11000 || sample.z < 0 || sample.z > 11000
      || sample.y < -2000 || sample.y > 5000
      || Math.abs(sample.dx) > 1.001 || Math.abs(sample.dz) > 1.001) return null;
    return {
      sourceSequence: sample.sequence,
      position: {
        version: 1, sequence: ++sequence,
        x: sample.x, y: 10240 - sample.z, z: sample.y,
        dx: sample.dx, dy: -sample.dz, updatedAt: now, receivedAt: now,
      },
    };
  } catch { return null; }
};

/** One reader in the background window. At most one native request is pending. */
export const startEnshroudedPositionReader = (processId: number): (() => void) => {
  let stopped = false;
  let reader: NativeReader | null = null;
  let timer: number | undefined;
  let lastSequence = 0;
  let hasPosition = false;
  sequence = Math.max(sequence, Date.now() * 1000);
  clearLivePosition();

  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timer);
    try { reader?.stop(() => {}); } catch { /* Host may already have exited. */ }
    clearLivePosition();
  };
  const poll = () => {
    if (stopped || !reader) return;
    timer = window.setTimeout(stop, 3000);
    try {
      reader.getSnapshot((raw) => {
        if (stopped) return;
        window.clearTimeout(timer);
        const sample = decodeNativePosition(raw, Date.now());
        if (sample && sample.sourceSequence > lastSequence) {
          lastSequence = sample.sourceSequence;
          hasPosition = true;
          publishLivePosition(sample.position);
        } else if (!sample && hasPosition) {
          hasPosition = false;
          clearLivePosition();
        }
        timer = window.setTimeout(poll, sample ? 50 : 500);
      });
    } catch { stop(); }
  };

  timer = window.setTimeout(stop, 5000);
  try {
    overwolf.extensions.current.getExtraObject("enshrouded-position-reader", (result) => {
      if (stopped) return;
      window.clearTimeout(timer);
      if (!result.success || !result.object) { stop(); return; }
      reader = result.object as NativeReader;
      timer = window.setTimeout(stop, 3000);
      try {
        reader.start(processId, (started) => {
          if (stopped) return;
          window.clearTimeout(timer);
          if (!started.success) { stop(); return; }
          poll();
        });
      } catch { stop(); }
    });
  } catch { stop(); }
  return stop;
};
