import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createHotkeyAssignment,
  formatHotkeyBinding,
  formatCapturedHotkey,
  getAppHotkeyBindings,
} from '../../src/lib/hotkey-bindings.ts'

const hotkey = (name: string, binding: string, IsUnassigned = false) => ({
  name,
  binding,
  IsUnassigned,
})

test('reads dedicated Valheim hotkeys instead of relying on global bindings', () => {
  const bindings = getAppHotkeyBindings({
    globals: [hotkey('toggle_overlay', 'Ctrl+Alt+V')],
    games: {
      21668: [
        hotkey('toggle_app', 'Shift+F8'),
        hotkey('toggle_overlay', 'Alt+M'),
      ],
    },
  })

  assert.deepEqual(bindings, {
    toggle_app: 'Shift+F8',
    toggle_overlay: 'Alt+M',
  })
})

test('preserves an unassigned hotkey as an empty binding', () => {
  const bindings = getAppHotkeyBindings({
    games: {
      21668: [hotkey('toggle_overlay', 'Ctrl+Alt+V', true)],
    },
  })

  assert.equal(bindings.toggle_overlay, '')
})

test('ignores unrelated hotkeys and other games', () => {
  const bindings = getAppHotkeyBindings({
    globals: [hotkey('take_screenshot', 'F12')],
    games: {
      12345: [hotkey('toggle_overlay', 'Ctrl+F1')],
    },
  })

  assert.deepEqual(bindings, {})
})

test('formats the API binding for display', () => {
  assert.equal(formatHotkeyBinding('Ctrl+Shift+V'), 'Ctrl + Shift + V')
})

test('assigns captured shortcuts specifically to Valheim', () => {
  assert.deepEqual(
    createHotkeyAssignment('toggle_overlay', {
      key: 'M',
      keyCode: 77,
      ctrlKey: true,
      altKey: false,
      shiftKey: true,
    }),
    {
      name: 'toggle_overlay',
      gameId: 21668,
      virtualKey: 77,
      modifiers: { ctrl: true, alt: false, shift: true },
    },
  )
})

test('previews modifier keys and the captured key as a readable chord', () => {
  assert.equal(formatCapturedHotkey({
    key: 'Shift',
    keyCode: 16,
    ctrlKey: true,
    altKey: false,
    shiftKey: true,
  }), 'Ctrl + Shift')

  assert.equal(formatCapturedHotkey({
    key: 'k',
    keyCode: 75,
    ctrlKey: true,
    altKey: false,
    shiftKey: true,
  }), 'Ctrl + Shift + K')
})
