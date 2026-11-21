import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createHotkeyAssignment,
  formatCapturedHotkey,
  getAppHotkeyBindings,
  isAppHotkeyName,
  VALHEIM_CLASS_ID,
  type AppHotkeyName,
  type HotkeyBindings,
} from '../lib/hotkey-bindings'
import { isOverwolf } from '../utils/overwolf'

export type HotkeyBindingStatus = 'loading' | 'ready' | 'unavailable' | 'error'

const MODIFIER_KEYS = new Set([
  'Alt',
  'AltGraph',
  'ContextMenu',
  'Control',
  'Meta',
  'Shift',
])

export function useHotkeyRebind() {
  const [bindings, setBindings] = useState<HotkeyBindings>({})
  const [capturing, setCapturing] = useState<AppHotkeyName | null>(null)
  const [capturePreview, setCapturePreview] = useState('')
  const [assignError, setAssignError] = useState<string | null>(null)
  const assigningRef = useRef(false)
  const [status, setStatus] = useState<HotkeyBindingStatus>(() => (
    isOverwolf() ? 'loading' : 'unavailable'
  ))
  const supported = isOverwolf() && typeof overwolf.settings?.hotkeys?.assign === 'function'

  const refresh = useCallback(() => {
    if (!supported) return
    overwolf.settings.hotkeys.get((result) => {
      if (!result.success) {
        setStatus('error')
        return
      }
      setBindings(getAppHotkeyBindings(result))
      setStatus('ready')
    })
  }, [supported])

  useEffect(() => {
    if (!supported) return

    const onChanged = (event: overwolf.settings.hotkeys.OnChangedEvent) => {
      if (!isAppHotkeyName(event.name)) return
      if (event.gameId !== 0 && event.gameId !== VALHEIM_CLASS_ID) return
      setBindings((current) => ({ ...current, [event.name]: event.binding }))
      setStatus('ready')
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    overwolf.settings.hotkeys.onChanged.addListener(onChanged)
    document.addEventListener('visibilitychange', onVisibilityChange)
    refresh()

    return () => {
      overwolf.settings.hotkeys.onChanged.removeListener(onChanged)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [refresh, supported])

  const cancelCapture = useCallback(() => {
    assigningRef.current = false
    setAssignError(null)
    setCapturePreview('')
    setCapturing(null)
  }, [])

  const startCapture = useCallback((name: AppHotkeyName) => {
    assigningRef.current = false
    setAssignError(null)
    setCapturePreview('')
    setCapturing(name)
  }, [])

  useEffect(() => {
    if (!capturing || !supported) return

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()

      if (event.key === 'Escape') {
        cancelCapture()
        return
      }
      if (assigningRef.current) return

      setCapturePreview(formatCapturedHotkey(event))
      if (MODIFIER_KEYS.has(event.key) || !event.keyCode) return

      assigningRef.current = true
      overwolf.settings.hotkeys.assign(
        createHotkeyAssignment(capturing, event),
        (result) => {
          if (!result.success) {
            setAssignError(result.error ?? 'Unknown Overwolf hotkey error')
          } else {
            refresh()
          }
          assigningRef.current = false
          setCapturing(null)
        },
      )
    }

    const onKeyUp = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (assigningRef.current || !MODIFIER_KEYS.has(event.key)) return
      setCapturePreview(formatCapturedHotkey(event))
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [cancelCapture, capturing, refresh, supported])

  return {
    assignError,
    bindings,
    cancelCapture,
    capturePreview,
    capturing,
    startCapture,
    status,
    supported,
  }
}
