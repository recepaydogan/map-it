type FrameCallback = (time: number) => void;

interface OpenSeadragonFrameHost {
  requestAnimationFrame: (callback: FrameCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
}

interface ScheduledFrame {
  run: FrameCallback;
  timeoutId: number | null;
  nativeFrameId: number | null;
}

/** OpenSeadragon normally requests a frame forever, even when its world is
 * static. Overwolf's software OSR presents that idle surface at game cadence
 * and starves every app window sharing the renderer. Four idle checks a second
 * keep async tile work responsive without continuously presenting the map. */
const IDLE_FRAME_INTERVAL_MS = 250;
/** Covers OpenSeadragon's 200 ms tile blend and the tail of an input gesture. */
const ACTIVE_FRAME_WINDOW_MS = 350;

let wakeInstalledScheduler: (() => void) | null = null;

export const installDeepZoomFrameScheduler = (candidate: unknown): void => {
  if (wakeInstalledScheduler) return;
  const host = candidate as OpenSeadragonFrameHost;
  if (typeof host.requestAnimationFrame !== "function"
    || typeof host.cancelAnimationFrame !== "function") {
    throw new Error("OpenSeadragon does not expose its frame scheduler.");
  }

  const requestNativeFrame = host.requestAnimationFrame;
  const cancelNativeFrame = host.cancelAnimationFrame;
  const scheduledFrames = new Map<number, ScheduledFrame>();
  let nextHandle = -1;
  let activeUntil = performance.now() + ACTIVE_FRAME_WINDOW_MS;

  const schedule = (frame: ScheduledFrame) => {
    if (performance.now() < activeUntil) {
      frame.nativeFrameId = requestNativeFrame(frame.run);
      return;
    }
    frame.timeoutId = window.setTimeout(() => {
      frame.timeoutId = null;
      frame.nativeFrameId = requestNativeFrame(frame.run);
    }, IDLE_FRAME_INTERVAL_MS);
  };

  host.requestAnimationFrame = (callback) => {
    const handle = nextHandle;
    nextHandle -= 1;
    const frame: ScheduledFrame = {
      run: (time) => {
        if (!scheduledFrames.delete(handle)) return;
        callback(time);
      },
      timeoutId: null,
      nativeFrameId: null,
    };
    scheduledFrames.set(handle, frame);
    schedule(frame);
    return handle;
  };

  host.cancelAnimationFrame = (handle) => {
    const frame = scheduledFrames.get(handle);
    if (!frame) {
      // A viewer created just before installation may still own one native
      // handle. Let OpenSeadragon cancel that handle through the original API.
      cancelNativeFrame(handle);
      return;
    }
    scheduledFrames.delete(handle);
    if (frame.timeoutId !== null) window.clearTimeout(frame.timeoutId);
    if (frame.nativeFrameId !== null) cancelNativeFrame(frame.nativeFrameId);
  };

  wakeInstalledScheduler = () => {
    activeUntil = performance.now() + ACTIVE_FRAME_WINDOW_MS;
    for (const frame of scheduledFrames.values()) {
      if (frame.timeoutId === null) continue;
      window.clearTimeout(frame.timeoutId);
      frame.timeoutId = null;
      frame.nativeFrameId = requestNativeFrame(frame.run);
    }
  };
};

/** Promotes a pending idle check to the next native frame. Camera changes and
 * tile arrivals call this, so throttling is never visible during interaction. */
export const wakeDeepZoomFrames = (): void => {
  wakeInstalledScheduler?.();
};
