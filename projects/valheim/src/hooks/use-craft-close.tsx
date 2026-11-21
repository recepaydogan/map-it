import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CRAFT_CLOSE_REQUEST, type CraftWindowName } from '../overwolf-utils/craft-close-request'
import { hideWindow } from '../overwolf-utils/window-manager'
import { closeCraftCompanionForSession } from '../overwolf-utils/craft-auto-launch-session.ts'
import { setCompanionAutoLaunch, trackCraftWindow, type CraftCloseSource } from '../lib/analytics/craft-window-analytics'
import { EVENTS } from '../lib/analytics/events'
import { isOverwolf } from '../utils/overwolf'
import './use-craft-close.css'

export function useCraftClose(name: CraftWindowName, preview = false, onPreviewClose?: () => void) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [disableAutoLaunch, setDisableAutoLaunch] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const closing = useRef(false)
  const closeSource = useRef<CraftCloseSource>('close_button')
  const dialogOpen = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const seenKey = `valheim-companion:close-confirmed:${name}`
  const close = useCallback(async (confirm: boolean, disable: boolean) => {
    if (closing.current) return
    closing.current = true
    setBusy(true)
    setError(false)
    try {
      if (preview) {
        dialogOpen.current = false
        setOpen(false)
        onPreviewClose?.()
        return
      }
      if (confirm) trackCraftWindow(EVENTS.CRAFT_WINDOW_CLOSE_CONFIRMED, name, { source: closeSource.current, disable_auto_launch: disable })
      if (confirm && disable && name === 'companion') {
        setCompanionAutoLaunch(false, 'close_confirmation', { close_source: closeSource.current })
      }
      if (isOverwolf()) {
        if (name === 'companion') await closeCraftCompanionForSession(() => hideWindow(name))
        else await hideWindow(name)
      }
      if (confirm) { try { localStorage.setItem(seenKey, '1') } catch { /* Closing succeeded even if persistence is unavailable. */ } }
      dialogOpen.current = false
      setOpen(false)
      if (!isOverwolf()) window.close()
    } catch {
      if (!preview) trackCraftWindow(EVENTS.CRAFT_WINDOW_CLOSE_FAILED, name, { source: closeSource.current })
      dialogOpen.current = true
      setError(true)
      setOpen(true)
    } finally {
      closing.current = false
      setBusy(false)
    }
  }, [name, seenKey, preview, onPreviewClose])
  const requestClose = useCallback((source: CraftCloseSource = 'close_button') => {
    if (closing.current || dialogOpen.current) return
    closeSource.current = source
    const needsConfirmation = preview || localStorage.getItem(seenKey) !== '1'
    if (!needsConfirmation) void close(false, false)
    else {
      dialogOpen.current = true
      setOpen(true)
    }
  }, [seenKey, close, preview])
  const cancelClose = () => {
    if (busy) return
    if (!preview) trackCraftWindow(EVENTS.CRAFT_WINDOW_CLOSE_DIALOG_CANCELLED, name, { source: closeSource.current })
    dialogOpen.current = false
    setOpen(false)
  }

  useEffect(() => {
    if (!open || !dialog.current) return
    const element = dialog.current
    element.showModal()
    return () => { if (element.open) element.close() }
  }, [open])

  useEffect(() => {
    if (preview || !isOverwolf()) return
    let currentId: string | undefined
    let disposed = false
    overwolf.windows.getCurrentWindow((result) => {
      if (!disposed && result.success) currentId = result.window.id
    })
    const onMessage = (event: overwolf.windows.MessageReceivedEvent) => {
      if (event.id === CRAFT_CLOSE_REQUEST && event.content?.name === name) requestClose(event.content?.source === 'alt_f4' ? 'alt_f4' : 'hotkey')
    }
    const onAltF4 = (event: overwolf.windows.AltF4BlockedEvent) => {
      if (event.id === currentId) requestClose('alt_f4')
    }
    overwolf.windows.onMessageReceived.addListener(onMessage)
    overwolf.windows.onAltF4Blocked.addListener(onAltF4)
    return () => {
      disposed = true
      overwolf.windows.onMessageReceived.removeListener(onMessage)
      overwolf.windows.onAltF4Blocked.removeListener(onAltF4)
    }
  }, [name, requestClose, preview])

  const closeDialog = open ? <dialog ref={dialog} className="craft-close-dialog" aria-labelledby={`close-title-${name}`} onCancel={(event) => { event.preventDefault(); cancelClose() }}>
    <h2 id={`close-title-${name}`}>{t(name === 'companion' ? 'planner.close.companionTitle' : 'planner.close.overlayTitle')}</h2>
    <p>{t(name === 'companion' ? 'planner.close.description' : 'planner.close.overlayDescription')}</p>
    {name === 'companion' && <label><input type="checkbox" checked={disableAutoLaunch} onChange={(event) => setDisableAutoLaunch(event.target.checked)} disabled={busy} />{t('planner.close.disableAutoLaunch')}</label>}
    {error && <p role="alert">{t('planner.close.error')}</p>}
    <div className="craft-close-actions">
      <button type="button" disabled={busy} onClick={cancelClose}>{t('common.cancel')}</button>
      <button type="button" className="craft-close-confirm" disabled={busy} onClick={() => void close(true, disableAutoLaunch)}>{t('common.close')}</button>
    </div>
  </dialog> : null
  return { requestClose, closeDialog }
}
