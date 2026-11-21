import type { CharacterMapPin } from './valheim/character-save-format'

/** Localizes game tokens while preserving player-written pin names. */
export const playerPinDisplayName = (pin: CharacterMapPin, translate: (key: string) => string | null): string => {
  if (!pin.name.startsWith('$')) return pin.name
  const [token, ...rest] = pin.name.slice(1).split(' ')
  const translated = translate(token)
  return translated ? [translated, ...rest].join(' ') : pin.name
}
