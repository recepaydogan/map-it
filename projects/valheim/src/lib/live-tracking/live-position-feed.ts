import type { PlayerPosition } from './tracking-installer'

type Listener = (sample: PlayerPosition | null) => void

/**
 * The raw 20 Hz position stream, kept outside React on purpose: only the map
 * marker (and camera follow) need every sample, and pushing each one through
 * component state re-rendered the whole window twenty times a second. Hot
 * consumers subscribe here; everything else reads the throttled hook state.
 */
class LivePositionFeed {
  latest: PlayerPosition | null = null
  /** `performance.now()` when `latest` arrived. */
  receivedAt = 0
  private listeners = new Set<Listener>()
  // Rolling diagnostics: how old a sample is when it reaches us (writer →
  // disk → Overwolf IO → here) and how many arrive per second.
  private ageSum = 0
  private ageMax = 0
  private samples = 0
  private windowStart = 0
  private reads = 0
  private readMsSum = 0
  private readMsMax = 0
  private readFailures: Record<string, number> = {}

  // Render-side health: are animation frames running, and is the main
  // thread free? Timers keep firing where frames stall, so both are watched.
  private frames = 0
  private frameGapMax = 0
  private loopLagMax = 0
  private markerWrites = 0
  private probesStarted = false
  /** Current map zoom and rendered map size (px), reported by the marker. */
  zoom = 0
  mapSize = 0
  // Do the values themselves move? Samples whose position differs from the
  // previous one, and the largest step between consecutive samples (metres).
  private moves = 0
  private stepMax = 0
  private stillRunMax = 0
  private stillRun = 0

  private startProbes(): void {
    if (this.probesStarted || typeof window === 'undefined') return
    this.probesStarted = true
    let lastFrame = performance.now()
    const onFrame = (now: number) => {
      this.frames += 1
      this.frameGapMax = Math.max(this.frameGapMax, now - lastFrame)
      lastFrame = now
      window.requestAnimationFrame(onFrame)
    }
    window.requestAnimationFrame(onFrame)
    let lastTick = performance.now()
    window.setInterval(() => {
      const now = performance.now()
      this.loopLagMax = Math.max(this.loopLagMax, now - lastTick - 50)
      lastTick = now
    }, 50)
  }

  /** The marker reports each time it wrote a sample to the DOM. */
  recordMarkerWrite(): void { this.markerWrites += 1 }

  // Where the marker actually is on screen, sampled by a timer: proves whether
  // the DOM writes reach the pixels (layout/paint/compositor) or not.
  private screenTicks = 0
  private screenMoved = 0
  private screenJumpMax = 0
  private screenPxPerSecMax = 0
  private lastScreen: { x: number; y: number; at: number } | null = null
  recordScreenPosition(x: number, y: number, at: number): void {
    const last = this.lastScreen
    this.lastScreen = { x, y, at }
    if (!last) return
    const jump = Math.hypot(x - last.x, y - last.y)
    this.screenTicks += 1
    if (jump > 0.5) this.screenMoved += 1
    this.screenJumpMax = Math.max(this.screenJumpMax, jump)
    const seconds = (at - last.at) / 1_000
    if (seconds > 0) this.screenPxPerSecMax = Math.max(this.screenPxPerSecMax, jump / seconds)
  }

  /** Called for every poll, successful or not, to profile the IO path. */
  recordRead(outcome: string, durationMs: number): void {
    this.reads += 1
    this.readMsSum += durationMs
    this.readMsMax = Math.max(this.readMsMax, durationMs)
    if (outcome !== 'ok') this.readFailures[outcome] = (this.readFailures[outcome] ?? 0) + 1
  }

  publish(sample: PlayerPosition | null): void {
    const now = performance.now()
    const previous = this.latest
    this.latest = sample
    this.receivedAt = now
    if (sample) {
      if (previous) {
        const step = Math.hypot(sample.x - previous.x, sample.z - previous.z)
        if (step > 0.01) { this.moves += 1; this.stillRun = 0 } else { this.stillRun += 1; this.stillRunMax = Math.max(this.stillRunMax, this.stillRun) }
        this.stepMax = Math.max(this.stepMax, step)
      }
      const age = Math.max(0, Date.now() - sample.updatedAt)
      this.ageSum += age
      this.ageMax = Math.max(this.ageMax, age)
      this.samples += 1
      if (this.windowStart === 0) { this.windowStart = now; this.startProbes() }
      else if (now - this.windowStart >= 15_000) {
        const seconds = (now - this.windowStart) / 1_000
        const failures = Object.entries(this.readFailures).map(([kind, count]) => `${kind}=${count}`).join(' ') || 'none'
        console.info(
          `[Position tracking] ${(this.samples / seconds).toFixed(1)} samples/s · latency avg ${Math.round(this.ageSum / this.samples)} ms · max ${Math.round(this.ageMax)} ms · reads ${(this.reads / seconds).toFixed(1)}/s avg ${this.reads ? Math.round(this.readMsSum / this.reads) : 0} ms max ${Math.round(this.readMsMax)} ms · failed ${failures} · frames ${(this.frames / seconds).toFixed(1)}/s gap max ${Math.round(this.frameGapMax)} ms · loop lag max ${Math.round(this.loopLagMax)} ms · marker writes ${(this.markerWrites / seconds).toFixed(1)}/s · moved ${this.moves}/${this.samples} step max ${this.stepMax.toFixed(1)} m · longest still run ${this.stillRunMax} · screen moved ${this.screenMoved}/${this.screenTicks} ticks jump max ${this.screenJumpMax.toFixed(1)} px (${this.screenPxPerSecMax.toFixed(1)} px/s) · zoom ${this.zoom.toFixed(2)} mapSize ${this.mapSize} visible ${document.visibilityState} reduced-motion ${matchMedia('(prefers-reduced-motion: reduce)').matches}`,
        )
        this.frames = 0
        this.frameGapMax = 0
        this.loopLagMax = 0
        this.markerWrites = 0
        this.moves = 0
        this.stepMax = 0
        this.stillRunMax = 0
        this.screenTicks = 0
        this.screenMoved = 0
        this.screenJumpMax = 0
        this.screenPxPerSecMax = 0
        this.ageSum = 0
        this.ageMax = 0
        this.samples = 0
        this.reads = 0
        this.readMsSum = 0
        this.readMsMax = 0
        this.readFailures = {}
        this.windowStart = now
      }
    }
    for (const listener of this.listeners) listener(sample)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

export const livePositionFeed = new LivePositionFeed()
