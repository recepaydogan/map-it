export type CraftWindowName = 'companion' | 'craft_overlay'

interface CloseState { blocked: boolean; revision: number }
interface SessionHost { __valheimCraftAutoLaunchSession?: CloseState }

/** The companion shares the background page's lifetime, not a game session. */
function session(): CloseState {
  const host = (typeof overwolf !== 'undefined' ? overwolf.windows.getMainWindow() : globalThis) as SessionHost
  host.__valheimCraftAutoLaunchSession ??= { blocked: false, revision: 0 }
  return host.__valheimCraftAutoLaunchSession
}

export const canAutoLaunchCraftCompanion = (): boolean => !session().blocked

/** Reserve suppression before hiding, so a pending automatic open is cancelled too. */
export async function closeCraftCompanionForSession(hide: () => Promise<void>): Promise<void> {
  const state = session()
  const previous = state.blocked
  const revision = ++state.revision
  state.blocked = true
  try { await hide() }
  catch (error) {
    if (state.revision === revision) state.blocked = previous
    throw error
  }
}
