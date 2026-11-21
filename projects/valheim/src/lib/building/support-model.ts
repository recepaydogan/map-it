/**
 * Valheim's structural-integrity constants and colour rules, mirrored from
 * `WearNTear` (assembly_valheim.dll):
 *
 * - `GetMaterialProperties` — per-material max/min support and the loss per
 *   metre in the vertical/horizontal direction.
 * - `GetSupportColorValue` / `Highlight` — how the hammer colours a piece.
 *
 * Every number here is a game constant, not asset data.
 */

export type MaterialClass =
  | 'Wood'
  | 'HardWood'
  | 'Stone'
  | 'Iron'
  | 'Marble'
  | 'Ashstone'
  | 'Ancient'

export interface MaterialProperties {
  maxSupport: number
  minSupport: number
  verticalLoss: number
  horizontalLoss: number
}

/** `WearNTear.MaterialType` enum order — asset files store the index. */
export const MATERIAL_BY_INDEX: readonly MaterialClass[] = [
  'Wood',
  'Stone',
  'Iron',
  'HardWood',
  'Marble',
  'Ashstone',
  'Ancient',
]

export const MATERIAL_PROPERTIES: Record<MaterialClass, MaterialProperties> = {
  Wood: { maxSupport: 100, minSupport: 10, verticalLoss: 0.125, horizontalLoss: 0.2 },
  HardWood: { maxSupport: 140, minSupport: 10, verticalLoss: 0.1, horizontalLoss: 1 / 6 },
  Stone: { maxSupport: 1000, minSupport: 100, verticalLoss: 0.125, horizontalLoss: 1 },
  Iron: { maxSupport: 1500, minSupport: 20, verticalLoss: 1 / 13, horizontalLoss: 1 / 13 },
  Marble: { maxSupport: 1500, minSupport: 100, verticalLoss: 0.125, horizontalLoss: 0.5 },
  Ashstone: { maxSupport: 2000, minSupport: 100, verticalLoss: 0.1, horizontalLoss: 1 / 3 },
  Ancient: { maxSupport: 5000, minSupport: 100, verticalLoss: 1 / 15, horizontalLoss: 0.25 },
}

/** Materials the player can actually place with the hammer. */
export const PLAYER_MATERIALS: readonly MaterialClass[] = [
  'Wood',
  'HardWood',
  'Stone',
  'Iron',
  'Marble',
  'Ashstone',
]

/**
 * `WearNTear.SetupColliders` grows every collider by 0.3 (0.15 per side) before
 * the overlap test, so pieces up to 15 cm apart still count as touching.
 */
export const SUPPORT_CONTACT_MARGIN = 0.15

/** Distance padding added to every centre-of-mass distance (`+ 0.1f`). */
export const SUPPORT_DISTANCE_PADDING = 0.1

/** A support point counts only when it is below the centre of mass (+5 cm). */
export const SUPPORT_POINT_HEIGHT_SLACK = 0.05

/** Two support points at least this far apart (horizontally) share the load. */
export const SUPPORT_BRIDGE_MIN_ANGLE = 100

export const materialProperties = (material: MaterialClass): MaterialProperties =>
  MATERIAL_PROPERTIES[material]

/**
 * `WearNTear.GetSupportColorValue`: -1 when the piece sits at full support
 * (drawn blue), otherwise 0..1 from red (about to break) to green (≥ 50 % of
 * the material maximum).
 */
export const supportColorValue = (support: number, material: MaterialClass): number => {
  const { maxSupport, minSupport } = MATERIAL_PROPERTIES[material]
  if (support >= maxSupport) return -1
  const value = (support - minSupport) / (maxSupport * 0.5 - minSupport)
  return clamp01(value)
}

export type SupportBand = 'grounded' | 'strong' | 'fair' | 'weak' | 'critical' | 'collapsing'

/** Human-readable band matching the colour ramp; thresholds are presentational. */
export const supportBand = (support: number, material: MaterialClass): SupportBand => {
  const { minSupport } = MATERIAL_PROPERTIES[material]
  if (support < minSupport) return 'collapsing'
  const value = supportColorValue(support, material)
  if (value < 0) return 'grounded'
  if (value >= 1) return 'strong'
  if (value >= 0.5) return 'fair'
  if (value >= 0.2) return 'weak'
  return 'critical'
}

export interface Rgb {
  r: number
  g: number
  b: number
}

/** The blue tint the hammer uses for a piece at full support. */
export const GROUNDED_COLOR: Rgb = { r: 0.6, g: 0.8, b: 1 }

/**
 * `WearNTear.Highlight`: lerp red→green by the colour value, then push
 * saturation from 1→0.5 and value from 1.2→0.9 so weak pieces glow hot and
 * strong ones fade to a soft green.
 */
export const supportColor = (support: number, material: MaterialClass): Rgb => {
  const value = supportColorValue(support, material)
  if (value < 0) return GROUNDED_COLOR
  const lerped: Rgb = { r: 1 - value, g: value, b: 0 }
  const { h } = rgbToHsv(lerped)
  const s = lerp(1, 0.5, value)
  const v = lerp(1.2, 0.9, value)
  return hsvToRgb(h, s, v)
}

export const rgbToCss = ({ r, g, b }: Rgb): string =>
  `rgb(${Math.round(clamp01(r) * 255)}, ${Math.round(clamp01(g) * 255)}, ${Math.round(clamp01(b) * 255)})`

/**
 * How many more identical pieces can be chained from a piece at `support`
 * before the next one drops under the material minimum. `distance` is the
 * centre-to-centre spacing (piece length) and `direction` picks the loss rate.
 * Vertical loss also applies to a piece held from both ends (the "bridge" rule).
 */
export const remainingHops = (
  support: number,
  material: MaterialClass,
  distance: number,
  direction: 'vertical' | 'horizontal',
): number => {
  const properties = MATERIAL_PROPERTIES[material]
  const loss = direction === 'vertical' ? properties.verticalLoss : properties.horizontalLoss
  const factor = 1 - loss * (distance + SUPPORT_DISTANCE_PADDING)
  if (factor <= 0) return 0
  let value = support
  let hops = 0
  while (hops < 999) {
    value *= factor
    if (value < properties.minSupport) break
    hops += 1
  }
  return hops
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t)

const rgbToHsv = ({ r, g, b }: Rgb): { h: number; s: number; v: number } => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
    h /= 6
    if (h < 0) h += 1
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max }
}

/** Unity `Color.HSVToRGB` (hdr = false clamps every channel to 0..1). */
const hsvToRgb = (h: number, s: number, v: number): Rgb => {
  if (s <= 0) return { r: clamp01(v), g: clamp01(v), b: clamp01(v) }
  const sector = h * 6
  const index = Math.floor(sector)
  const fraction = sector - index
  const p = v * (1 - s)
  const q = v * (1 - s * fraction)
  const t = v * (1 - s * (1 - fraction))
  let rgb: Rgb
  switch (index % 6) {
    case 0: rgb = { r: v, g: t, b: p }; break
    case 1: rgb = { r: q, g: v, b: p }; break
    case 2: rgb = { r: p, g: v, b: t }; break
    case 3: rgb = { r: p, g: q, b: v }; break
    case 4: rgb = { r: t, g: p, b: v }; break
    default: rgb = { r: v, g: p, b: q }
  }
  return { r: clamp01(rgb.r), g: clamp01(rgb.g), b: clamp01(rgb.b) }
}
