const MT19937 = 1_812_433_253
const FLOAT_RANDOM_SCALE = Math.fround(1.1920930376163597e-7)

export interface UnityRandomState {
  x: number
  y: number
  z: number
  w: number
}

export class UnityRandom {
  private state: UnityRandomState

  constructor(seed: number) {
    const x = seed >>> 0
    const y = (Math.imul(MT19937, x) + 1) >>> 0
    const z = (Math.imul(MT19937, y) + 1) >>> 0
    const w = (Math.imul(MT19937, z) + 1) >>> 0
    this.state = { x, y, z, w }
  }

  getState(): UnityRandomState {
    return { ...this.state }
  }

  nextUint(): number {
    const temporary = (this.state.x ^ (this.state.x << 11)) >>> 0
    this.state.x = this.state.y
    this.state.y = this.state.z
    this.state.z = this.state.w
    this.state.w = (
      this.state.w ^
      (this.state.w >>> 19) ^
      temporary ^
      (temporary >>> 8)
    ) >>> 0
    return this.state.w
  }

  intRange(min: number, max: number): number {
    if (max === min) return min | 0
    const random = this.nextUint()
    const distance = max - min
    const value = max < min
      ? min - (random % distance)
      : min + (random % distance)
    return value | 0
  }

  floatRange(min: number, max: number): number {
    const randomFraction = Math.fround(
      (this.nextUint() & 0x7f_ffff) * FLOAT_RANDOM_SCALE,
    )
    const inverseFraction = Math.fround(1 - randomFraction)
    return Math.fround(
      Math.fround(randomFraction * Math.fround(min)) +
        Math.fround(inverseFraction * Math.fround(max)),
    )
  }

  value(): number {
    return Math.fround((this.nextUint() & 0x7f_ffff) * FLOAT_RANDOM_SCALE)
  }

  insideUnitCircle(): { x: number; y: number } {
    const angle = this.floatRange(0, Math.fround(Math.PI * 2))
    const radius = Math.fround(Math.sqrt(this.floatRange(0, 1)))
    return {
      x: Math.fround(Math.fround(Math.cos(angle)) * radius),
      y: Math.fround(Math.fround(Math.sin(angle)) * radius),
    }
  }
}
