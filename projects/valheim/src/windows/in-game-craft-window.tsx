import { ChevronDown, GripHorizontal, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MultiCraftPreview } from '../features/crafting-planner/multi-craft-preview'
import { useLiveInventory } from '../hooks/use-live-inventory'
import { useLiveContainers } from '../hooks/use-live-containers'
import { useHotkeyRebind } from '../hooks/use-hotkey-rebind'
import { formatHotkeyBinding } from '../lib/hotkey-bindings'
import { dragCurrentWindow } from '../overwolf-utils/window-manager'
import { useCraftClose } from '../hooks/use-craft-close'
import { isOverwolf } from '../utils/overwolf'
import './in-game-craft-window.css'

export function InGameCraftWindow({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation()
  const inventory = useLiveInventory(false)
  const containers = useLiveContainers(inventory.snapshot?.worldUid ?? null)
  const hotkeys = useHotkeyRebind()
  const [previewClosed, setPreviewClosed] = useState(false)
  const closePreview = useCallback(() => setPreviewClosed(true), [])
  const { requestClose, closeDialog } = useCraftClose('craft_overlay', embedded, closePreview)
  const panel = useRef<HTMLElement>(null)
  const [collapseAll, setCollapseAll] = useState(false)
  const binding = hotkeys.bindings.toggle_craft_overlay ?? (!isOverwolf() ? 'Ctrl+Alt+C' : '')
  const label = binding ? formatHotkeyBinding(binding) : t(hotkeys.status === 'loading' ? 'common.loading' : 'settings.hotkeyUnassigned')

  useEffect(() => {
    if (embedded || !isOverwolf()) return
    let disposed = false
    let observer: ResizeObserver | undefined
    overwolf.windows.getCurrentWindow((result) => {
      if (disposed || !result.success || !panel.current) return
      let lastHeight = 0
      let lastWidth = 0
      observer = new ResizeObserver(() => {
        if (!panel.current) return
        const bounds = panel.current.getBoundingClientRect()
        // Leave room around the frame so the native surface cannot clip its rounded edges.
        const height = Math.max(80, Math.ceil(bounds.height) + 4)
        const width = Math.max(340, Math.ceil(bounds.width) + 4)
        if (height === lastHeight && width === lastWidth) return
        lastHeight = height
        lastWidth = width
        overwolf.windows.changeSize({ window_id: result.window.id, width, height, auto_dpi_resize: true }, () => {})
      })
      observer.observe(panel.current)
      if (!localStorage.getItem('valheim-companion:craft-overlay-placed-v2')) {
        overwolf.windows.changePosition(result.window.id, 20, 100, (moved) => {
          if (moved.success) localStorage.setItem('valheim-companion:craft-overlay-placed-v2', '1')
        })
      }
    })
    return () => { disposed = true; observer?.disconnect() }
  }, [embedded])

  if (embedded && previewClosed) return <button type="button" className="craft-tracker-reopen" onClick={() => setPreviewClosed(false)}>{t('planner.preview.reopenOverlay')}</button>

  return <main ref={panel} className="in-game-craft" aria-label={t('planner.tracker.title')}>
    <header className="craft-tracker-bar">
      <div className="craft-tracker-drag" title={t('settings.toggle_craft_overlay')} onMouseDown={(event) => { if (!embedded && event.button === 0) dragCurrentWindow() }}>
        <GripHorizontal size={14} aria-hidden="true" /><span>{label}</span>
      </div>
      <button type="button" className="craft-collapse-all" title={t(collapseAll ? 'planner.preview.expandAll' : 'planner.preview.collapseAll')} aria-label={t(collapseAll ? 'planner.preview.expandAll' : 'planner.preview.collapseAll')} aria-expanded={!collapseAll} aria-controls="craft-overlay-content" onClick={() => setCollapseAll((value) => !value)}>
        <ChevronDown size={15} style={{ transform: collapseAll ? undefined : 'rotate(180deg)' }} />
      </button>
      <button type="button" aria-label={t('planner.tracker.stop')} onClick={() => requestClose('close_button')}><X size={15} /></button>
    </header>
    <div id="craft-overlay-content" className="craft-overlay-content" data-collapsed={collapseAll} inert={collapseAll} aria-hidden={collapseAll}>
      <div className="craft-overlay-content-clip"><MultiCraftPreview inventory={inventory} containers={containers} /></div>
    </div>
    {closeDialog}
  </main>
}
