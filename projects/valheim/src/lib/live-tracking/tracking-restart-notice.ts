import type { InstallOutcome } from './tracking-installer.ts'
import { useAppToastStore } from '../../store/app-toast-store.ts'

const STORAGE_KEY = 'valheim-companion:tracking-restart-process'

/** A copied DLL is current on disk before the running game has loaded it. */
export function syncTrackingRestartNotice(outcomes: readonly InstallOutcome[], processId: number | null): boolean {
  const { push, clearKind, toasts } = useAppToastStore.getState()
  const pendingProcess = window.localStorage.getItem(STORAGE_KEY)
  const copiedWhileRunning = outcomes.some(outcome =>
    outcome === 'installed-restart-required' || outcome === 'locked-restart-required')
  const restartRequired = processId !== null && (copiedWhileRunning || pendingProcess === String(processId))
  if (restartRequired) {
    window.localStorage.setItem(STORAGE_KEY, String(processId))
    if (!toasts.some(toast => toast.kind === 'tracker-restart-required')) {
      push('tracker-restart-required', { sticky: true })
    }
  } else {
    window.localStorage.removeItem(STORAGE_KEY)
    clearKind('tracker-restart-required')
  }
  return restartRequired
}
