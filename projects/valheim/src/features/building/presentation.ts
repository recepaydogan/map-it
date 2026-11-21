import type { TFunction } from 'i18next'
import { rgbToCss, supportColor, type MaterialClass, type SupportBand } from '../../lib/building/support-model.ts'

export const materialLabel = (t: TFunction, material: MaterialClass): string =>
  t(`building.materials.${material}.label`)

export const materialDescription = (t: TFunction, material: MaterialClass): string =>
  t(`building.materials.${material}.description`)

export const bandLabel = (t: TFunction, band: SupportBand): string =>
  t(`building.bands.${band}.label`)

export const bandShort = (t: TFunction, band: SupportBand): string =>
  t(`building.bands.${band}.short`)

/** Representative swatch per band for legends (the live ramp is continuous). */
export const BAND_SWATCH: Record<SupportBand, string> = {
  grounded: rgbToCss(supportColor(100, 'Wood')),
  strong: rgbToCss(supportColor(60, 'Wood')),
  fair: rgbToCss(supportColor(36, 'Wood')),
  weak: rgbToCss(supportColor(23, 'Wood')),
  critical: rgbToCss(supportColor(13, 'Wood')),
  collapsing: rgbToCss(supportColor(5, 'Wood')),
}

export const BANDS: readonly SupportBand[] = ['grounded', 'strong', 'fair', 'weak', 'critical', 'collapsing']
