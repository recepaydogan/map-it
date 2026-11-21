import { Hammer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useHotkeyRebind } from '../hooks/use-hotkey-rebind'
import { formatHotkeyBinding } from '../lib/hotkey-bindings'
import { isOverwolf } from '../utils/overwolf'
import './craft-hotkey-hint-window.css'

export function CraftHotkeyHintWindow() {
  const { t } = useTranslation()
  const hotkeys = useHotkeyRebind()
  const binding = hotkeys.bindings.toggle_craft_overlay
    ?? (!isOverwolf() || hotkeys.status === 'loading' ? 'Ctrl+Alt+C' : '')
  const label = binding ? formatHotkeyBinding(binding) : ''

  return <aside className="craft-hotkey-hint" role="status" aria-live="polite">
    <span className="craft-hotkey-hint-icon" aria-hidden="true"><Hammer size={20} /></span>
    <span className="craft-hotkey-hint-copy">
      <strong>{t('craftHotkeyHint.title')}</strong>
      {label
        ? <span>{t('craftHotkeyHint.body')} <kbd>{label}</kbd></span>
        : <span>{t('craftHotkeyHint.unassigned')}</span>}
    </span>
  </aside>
}
