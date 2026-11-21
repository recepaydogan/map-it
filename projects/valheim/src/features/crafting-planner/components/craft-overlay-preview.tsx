import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CraftOverlayWindow } from '../../../windows/craft-overlay-window'

export function CraftOverlayPreview() {
  const [open, setOpen] = useState(true)
  const { t } = useTranslation()
  return <aside className="craft-tracker-map-preview" aria-label={t('planner.tracker.preview')} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
    {open ? <CraftOverlayWindow embedded onClose={() => setOpen(false)} />
      : <button className="craft-tracker-reopen" type="button" onClick={() => setOpen(true)}>{t('planner.tracker.preview')}</button>}
  </aside>
}
