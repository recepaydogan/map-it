import {
  Check,
  ChevronDown,
  Database,
  Globe2,
  LoaderCircle,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn.ts'
import type { LocationGenerationProfile } from '../lib/valheim/location-generator.ts'
import type { ValheimWorldSave } from '../types/world-save.ts'

interface WorldSelectorProps {
  seedName: string
  selectedWorldId: string | null
  worlds: ValheimWorldSave[]
  discovering: boolean
  readingDatabase: boolean
  saveError: string | null
  showLocationProfile: boolean
  locationProfile: LocationGenerationProfile
  onLocationProfileChange: (profile: LocationGenerationProfile) => void
  onSelectSeed: (seedName: string) => void
  onSelectWorld: (world: ValheimWorldSave) => void
  onRemoveSeed: (world: ValheimWorldSave) => void
  onRefresh: () => void
  onOpen?: () => void
}

export function WorldSelector({
  seedName,
  selectedWorldId,
  worlds,
  discovering,
  readingDatabase,
  saveError,
  showLocationProfile,
  locationProfile,
  onLocationProfileChange,
  onSelectSeed,
  onSelectWorld,
  onRemoveSeed,
  onRefresh,
  onOpen,
}: WorldSelectorProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [manualSeedOpen, setManualSeedOpen] = useState(false)
  const [seedDraft, setSeedDraft] = useState(seedName)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedWorld = worlds.find((world) => world.id === selectedWorldId)
  const displayedWorld = selectedWorld ?? worlds.find((world) => world.seedName === seedName)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const submitSeed = () => {
    const nextSeed = seedDraft.trim()
    if (!nextSeed) return
    onSelectSeed(nextSeed)
    setOpen(false)
  }

  return (
    <div data-tour="world" ref={rootRef} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => {
          if (!open) {
            onOpen?.()
            setSeedDraft(seedName)
            setManualSeedOpen(false)
          }
          setOpen((value) => !value)
        }}
        className="flex h-9 max-w-64 cursor-pointer items-center gap-2 rounded-[var(--radius-full)] border border-[var(--border)] bg-[var(--overlay-background)] px-3 text-left shadow-lg backdrop-blur-xl transition-colors hover:border-[var(--border-strong)]"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {displayedWorld ? (
          <Database size={15} className="shrink-0 text-[var(--accent-text)]" aria-hidden="true" />
        ) : (
          <Globe2 size={15} className="shrink-0 text-[var(--accent-text)]" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-[var(--text)]">
          {displayedWorld?.name ?? seedName}
        </span>
        {readingDatabase ? (
          <LoaderCircle size={13} className="shrink-0 animate-spin text-[var(--muted)]" aria-hidden="true" />
        ) : (
          <ChevronDown size={13} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t('worlds.selector')}
          className="absolute left-0 top-full mt-2 w-72 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--overlay-background)] shadow-2xl backdrop-blur-xl"
        >
          <div className="max-h-64 overflow-y-auto p-2">
            <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{t('worlds.yourWorlds')}</p>
              <button type="button" onClick={onRefresh} disabled={discovering} className="grid size-6 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:cursor-default disabled:opacity-60" aria-label={t('worlds.refresh')} title={t('worlds.refresh')}>
                <RefreshCw size={13} className={cn(discovering && 'animate-spin')} aria-hidden="true" />
              </button>
            </div>
            {discovering ? (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-[var(--muted)]">
                <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
                {t('worlds.scanning')}
              </div>
            ) : worlds.length === 0 ? (
              <p className="px-2 py-3 text-xs leading-relaxed text-[var(--muted)]">{t('worlds.noneFound')}</p>
            ) : worlds.map((world) => (
              <div key={world.id} className={cn('flex items-center rounded-[var(--radius-md)]', selectedWorldId === world.id && 'bg-[var(--surface-hover)]')}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectWorld(world)
                    setOpen(false)
                  }}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-left transition-colors hover:bg-white/5"
                >
                  <Database size={14} className="shrink-0 text-[var(--accent-text)]" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-[var(--text)]">{world.name}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-[var(--muted)]">{world.seedName}</span>
                  </span>
                  {selectedWorldId === world.id ? (
                    <Check size={13} className="shrink-0 text-[var(--accent-text)]" aria-hidden="true" />
                  ) : null}
                </button>
                {world.source === 'remembered' ? (
                  <button
                    type="button"
                    onClick={() => onRemoveSeed(world)}
                    className="mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--danger)]"
                    aria-label={t('worlds.removeSeed', { name: world.name })}
                    title={t('worlds.removeSeed', { name: world.name })}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <div className="border-t border-[var(--border)] p-2">
            <button
              type="button"
              onClick={() => setManualSeedOpen((value) => !value)}
              className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-left text-xs font-medium text-[var(--muted)] transition-colors hover:bg-white/5 hover:text-[var(--text)]"
              aria-expanded={manualSeedOpen}
            >
              <Globe2 size={14} className="shrink-0" aria-hidden="true" />
              <span className="flex-1">{t('worlds.manualSeed')}</span>
              <ChevronDown
                size={13}
                className={cn('transition-transform', manualSeedOpen && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
            {manualSeedOpen ? (
              <form
                className="px-2 pb-2 pt-1"
                onSubmit={(event) => {
                  event.preventDefault()
                  submitSeed()
                }}
              >
                <label htmlFor="world-seed" className="sr-only">{t('map.worldSeed')}</label>
                <div className="flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background)] px-2.5 focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent)]">
                  <Search size={13} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
                  <input
                    id="world-seed"
                    value={seedDraft}
                    onChange={(event) => setSeedDraft(event.target.value)}
                    placeholder={t('map.seedPlaceholder')}
                    className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
                  />
                  <button
                    type="submit"
                    disabled={!seedDraft.trim()}
                    className="grid size-6 cursor-pointer place-items-center rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={t('worlds.loadSeed')}
                  >
                    <Check size={13} aria-hidden="true" />
                  </button>
                </div>
              </form>
            ) : null}
          </div>

          {showLocationProfile ? (
            <div className="border-t border-[var(--border)] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{t('worlds.locationProfile')}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-[var(--muted)]">{t('worlds.locationProfileHelp')}</p>
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-[var(--radius-md)] bg-[var(--background)] p-1">
                {(['current', 'legacy'] as const).map((profile) => (
                  <button
                    key={profile}
                    type="button"
                    onClick={() => onLocationProfileChange(profile)}
                    aria-pressed={locationProfile === profile}
                    className={cn('cursor-pointer rounded-[var(--radius-sm)] px-2 py-1.5 text-[10px] font-semibold transition-colors',
                      locationProfile === profile
                        ? 'bg-[var(--surface-raised)] text-[var(--text)] shadow-sm'
                        : 'text-[var(--muted)] hover:text-[var(--text)]')}
                  >
                    {t(profile === 'legacy' ? 'worlds.locationProfileLegacy' : 'worlds.locationProfileCurrent')}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {saveError ? (
            <p className="border-t border-[var(--border)] px-3 py-2 text-[10px] leading-relaxed text-[var(--danger)]">
              {t('worlds.readError')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
