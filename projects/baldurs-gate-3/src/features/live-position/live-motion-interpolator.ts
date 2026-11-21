export interface LiveMotionPoint {
  x: number;
  y: number;
}

const POSITION_EPSILON = 0.000_001;
const DEFAULT_SAMPLE_INTERVAL_MS = 1_000;
const MIN_SAMPLE_INTERVAL_MS = 250;
const MAX_SAMPLE_INTERVAL_MS = 2_000;
const PREDICTION_HORIZON_MULTIPLIER = 1.15;
const VELOCITY_BLEND = 0.72;

export const sameLiveMotionPoint = (left: LiveMotionPoint, right: LiveMotionPoint) =>
  Math.abs(left.x - right.x) <= POSITION_EPSILON
  && Math.abs(left.y - right.y) <= POSITION_EPSILON;

/**
 * Cadence-aware dead reckoning shared by the primary player and party markers.
 * Sparse location feeds still produce a continuous target; every real sample
 * gently corrects prediction error instead of restarting a short stop/go tween.
 */
export class LiveMotionInterpolator {
  private current: LiveMotionPoint | null = null;
  private sample: LiveMotionPoint | null = null;
  private velocity: LiveMotionPoint = { x: 0, y: 0 };
  private sampleAt = 0;
  private frameAt = 0;
  private sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS;
  private hasMeasuredVelocity = false;
  private readonly correctionMs: number;
  private readonly snapWorldDistance: number;

  constructor(correctionMs: number, snapWorldDistance: number) {
    this.correctionMs = correctionMs;
    this.snapWorldDistance = snapWorldDistance;
  }

  clear() {
    this.current = null;
    this.sample = null;
    this.velocity = { x: 0, y: 0 };
    this.sampleAt = 0;
    this.frameAt = 0;
    this.sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS;
    this.hasMeasuredVelocity = false;
  }

  accept(next: LiveMotionPoint, now: number): LiveMotionPoint {
    const previousSample = this.sample;
    if (!this.current || !previousSample) {
      this.current = next;
      this.sample = next;
      this.sampleAt = now;
      this.frameAt = now;
      return next;
    }

    const visualNow = this.positionAt(now) ?? this.current;
    const sampleDistance = Math.hypot(next.x - previousSample.x, next.y - previousSample.y);
    if (sampleDistance > this.snapWorldDistance) {
      this.current = next;
      this.sample = next;
      this.velocity = { x: 0, y: 0 };
      this.sampleAt = now;
      this.frameAt = now;
      this.hasMeasuredVelocity = false;
      return next;
    }

    const elapsed = Math.max(1, now - this.sampleAt);
    const measuredInterval = Math.min(
      MAX_SAMPLE_INTERVAL_MS,
      Math.max(MIN_SAMPLE_INTERVAL_MS, elapsed),
    );
    this.sampleIntervalMs = this.hasMeasuredVelocity
      ? this.sampleIntervalMs * 0.75 + measuredInterval * 0.25
      : measuredInterval;

    const measuredVelocity = sameLiveMotionPoint(previousSample, next)
      ? { x: 0, y: 0 }
      : {
          x: (next.x - previousSample.x) / elapsed,
          y: (next.y - previousSample.y) / elapsed,
        };
    if (sameLiveMotionPoint(measuredVelocity, { x: 0, y: 0 })) {
      this.velocity = measuredVelocity;
    } else if (this.hasMeasuredVelocity) {
      this.velocity = {
        x: this.velocity.x * (1 - VELOCITY_BLEND) + measuredVelocity.x * VELOCITY_BLEND,
        y: this.velocity.y * (1 - VELOCITY_BLEND) + measuredVelocity.y * VELOCITY_BLEND,
      };
    } else {
      this.velocity = measuredVelocity;
    }
    this.hasMeasuredVelocity = true;
    this.current = visualNow;
    this.sample = next;
    this.sampleAt = now;
    this.frameAt = now;
    return visualNow;
  }

  positionAt(now: number): LiveMotionPoint | null {
    if (!this.current || !this.sample) return this.current;
    const frameElapsed = Math.max(0, now - this.frameAt);
    if (frameElapsed === 0) return this.current;
    const predictionHorizon = Math.min(
      MAX_SAMPLE_INTERVAL_MS,
      this.sampleIntervalMs * PREDICTION_HORIZON_MULTIPLIER,
    );
    const predictionAge = Math.min(Math.max(0, now - this.sampleAt), predictionHorizon);
    const target = {
      x: this.sample.x + this.velocity.x * predictionAge,
      y: this.sample.y + this.velocity.y * predictionAge,
    };
    const blend = this.correctionMs <= 0
      ? 1
      : 1 - Math.exp(-frameElapsed / this.correctionMs);
    this.current = {
      x: this.current.x + (target.x - this.current.x) * blend,
      y: this.current.y + (target.y - this.current.y) * blend,
    };
    this.frameAt = now;
    return this.current;
  }

  isMoving(now: number) {
    if (!this.current || !this.sample) return false;
    const predictionHorizon = Math.min(
      MAX_SAMPLE_INTERVAL_MS,
      this.sampleIntervalMs * PREDICTION_HORIZON_MULTIPLIER,
    );
    const predictionAge = Math.min(Math.max(0, now - this.sampleAt), predictionHorizon);
    const target = {
      x: this.sample.x + this.velocity.x * predictionAge,
      y: this.sample.y + this.velocity.y * predictionAge,
    };
    const stillPredicting = now - this.sampleAt < predictionHorizon
      && !sameLiveMotionPoint(this.velocity, { x: 0, y: 0 });
    return stillPredicting || !sameLiveMotionPoint(this.current, target);
  }
}
