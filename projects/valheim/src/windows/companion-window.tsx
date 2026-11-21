import { CompanionAd } from '../components/ads/companion-ad'
import { GripHorizontal, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MultiCraftPreview } from '../features/crafting-planner/multi-craft-preview'
import { CompanionAutoLaunch } from '../features/crafting-planner/components/craft-auto-launch'
import { useLiveInventory } from '../hooks/use-live-inventory'
import { useLiveContainers } from '../hooks/use-live-containers'
import { useHotkeyRebind } from '../hooks/use-hotkey-rebind'
import { formatHotkeyBinding } from '../lib/hotkey-bindings'
import { dragCurrentWindow } from '../overwolf-utils/window-manager'
import { useCraftClose } from '../hooks/use-craft-close'
import { isOverwolf } from '../utils/overwolf'
import './companion-window.css'

export function CompanionWindow() {
  const { t } = useTranslation()
  const inventory = useLiveInventory(false)
  const containers = useLiveContainers(inventory.snapshot?.worldUid ?? null)
  const hotkeys = useHotkeyRebind()
  const { requestClose, closeDialog } = useCraftClose('companion')
  const binding = hotkeys.bindings.toggle_companion ?? (!isOverwolf() ? 'Ctrl+Shift+C' : '')
  const label = binding ? formatHotkeyBinding(binding) : t(hotkeys.status === 'loading' ? 'common.loading' : 'settings.hotkeyUnassigned')
  return <div className="craft-companion">
    <main className="companion-crafts" aria-label={t('planner.tracker.title')}>
      <header className="craft-tracker-bar">
        <div className="craft-tracker-drag" title={t('settings.toggle_companion')} onMouseDown={(event) => { if (event.button === 0) dragCurrentWindow() }}>
          <GripHorizontal size={14} aria-hidden="true" /><span>{label}</span>
        </div>
        <CompanionAutoLaunch />
        <button type="button" aria-label={t('planner.tracker.stop')} onClick={() => requestClose('close_button')}><X size={15} /></button>
      </header>
      <MultiCraftPreview inventory={inventory} containers={containers} companion />
      {closeDialog}
    </main>
    <CompanionAd />
  </div>
}
