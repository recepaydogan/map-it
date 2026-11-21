import { useEffect, useState } from 'react'

const VISIBILITY_POLL_MS = 2_000

/** Whether another window completely covers the desktop main window. */
export function useMainWindowOcclusion(enabled: boolean): boolean | null {
  const [covered, setCovered] = useState<boolean | null>(null)

  useEffect(() => {
    if (!enabled || typeof overwolf === 'undefined' || !overwolf.windows?.isWindowVisibleToUser) return

    let cancelled = false
    const checkVisibility = () => {
      try {
        overwolf.windows.isWindowVisibleToUser((result) => {
          if (cancelled) return
          if (!result?.success) {
            setCovered((previous) => previous ?? false)
            return
          }
          setCovered(result.visible === 'hidden')
        })
      } catch {
        if (!cancelled) setCovered((previous) => previous ?? false)
      }
    }

    checkVisibility()
    const poll = window.setInterval(checkVisibility, VISIBILITY_POLL_MS)
    window.addEventListener('focus', checkVisibility)
    window.addEventListener('blur', checkVisibility)
    document.addEventListener('visibilitychange', checkVisibility)
    overwolf.games?.onGameInfoUpdated?.addListener(checkVisibility)

    return () => {
      cancelled = true
      window.clearInterval(poll)
      window.removeEventListener('focus', checkVisibility)
      window.removeEventListener('blur', checkVisibility)
      document.removeEventListener('visibilitychange', checkVisibility)
      overwolf.games?.onGameInfoUpdated?.removeListener(checkVisibility)
    }
  }, [enabled])

  if (!enabled || typeof overwolf === 'undefined' || !overwolf.windows?.isWindowVisibleToUser) return false
  return covered
}
