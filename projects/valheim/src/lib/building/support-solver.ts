import {
  MATERIAL_PROPERTIES,
  SUPPORT_BRIDGE_MIN_ANGLE,
  SUPPORT_CONTACT_MARGIN,
  SUPPORT_DISTANCE_PADDING,
  SUPPORT_POINT_HEIGHT_SLACK,
  type MaterialClass,
} from './support-model.ts'

/**
 * A port of `WearNTear.UpdateSupport` for axis-aligned boxes (X/Z along the
 * ground, Y up). Pieces rotated in 90° steps stay axis-aligned, so poles,
 * beams, walls, floors and blocks are represented exactly; the game runs the
 * same rules through physics overlap queries. What is kept faithful:
 *
 * - touching (within the 0.15 m collider margin) terrain or any non-piece
 *   object grants full support;
 * - support flows only from pieces flagged `m_supports`;
 * - the distance is centre-of-mass to centre-of-mass (or to the neighbour's
 *   transform origin when that is closer), padded by 0.1 m;
 * - the loss rate is lerped between horizontal and vertical by how steeply
 *   the support point sits below the centre of mass;
 * - two support points at least 100° apart around the vertical axis share
 *   the load (their vertical-loss values are averaged) — why a floor held
 *   from opposite sides survives.
 */
export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface SimBody {
  id: string
  /** Minimum corner (metres). */
  min: Vec3
  /** Maximum corner (metres). */
  max: Vec3
  kind: 'piece' | 'static'
  material: MaterialClass
  /** `WearNTear.m_supports` — false for furniture-like pieces. */
  supports: boolean
  /** Centre of mass relative to the box centre (`m_comOffset`, rotated). */
  comOffset?: Vec3
  /** Transform origin relative to the box centre. */
  originOffset?: Vec3
  /** `m_forceCorrectCOMCalculation` — ignore the origin shortcut. */
  forceCorrectCom?: boolean
}

export interface BodySupport {
  id: string
  support: number
  /** Touching terrain or a non-piece object. */
  grounded: boolean
  /** Falls under the material minimum, so the game would destroy it. */
  collapses: boolean
  /** Ids the support was read from (excluding ground). */
  supportedBy: string[]
}

export interface SupportSolution {
  bodies: Map<string, BodySupport>
  /** Every piece removed by the collapse cascade, in removal order. */
  collapsed: string[]
  iterations: number
}

export interface SolveOptions {
  /** Terrain height; flat ground. */
  groundY?: number
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 }

export const boxCentre = (body: SimBody): Vec3 => ({
  x: (body.min.x + body.max.x) / 2,
  y: (body.min.y + body.max.y) / 2,
  z: (body.min.z + body.max.z) / 2,
})

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const centreOfMass = (body: SimBody): Vec3 => add(boxCentre(body), body.comOffset ?? ZERO)
const origin = (body: SimBody): Vec3 => add(boxCentre(body), body.originOffset ?? ZERO)
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

const closestPointOnBox = (body: SimBody, point: Vec3): Vec3 => ({
  x: Math.min(Math.max(point.x, body.min.x), body.max.x),
  y: Math.min(Math.max(point.y, body.min.y), body.max.y),
  z: Math.min(Math.max(point.z, body.min.z), body.max.z),
})

/** Overlap test with the 0.15 m collider growth applied to `a` (closed intervals). */
export const bodiesTouch = (a: SimBody, b: SimBody): boolean =>
  a.min.x - SUPPORT_CONTACT_MARGIN <= b.max.x && a.max.x + SUPPORT_CONTACT_MARGIN >= b.min.x
  && a.min.y - SUPPORT_CONTACT_MARGIN <= b.max.y && a.max.y + SUPPORT_CONTACT_MARGIN >= b.min.y
  && a.min.z - SUPPORT_CONTACT_MARGIN <= b.max.z && a.max.z + SUPPORT_CONTACT_MARGIN >= b.min.z

const touchesGround = (body: SimBody, groundY: number) => body.min.y - SUPPORT_CONTACT_MARGIN <= groundY

/** Unity `Vector3.Angle` on the horizontal (XZ) projections, in degrees. */
const horizontalAngle = (a: Vec3, b: Vec3): number => {
  const la = Math.hypot(a.x, a.z)
  const lb = Math.hypot(b.x, b.z)
  if (la < 1e-9 || lb < 1e-9) return 0
  const cos = Math.min(1, Math.max(-1, (a.x * b.x + a.z * b.z) / (la * lb)))
  return Math.acos(cos) * (180 / Math.PI)
}

interface Neighbourhood {
  grounded: boolean
  neighbours: SimBody[]
}

const evaluate = (
  body: SimBody,
  neighbourhood: Neighbourhood,
  supportOf: (id: string) => number,
): { support: number; supportedBy: string[] } => {
  const { maxSupport, verticalLoss, horizontalLoss } = MATERIAL_PROPERTIES[body.material]
  if (neighbourhood.grounded) return { support: maxSupport, supportedBy: [] }
  const com = centreOfMass(body)
  let best = 0
  const points: Vec3[] = []
  const pointValues: number[] = []
  const supportedBy: string[] = []
  for (const other of neighbourhood.neighbours) {
    if (other.kind === 'static') return { support: maxSupport, supportedBy: [other.id] }
    if (!other.supports) continue
    const otherSupport = supportOf(other.id)
    let span = distance(com, centreOfMass(other)) + SUPPORT_DISTANCE_PADDING
    const originSpan = distance(com, origin(other)) + SUPPORT_DISTANCE_PADDING
    if (originSpan < span && !body.forceCorrectCom) span = originSpan
    best = Math.max(best, otherSupport - horizontalLoss * span * otherSupport)
    supportedBy.push(other.id)
    const point = closestPointOnBox(other, com)
    if (point.y < com.y + SUPPORT_POINT_HEIGHT_SLACK) {
      const length = distance(point, com)
      const directionY = length > 0 ? (point.y - com.y) / length : 0
      if (directionY < 0) {
        const t = Math.acos(1 - Math.abs(directionY)) / (Math.PI / 2)
        const loss = horizontalLoss + (verticalLoss - horizontalLoss) * Math.min(1, Math.max(0, t))
        best = Math.max(best, otherSupport - loss * span * otherSupport)
      }
      points.push(point)
      pointValues.push(otherSupport - verticalLoss * span * otherSupport)
    }
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = { x: points[i].x - com.x, y: 0, z: points[i].z - com.z }
    for (let j = i + 1; j < points.length; j += 1) {
      const shared = (pointValues[i] + pointValues[j]) * 0.5
      if (shared <= best) continue
      const b = { x: points[j].x - com.x, y: 0, z: points[j].z - com.z }
      if (horizontalAngle(a, b) >= SUPPORT_BRIDGE_MIN_ANGLE) best = shared
    }
  }
  return { support: Math.min(best, maxSupport), supportedBy }
}

const relax = (
  pieces: SimBody[],
  neighbourhoods: Map<string, Neighbourhood>,
): { values: Map<string, number>; supportedBy: Map<string, string[]>; iterations: number } => {
  const values = new Map<string, number>()
  const supportedBy = new Map<string, string[]>()
  for (const piece of pieces) values.set(piece.id, 0)
  const supportOf = (id: string) => values.get(id) ?? 0
  let iterations = 0
  // Support only ever flows downhill from grounded pieces, so starting at zero
  // and taking the max each sweep converges to the game's steady state.
  for (; iterations < 1000; iterations += 1) {
    let delta = 0
    for (const piece of pieces) {
      const neighbourhood = neighbourhoods.get(piece.id)
      if (!neighbourhood) continue
      const result = evaluate(piece, neighbourhood, supportOf)
      const previous = values.get(piece.id) ?? 0
      if (result.support > previous) {
        delta = Math.max(delta, result.support - previous)
        values.set(piece.id, result.support)
      }
      supportedBy.set(piece.id, result.supportedBy)
    }
    if (delta < 1e-6) break
  }
  return { values, supportedBy, iterations }
}

/**
 * Solve the steady-state support of every piece, then cascade collapses:
 * pieces under their material minimum are removed and the rest re-solved
 * until nothing else falls — the same end state the game reaches once
 * `WearNTear.UpdateWear` has destroyed the unsupported pieces.
 */
export const solveSupport = (input: readonly SimBody[], options: SolveOptions = {}): SupportSolution => {
  const groundY = options.groundY ?? 0
  const statics = input.filter((body) => body.kind === 'static')
  let alive = input.filter((body) => body.kind === 'piece')
  const collapsed: string[] = []
  const bodies = new Map<string, BodySupport>()
  let iterations = 0

  for (let round = 0; round < input.length + 1; round += 1) {
    const neighbourhoods = new Map<string, Neighbourhood>()
    for (const piece of alive) {
      const neighbours: SimBody[] = []
      for (const other of statics) if (bodiesTouch(piece, other)) neighbours.push(other)
      for (const other of alive) if (other.id !== piece.id && bodiesTouch(piece, other)) neighbours.push(other)
      neighbourhoods.set(piece.id, { grounded: touchesGround(piece, groundY), neighbours })
    }
    const { values, supportedBy, iterations: sweeps } = relax(alive, neighbourhoods)
    iterations += sweeps
    const falling: SimBody[] = []
    for (const piece of alive) {
      const support = values.get(piece.id) ?? 0
      const neighbourhood = neighbourhoods.get(piece.id)
      const grounded = Boolean(neighbourhood?.grounded) || Boolean(neighbourhood?.neighbours.some((other) => other.kind === 'static'))
      const collapses = support < MATERIAL_PROPERTIES[piece.material].minSupport
      bodies.set(piece.id, {
        id: piece.id,
        support,
        grounded,
        collapses,
        supportedBy: supportedBy.get(piece.id) ?? [],
      })
      if (collapses) falling.push(piece)
    }
    if (falling.length === 0) break
    for (const piece of falling) collapsed.push(piece.id)
    const fallingIds = new Set(falling.map((piece) => piece.id))
    alive = alive.filter((piece) => !fallingIds.has(piece.id))
  }

  for (const body of statics) {
    bodies.set(body.id, { id: body.id, support: Number.POSITIVE_INFINITY, grounded: true, collapses: false, supportedBy: [] })
  }
  return { bodies, collapsed, iterations }
}
