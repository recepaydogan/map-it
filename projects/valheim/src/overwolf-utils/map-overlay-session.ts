interface MapOverlaySessionState {
  gameRunning: boolean
  blocked: boolean
}

interface SessionHost {
  __valheimMapOverlaySession?: MapOverlaySessionState
}

/** Share state for the lifetime of the background page (the app session). */
function session(): MapOverlaySessionState {
  const host = (typeof overwolf !== 'undefined' ? overwolf.windows.getMainWindow() : globalThis) as SessionHost
  host.__valheimMapOverlaySession ??= { gameRunning: false, blocked: false }
  return host.__valheimMapOverlaySession
}

/** Returns true only for the first running update of a game session. */
export function beginMapOverlayGameSession(): boolean {
  const state = session()
  if (state.gameRunning) return false
  state.gameRunning = true
  return !state.blocked
}

export function endMapOverlayGameSession(): void {
  const state = session()
  state.gameRunning = false
}

/** A manual close suppresses automatic reopening until the app exits. */
export function blockMapOverlayAutoLaunchForSession(): void {
  session().blocked = true
}
