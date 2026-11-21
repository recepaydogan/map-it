import { readPreferences, writePreferences } from '../../store/preferences'
import type { CraftWindowName } from '../../overwolf-utils/craft-close-request'
import { trackCraftEvent } from './analytics'
import { EVENTS } from './events'

export type CraftCloseSource = 'close_button' | 'hotkey' | 'alt_f4'
export type CraftOpenSource = 'hotkey' | 'header_button' | 'game_auto_launch' | 'desktop_auto_launch'

// Explicit target is required: hotkeys/auto-launch are captured in background,
// while close actions are captured by the target window itself.
export function trackCraftWindow(event: string, name: CraftWindowName, props: Record<string, unknown> = {}) {
  trackCraftEvent(event, {
    craft_window: name,
    ...props,
  })
}

export function setCompanionAutoLaunch(enabled: boolean, source: 'window_toggle' | 'settings' | 'close_confirmation', props: Record<string, unknown> = {}) {
  const preferences = readPreferences()
  if (preferences.autoLaunchCompanion === enabled) return
  writePreferences({ ...preferences, autoLaunchCompanion: enabled })
  if (readPreferences().autoLaunchCompanion !== enabled) return
  trackCraftWindow(EVENTS.CRAFT_AUTO_LAUNCH_CHANGED, 'companion', {
    source, previous_enabled: preferences.autoLaunchCompanion, enabled, ...props,
  })
}
