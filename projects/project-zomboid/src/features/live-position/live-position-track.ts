/**
 * A short history of where the player has been, played back on a delay.
 *
 * The Bridge writes a sample every 50 ms and the reader polls every 50 ms, so
 * the two cadences beat against each other: one poll sees nothing new, the next
 * sees a sample that is already 100 ms old, and because the file only ever
 * holds the newest sample the one in between is simply gone. Anything that
 * jumps straight to whatever just arrived therefore moves in uneven steps — the
 * shake — even though the game reported perfectly even motion.
 *
 * The cure is to stop rendering the newest sample and start rendering a fixed
 * moment in the past. Samples are stamped with the BRIDGE's own clock, so the
 * track is evenly spaced by construction; readers ask for a point in time and
 * get one interpolated between two coordinates the game really reported. The
 * delay is the slack that guarantees there is always a later sample to
 * interpolate towards.
 */

export interface LiveTrackPoint {
  x: number;
  y: number;
  /** Bridge clock, in ms — the sample's `updatedAt`, not its arrival. */
  at: number;
}

export interface LiveTrackSample extends LiveTrackPoint {
  /** No later sample to interpolate towards, so this is the newest (or
   *  oldest) coordinate held still. Playback that is CONSTANTLY clamped is
   *  not interpolating at all — it is stepping, one sample at a time. */
  clamped: boolean;
  /** How far the requested time is past the newest sample, in ms. Positive
   *  means playback has outrun the stream, which is what clamps it. */
  lead: number;
}

/** How often a consumer should read the track back. One Bridge sample. */
export const LIVE_TRACK_TICK_MS = 50;
/**
 * How far behind the Bridge clock everything renders — the whole buffer, in one
 * number.
 *
 * This has to be larger than the worst delivery latency, or playback runs past
 * the newest sample it holds, clamps there and freezes until the next one
 * arrives. Two samples of slack was the original guess and it was far too
 * little: Overwolf does not hand over lines one at a time but in batches of five
 * or six, a couple of hundred milliseconds apart, so a sample can be a fifth of
 * a second old before this window ever sees it. Measurement agreed — playback
 * sat eleven milliseconds behind the newest sample and spent a third of its
 * ticks clamped.
 *
 * A third of a second covers batching, a late timer and the gap a stream
 * restart leaves behind, and it buys something better than smoothness across
 * those gaps: a hole in the track is INTERPOLATED across rather than waited
 * out. The cost is that the marker shows where the player was a third of a
 * second ago, which on a map nobody can see.
 */
/*
 * Sizing: playback aims LIVE_TRACK_LOOKAHEAD_MS ahead of the delayed clock, so
 * the slack that actually protects against a delivery gap is DELAY minus
 * LOOKAHEAD. The measured stream shows delivery gaps spiking to 900 ms every
 * couple of seconds (batching plus a late listener), so that difference has to
 * clear 900 ms — 400 did not, and every spike parked playback at the end of the
 * data: the periodic freeze. Cost of the extra depth is marker latency on a
 * map, which nothing in the game reacts to.
 */
export const LIVE_TRACK_DELAY_MS = 1_200;

/**
 * How far into the track's future every playback step aims, and how long its
 * glide lasts.
 *
 * The playback timer cannot be trusted to fire on time — measured lag on this
 * window reached half a second — and a glide that only lasts one tick turns
 * every late tick into the signature stutter: move fifty milliseconds, freeze
 * for the delay, then lurch the accumulated distance in one hop. So each step
 * asks the track where the player will be THIS far from now and glides there
 * over exactly that long. A tick that arrives on time restarts the glide from
 * mid-flight along the same straight path, which changes nothing visibly; a
 * tick that arrives late lands mid-glide instead of after it, so the motion
 * never runs dry. The track can genuinely answer the question because playback
 * runs LIVE_TRACK_DELAY_MS in the past — the "future" is data already held.
 */
export const LIVE_TRACK_LOOKAHEAD_MS = 200;
/**
 * Enough history that playback cannot fall off the back of it.
 *
 * Eight samples was four hundred milliseconds, which was fine while samples
 * arrived one at a time. They do not: the file listener delivers five or six at
 * once, so a single burst can push the oldest sample forward by three hundred
 * milliseconds and leave the playback head — which renders deliberately in the
 * past — pointing at history that has already been dropped. The track then
 * clamps to its oldest point, which is a jump BACKWARDS. Two seconds of history
 * costs nothing and cannot be outrun.
 */
const SAMPLE_LIMIT = 40;

/**
 * Bridge clock minus this window's clock. Both read the same machine, so a
 * sample's apparent age on arrival is really the read latency; the smallest age
 * ever seen is the closest thing to a true offset, and one slow poll cannot
 * drag it. Shared by every consumer — it describes the stream, not the reader.
 */
let clockOffset: number | null = null;

export const noteBridgeClock = (updatedAt: number, arrivedAt = Date.now()): void => {
  const offset = arrivedAt - updatedAt;
  clockOffset = clockOffset === null ? offset : Math.min(clockOffset, offset);
};

/**
 * The moment on the Bridge clock that belongs on screen right now, or null
 * while no sample has calibrated the offset yet.
 */
export const liveTrackRenderTime = (): number | null =>
  clockOffset === null ? null : Date.now() - clockOffset - LIVE_TRACK_DELAY_MS;

/** The offset currently in use, for the diagnostics line. */
export const liveTrackClockOffset = (): number | null => clockOffset;

export const createLivePositionTrack = () => {
  const points: LiveTrackPoint[] = [];

  return {
    push(point: LiveTrackPoint) {
      // `at` reads back by walking these in order, so a sample that is not
      // newer than the last would corrupt every interpolation after it. The
      // feed already drops stragglers; this keeps the invariant local.
      const last = points.at(-1);
      if (last && point.at <= last.at) return;
      points.push(point);
      if (points.length > SAMPLE_LIMIT) points.shift();
    },
    reset() {
      points.length = 0;
    },
    get last(): LiveTrackPoint | null {
      return points.at(-1) ?? null;
    },
    /**
     * Where the player was at `time`. Clamped at both ends: before the first
     * sample there is nothing to interpolate from, and past the last one — a
     * paused game, a throttled timer — holding still is right, where guessing
     * ahead would overshoot and snap back.
     */
    at(time: number): LiveTrackSample | null {
      const first = points[0];
      const last = points.at(-1);
      if (!first || !last) return null;
      const lead = time - last.at;
      if (time <= first.at) return { ...first, clamped: true, lead };
      if (time >= last.at) return { ...last, clamped: true, lead };
      for (let index = 1; index < points.length; index += 1) {
        const to = points[index]!;
        if (to.at < time) continue;
        const from = points[index - 1]!;
        const span = to.at - from.at;
        const progress = span > 0 ? (time - from.at) / span : 1;
        return {
          x: from.x + (to.x - from.x) * progress,
          y: from.y + (to.y - from.y) * progress,
          at: time,
          clamped: false,
          lead,
        };
      }
      return { ...last, clamped: true, lead };
    },
  };
};

export type LivePositionTrack = ReturnType<typeof createLivePositionTrack>;
