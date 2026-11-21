/** Preserve the original four colors, then spread additional selections around the hue wheel. */
const RESOURCE_AREA_COLORS = ['#43E6D0', '#FF8A72', '#C29BFF', '#FFE17A'] as const

export function resourceAreaColor(index: number): string {
  if (index < RESOURCE_AREA_COLORS.length) return RESOURCE_AREA_COLORS[index]
  return `hsl(${Math.round(215 + (index - RESOURCE_AREA_COLORS.length) * 137.508) % 360} 90% 70%)`
}
