import { Coins, LockKeyhole, Store } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import type { MarkerItemIntel, TraderIntel } from '../types/marker-intelligence'

interface TraderInventoryPanelProps {
  trader: TraderIntel
  selectedItem?: string | null
  onSelectItem: (item: MarkerItemIntel) => void
}

const progressionBossByKey: Record<string, string> = {
  defeated_eikthyr: 'eikthyr',
  defeated_gdking: 'theElder',
  defeated_bonemass: 'bonemass',
  defeated_dragon: 'moder',
  defeated_goblinking: 'yagluth',
  defeated_queen: 'theQueen',
  defeated_fader: 'fader',
  defeated_frozenking_p3: 'frozenKing',
  defeated_writhan: 'writhan',
  defeated_serpent: 'serpent',
}

export function TraderInventoryPanel({ trader, selectedItem, onSelectItem }: TraderInventoryPanelProps) {
  const { i18n, t } = useTranslation()

  return (
    <section className="border-t border-[var(--border)] px-4 py-3.5 text-[var(--text)]">
      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-300">
        <Store size={13} aria-hidden="true" />
        {t('map.traderInventory')}
      </h3>
      <p className="mb-2.5 text-xs leading-relaxed text-zinc-300">
        {t('map.traderStockCount', { trader: trader.name, count: trader.items.length + (trader.services?.length ?? 0) })}
      </p>
      <div className="space-y-1.5">
        {trader.services?.map((service) => (
          <div key={service.id} className="rounded-[var(--radius-sm)] bg-white/[0.04] px-3 py-2.5">
            <div className="flex items-center justify-between gap-3 text-sm font-semibold">
              <span>{service.name}</span>
              <span className="flex shrink-0 items-center gap-1 tabular-nums text-[var(--accent-text)]"><Coins size={12} aria-hidden="true" />{service.price.toLocaleString(i18n.language)}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-zinc-300">{service.description}</p>
            {service.requiredGlobalKey && <p className="mt-1 text-xs leading-relaxed text-zinc-300">
              {progressionBossByKey[service.requiredGlobalKey]
                ? t('map.unlockAfterBoss', { boss: t(`map.progression.${progressionBossByKey[service.requiredGlobalKey]}`) })
                : t('map.requiresProgression')}
            </p>}
          </div>
        ))}
        {trader.items.map((item) => {
          const progressionBoss = item.requiredGlobalKey
            ? progressionBossByKey[item.requiredGlobalKey]
            : undefined
          return (
            <button
              type="button"
              key={item.prefabName}
              onClick={() => onSelectItem(item)}
              aria-pressed={selectedItem === item.prefabName}
              className={cn(
                'flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-2.5 text-left transition-colors',
                selectedItem === item.prefabName
                  ? 'border-[var(--accent)] bg-transparent'
                  : 'border-transparent bg-white/[0.04] hover:bg-white/[0.07]',
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-black/25">
                {item.icon ? <img src={item.icon} alt="" className="size-7 object-contain" /> : <Store size={16} aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium leading-5 text-[var(--text)]">{item.name}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs leading-relaxed text-zinc-300">
                  {item.requiredGlobalKey ? <LockKeyhole size={12} className="shrink-0" aria-hidden="true" /> : null}
                  {item.requiredGlobalKey
                    ? progressionBoss
                      ? t('map.unlockAfterBoss', { boss: t(`map.progression.${progressionBoss}`) })
                      : t('map.requiresProgression')
                    : t('map.availableImmediately')}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="flex items-center justify-end gap-1 text-xs font-semibold tabular-nums text-[var(--accent-text)]">
                  <Coins size={12} aria-hidden="true" />{new Intl.NumberFormat(i18n.language).format(item.price ?? 0)}
                </p>
                {item.stack && item.stack > 1 ? (
                  <p className="mt-0.5 text-xs text-zinc-300">{t('map.stackAmount', { count: item.stack })}</p>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
