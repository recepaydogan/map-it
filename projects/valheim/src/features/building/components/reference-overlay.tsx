import { X } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { MATERIAL_PROPERTIES, PLAYER_MATERIALS, remainingHops } from '../../../lib/building/support-model.ts'
import { BAND_SWATCH, BANDS, bandLabel, bandShort, materialDescription, materialLabel } from '../presentation.ts'

interface ReferenceOverlayProps {
  onClose: () => void
}

const RULE_KEYS = ['ground', 'bridge', 'stronger', 'noSupport', 'rain', 'shelter'] as const
const percent = (value: number) => `${Math.round(value * 1000) / 10} %`

/** The numbers behind the colours, on one calm sheet. */
export function ReferenceOverlay({ onClose }: ReferenceOverlayProps) {
  const { t } = useTranslation()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 grid place-items-center bg-black/55 p-6 backdrop-blur-sm" onMouseDown={onClose}>
      <section
        className="max-h-full w-full max-w-[720px] overflow-y-auto rounded-[var(--radius-lg)] border border-white/10 bg-[var(--surface)] shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="building-reference-title"
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 id="building-reference-title" className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-[var(--text)]">{t('building.reference.title')}</h2>
          <button type="button" onClick={onClose} className="grid size-8 cursor-pointer place-items-center rounded-full text-[var(--muted)] hover:bg-white/10 hover:text-[var(--text)]" aria-label={t('common.close')}>
            <X size={15} aria-hidden="true" />
          </button>
        </header>

        <div className="flex flex-col gap-5 px-5 py-4">
          <ul className="grid grid-cols-3 gap-x-4 gap-y-1.5">
            {BANDS.map((band) => (
              <li key={band} className="flex items-center gap-2 text-[11.5px]">
                <span
                  className={cn('inline-block h-3 w-5 shrink-0 rounded-sm', band === 'collapsing' && 'bg-[repeating-linear-gradient(45deg,#ff0000_0_3px,#5a0000_3px_6px)]')}
                  style={band === 'collapsing' ? undefined : { background: BAND_SWATCH[band] }}
                />
                <span className="font-semibold text-[var(--text)]">{bandLabel(t, band)}</span>
                <span className="text-[var(--muted)]">{bandShort(t, band)}</span>
              </li>
            ))}
          </ul>

          <table className="w-full border-collapse text-[11.5px]">
            <thead className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
              <tr className="border-b border-[var(--border)]">
                <th className="py-1.5 text-left font-semibold">{t('building.reference.columns.material')}</th>
                <th className="py-1.5 text-right font-semibold">{t('building.reference.columns.max')}</th>
                <th className="py-1.5 text-right font-semibold">{t('building.reference.columns.min')}</th>
                <th className="py-1.5 text-right font-semibold">{t('building.reference.columns.lossUp')}</th>
                <th className="py-1.5 text-right font-semibold">{t('building.reference.columns.lossOut')}</th>
                <th className="py-1.5 text-right font-semibold">{t('building.reference.columns.reachUp')}</th>
                <th className="py-1.5 text-right font-semibold">{t('building.reference.columns.reachOut')}</th>
              </tr>
            </thead>
            <tbody>
              {PLAYER_MATERIALS.map((material) => {
                const properties = MATERIAL_PROPERTIES[material]
                const up = (remainingHops(properties.maxSupport, material, 2, 'vertical') + 1) * 2
                const out = remainingHops(properties.maxSupport, material, 2, 'horizontal') * 2
                const out1 = remainingHops(properties.maxSupport, material, 1, 'horizontal')
                return (
                  <tr key={material} className="border-b border-[var(--border)]/60 align-top">
                    <td className="py-2 pr-3">
                      <p className="font-semibold text-[var(--text)]">{materialLabel(t, material)}</p>
                      <p className="text-[10px] leading-snug text-[var(--muted)]">{materialDescription(t, material)}</p>
                    </td>
                    <td className="py-2 text-right tabular-nums text-[var(--text)]">{properties.maxSupport}</td>
                    <td className="py-2 text-right tabular-nums text-[var(--text)]">{properties.minSupport}</td>
                    <td className="py-2 text-right tabular-nums text-[var(--text)]">{percent(properties.verticalLoss)}</td>
                    <td className="py-2 text-right tabular-nums text-[var(--text)]">{percent(properties.horizontalLoss)}</td>
                    <td className="py-2 text-right tabular-nums text-[var(--text)]">≈ {up} m</td>
                    <td className="py-2 text-right tabular-nums text-[var(--text)]">
                      {out > 0 ? `≈ ${out} m` : out1 > 0 ? t('building.reference.onlyOneMetre', { count: out1 }) : t('building.reference.none')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <ul className="grid grid-cols-2 gap-x-5 gap-y-2">
            {RULE_KEYS.map((key) => (
              <li key={key} className="text-[11px] leading-snug">
                <span className="font-semibold text-[var(--text)]">{t(`building.reference.rules.${key}.title`)} — </span>
                <span className="text-[var(--muted)]">{t(`building.reference.rules.${key}.body`)}</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-[var(--muted)]/70">{t('building.reference.source')}</p>
        </div>
      </section>
    </div>
  )
}
