export const VALHEIM_CLASS_ID = 21668

export const APP_HOTKEY_NAMES = ['toggle_app', 'toggle_in_game_app', 'toggle_overlay', 'toggle_craft_overlay', 'toggle_companion'] as const
export type AppHotkeyName = (typeof APP_HOTKEY_NAMES)[number]
export type HotkeyBindings = Partial<Record<AppHotkeyName, string>>

type AssignedHotkey = {
  name: string
  binding: string
  IsUnassigned: boolean
}

type AssignedHotkeyResult = {
  globals?: AssignedHotkey[]
  games?: Record<string, AssignedHotkey[]>
}

export const isAppHotkeyName = (name: string): name is AppHotkeyName =>
  APP_HOTKEY_NAMES.some((hotkeyName) => hotkeyName === name)

/**
 * Dedicated-game apps receive their effective bindings under `games`, not
 * necessarily under `globals`. Valheim entries intentionally override global
 * entries when Overwolf returns both.
 */
export function getAppHotkeyBindings(result: AssignedHotkeyResult): HotkeyBindings {
  const hotkeys = [
    ...(result.globals ?? []),
    ...(result.games?.[String(VALHEIM_CLASS_ID)] ?? []),
  ]

  return hotkeys.reduce<HotkeyBindings>((bindings, hotkey) => {
    if (isAppHotkeyName(hotkey.name)) {
      bindings[hotkey.name] = hotkey.IsUnassigned ? '' : hotkey.binding
    }
    return bindings
  }, {})
}

export const formatHotkeyBinding = (binding: string): string =>
  binding.replace(/\s*\+\s*/g, ' + ')

type CapturedKey = {
  key: string
  keyCode: number
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const CAPTURE_MODIFIER_KEYS = new Set([
  'Alt',
  'AltGraph',
  'ContextMenu',
  'Control',
  'Meta',
  'Shift',
])

const CAPTURE_KEY_LABELS: Record<string, string> = {
  ' ': 'Space',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
}

/** Human-readable live preview of the keys held during capture. */
export const formatCapturedHotkey = (key: CapturedKey): string => {
  if (key.key === 'AltGraph') return 'AltGr'

  const labels: string[] = []
  if (key.ctrlKey) labels.push('Ctrl')
  if (key.altKey) labels.push('Alt')
  if (key.shiftKey) labels.push('Shift')

  if (!CAPTURE_MODIFIER_KEYS.has(key.key)) {
    labels.push(CAPTURE_KEY_LABELS[key.key] ?? (
      key.key.length === 1 ? key.key.toUpperCase() : key.key
    ))
  }

  return labels.join(' + ')
}

/** Build the dedicated-game payload expected by Overwolf's assign API. */
export const createHotkeyAssignment = (name: AppHotkeyName, key: CapturedKey) => ({
  name,
  gameId: VALHEIM_CLASS_ID,
  virtualKey: key.keyCode,
  modifiers: {
    ctrl: key.ctrlKey,
    alt: key.altKey,
    shift: key.shiftKey,
  },
})
