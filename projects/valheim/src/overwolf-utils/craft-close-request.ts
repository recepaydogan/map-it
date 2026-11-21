import { trackCraftWindow, type CraftCloseSource } from '../lib/analytics/craft-window-analytics'
import { EVENTS } from '../lib/analytics/events'
import { getOpenWindow, restoreWindow } from './window-manager'

import type { CraftWindowName } from './craft-auto-launch-session.ts'
export type { CraftWindowName } from './craft-auto-launch-session.ts'
export const CRAFT_CLOSE_REQUEST = 'craft-close-request'

export function requestCraftWindowClose(name: CraftWindowName, source: CraftCloseSource = 'hotkey'): Promise<void> {
  return new Promise((resolve, reject) => {
    overwolf.windows.sendMessage(name, CRAFT_CLOSE_REQUEST, { name, source }, (result) => {
      if (result.success) resolve()
      else reject(new Error(result.error ?? 'Unable to request craft window close'))
    })
  })
}

export async function toggleCraftOverlay() {
  const current = await getOpenWindow('craft_overlay')
  if (current && ['normal', 'maximized'].includes(current.stateEx ?? current.state ?? '')) {
    await requestCraftWindowClose('craft_overlay')
  } else {
    await restoreWindow('craft_overlay')
    trackCraftWindow(EVENTS.CRAFT_WINDOW_OPENED, 'craft_overlay', { source: 'hotkey' })
  }
}
