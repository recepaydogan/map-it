import { Keyboard, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export function ControlsHud() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t('building.controls.showHints', { defaultValue: 'Show Controls & Shortcuts' })}
        className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[10.5px] font-semibold text-[var(--muted)] shadow-lg backdrop-blur-xl transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text)]"
      >
        <Keyboard size={12} aria-hidden="true" />
        <span>{t('building.controls.shortcuts', { defaultValue: 'Controls' })}</span>
      </button>
    )
  }

  return (
    <div className="pointer-events-auto flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-black/85 p-2.5 text-[11px] shadow-2xl backdrop-blur-2xl">
      <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
        <div className="flex items-center gap-1.5 font-bold text-[var(--text)]">
          <Keyboard size={13} className="text-[var(--accent-text)]" aria-hidden="true" />
          <span>{t('building.controls.title', { defaultValue: 'Valheim Building Controls' })}</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="cursor-pointer text-[var(--muted)] hover:text-[var(--text)]"
        >
          <X size={12} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--muted)]">Place Piece:</span>
          <kbd className="rounded bg-white/10 px-1 py-0.2 font-mono font-bold text-[var(--text)]">LMB</kbd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--muted)]">Demolish:</span>
          <kbd className="rounded bg-white/10 px-1 py-0.2 font-mono font-bold text-[var(--text)]">RMB</kbd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--muted)]">Rotate 90°:</span>
          <kbd className="rounded bg-white/10 px-1 py-0.2 font-mono font-bold text-[var(--text)]">R</kbd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--muted)]">Undo:</span>
          <kbd className="rounded bg-white/10 px-1 py-0.2 font-mono font-bold text-[var(--text)]">Ctrl+Z</kbd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--muted)]">Orbit Camera:</span>
          <kbd className="rounded bg-white/10 px-1 py-0.2 font-mono font-bold text-[var(--text)]">R-Drag</kbd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--muted)]">Pan View:</span>
          <kbd className="rounded bg-white/10 px-1 py-0.2 font-mono font-bold text-[var(--text)]">M-Drag</kbd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--muted)]">Frame Scene:</span>
          <kbd className="rounded bg-white/10 px-1 py-0.2 font-mono font-bold text-[var(--text)]">F</kbd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--muted)]">Heatmap:</span>
          <kbd className="rounded bg-white/10 px-1 py-0.2 font-mono font-bold text-[var(--text)]">C</kbd>
        </div>
      </div>
    </div>
  )
}
