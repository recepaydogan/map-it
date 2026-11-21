/**
 * Why the marker moves the way it does, in numbers.
 *
 * Smoothness has four independent failure points and they all look identical on
 * screen: the Bridge can write unevenly, the samples can reach this window in
 * bursts, playback can outrun the stream so there is nothing to interpolate
 * towards, or the window can be too busy to paint what it was given. Guessing
 * between them is how a "smooth" marker ends up rewritten four times, so this
 * measures all four and reports one line every few seconds:
 *
 *   samples/s and the gap between them (the stream),
 *   clamp% and lead (was there anything to interpolate towards),
 *   marker writes/s (did the marker act on them),
 *   commits/s (how often the map itself re-rendered, follow mode),
 *   frame gap max and timer lag max (was the window able to keep up).
 *
 * clamp% near 100 means playback is pinned to the newest sample: the marker is
 * stepping at the sample rate, not gliding, whatever the rest of the numbers
 * say. A frame gap far above 16 ms with the samples arriving evenly is Overwolf
 * throttling animation frames for a window behind the game.
 *
 * Production builds never run these probes. Development diagnostics are
 * session-scoped and report to the console only: Overwolf file IO blocks the
 * renderer, so a runtime logger would become the performance problem it is
 * supposed to measure.
 */
import { liveTrackClockOffset } from "./live-position-track";

const REPORT_INTERVAL_MS = 15_000;

const isEnabled = (): boolean => {
  if (typeof import.meta.env === "undefined" || !import.meta.env.DEV) return false;
  try {
    return sessionStorage.getItem("pzim:live-debug") === "1";
  } catch {
    return false;
  }
};

const enabled = typeof window !== "undefined" && isEnabled();

let samples = 0;
let gapSum = 0;
let gapMax = 0;
let trackReads = 0;
let clampedReads = 0;
let leadSum = 0;
let leadMax = -Infinity;
let markerWrites = 0;
let viewCommits = 0;
let frames = 0;
let frameGapMax = 0;
let timerLagMax = 0;
let longTasks = 0;
let longTaskMs = 0;
let longTaskMax = 0;
/** Long tasks by culprit. "self" is this window's own script; an
 *  "…-descendant" name is an iframe, which in an Overwolf app means the ad. */
const longTaskSources = new Map<string, number>();
let reads = 0;
let readLatencySum = 0;
let readLatencyMax = 0;
let lastSampleAt = 0;
let windowStart = 0;
let probesStarted = false;

const startProbes = () => {
  if (probesStarted) return;
  probesStarted = true;
  let lastFrame = performance.now();
  const onFrame = (now: number) => {
    frames += 1;
    frameGapMax = Math.max(frameGapMax, now - lastFrame);
    lastFrame = now;
    window.requestAnimationFrame(onFrame);
  };
  window.requestAnimationFrame(onFrame);

  // The two ways a window stops painting look identical from the inside, and
  // the cure for each is the opposite of the other: if the main thread is
  // BLOCKED there are long tasks to find and remove, and if the window is
  // THROTTLED (Overwolf does this behind a fullscreen game) there are none —
  // the work has to leave the window instead. So count both.
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks += 1;
        longTaskMs += entry.duration;
        longTaskMax = Math.max(longTaskMax, entry.duration);
        longTaskSources.set(
          entry.name,
          (longTaskSources.get(entry.name) ?? 0) + Math.round(entry.duration),
        );
      }
    }).observe({ entryTypes: ["longtask"] });
  } catch {
    // No long-task timing in this build; the frame and timer numbers stand.
  }

  // Timers keep firing where frames stall, so the two together separate "the
  // window is throttled" from "the main thread is blocked".
  let lastTick = performance.now();
  window.setInterval(() => {
    const now = performance.now();
    timerLagMax = Math.max(timerLagMax, now - lastTick - 50);
    lastTick = now;
  }, 50);
};

/* ── the report ──────────────────────────────────────────────────────────── */

const report = (now: number) => {
  const seconds = (now - windowStart) / 1_000;
  const playbackReads = Math.max(1, trackReads);
  const line = `${new Date().toISOString().slice(11, 19)}`
    + ` · ${(samples / seconds).toFixed(1)} samples/s`
    + ` gap avg ${Math.round(gapSum / Math.max(1, samples))} max ${Math.round(gapMax)} ms`
    + ` · clamped ${Math.round((clampedReads / playbackReads) * 100)}%`
    + ` lead avg ${Math.round(leadSum / playbackReads)} max ${Math.round(leadMax)} ms`
    + ` · offset ${liveTrackClockOffset() ?? "-"} ms`
    + ` · reads ${(reads / seconds).toFixed(1)}/s`
    + ` io avg ${Math.round(readLatencySum / Math.max(1, reads))} max ${Math.round(readLatencyMax)} ms`
    + ` · marker ${(markerWrites / seconds).toFixed(1)}/s`
    + ` commits ${(viewCommits / seconds).toFixed(1)}/s`
    + ` · frames ${(frames / seconds).toFixed(1)}/s gap max ${Math.round(frameGapMax)} ms`
    + ` timer lag max ${Math.round(timerLagMax)} ms`
    + ` · blocked ${Math.round(longTaskMs / seconds)} ms/s`
    + ` in ${(longTasks / seconds).toFixed(1)} long tasks/s max ${Math.round(longTaskMax)} ms`
    + ` [${[...longTaskSources].map(([name, ms]) => `${name} ${ms}`).join(" ") || "-"}]`
    + ` · work ${[...work].map(([name, ms]) => `${name} ${Math.round(ms / seconds)}`).join(" ") || "-"} ms/s`
    + ` · ${document.visibilityState}${document.hasFocus() ? " focused" : ""}`;
  console.info(`[PZ Live Position] ${line}`);

  samples = 0;
  gapSum = 0;
  gapMax = 0;
  reads = 0;
  readLatencySum = 0;
  readLatencyMax = 0;
  trackReads = 0;
  clampedReads = 0;
  leadSum = 0;
  leadMax = -Infinity;
  markerWrites = 0;
  viewCommits = 0;
  frames = 0;
  frameGapMax = 0;
  timerLagMax = 0;
  longTasks = 0;
  longTaskMs = 0;
  longTaskMax = 0;
  longTaskSources.clear();
  work.clear();
  windowStart = now;
};

/**
 * Where the window's main thread actually goes, by entry point. The long-task
 * total says HOW MUCH is being blocked and `self` says it is our own code; only
 * this says which of our code, and the three buckets do not overlap.
 */
const work = new Map<string, number>();

export const recordWork = <T>(bucket: string, run: () => T): T => {
  if (!enabled) return run();
  const startedAt = performance.now();
  try {
    return run();
  } finally {
    work.set(bucket, (work.get(bucket) ?? 0) + (performance.now() - startedAt));
  }
};

/** One Bridge sample reached this window. */
export const recordLivePositionSample = (sample?: {
  sequence: number;
  x: number;
  y: number;
  updatedAt: number;
}): void => {
  if (!enabled) return;
  void sample;
  const now = performance.now();
  if (windowStart === 0) {
    windowStart = now;
    startProbes();
  }
  if (lastSampleAt !== 0) {
    const gap = now - lastSampleAt;
    gapSum += gap;
    gapMax = Math.max(gapMax, gap);
  }
  lastSampleAt = now;
  samples += 1;
  if (now - windowStart >= REPORT_INTERVAL_MS) report(now);
};

/**
 * Playback asked the track where the player was. `clamped` means there was no
 * later sample to interpolate towards — the single most useful number here,
 * because a clamped read is a step and an interpolated one is a glide.
 */
export const recordLiveTrackRead = (
  clamped: boolean,
  lead: number,
  point?: { x: number; y: number },
): void => {
  if (!enabled) return;
  void point;
  trackReads += 1;
  if (clamped) clampedReads += 1;
  leadSum += lead;
  leadMax = Math.max(leadMax, lead);
};

/**
 * How long one read of the Bridge file took, end to end. Read together with
 * the timer lag this separates the two ways a 20 Hz poll turns into 2 Hz:
 * slow IO (this number is large) or a starved event loop (the timer lag is
 * large and this one is not).
 */
export const recordLiveReadLatency = (ms: number): void => {
  if (!enabled) return;
  reads += 1;
  readLatencySum += ms;
  readLatencyMax = Math.max(readLatencyMax, ms);
};

/** The marker wrote a transform to the DOM. */
export const recordLiveMarkerWrite = (): void => {
  if (!enabled) return;
  markerWrites += 1;
};

/** The follow camera re-rendered the map at a new centre. */
export const recordLiveViewCommit = (): void => {
  if (!enabled) return;
  viewCommits += 1;
};
