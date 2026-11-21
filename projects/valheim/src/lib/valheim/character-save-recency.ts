export interface PlayedCharacter { name: string; updatedAt: number }
const storageKey = 'valheim-companion:last-played-characters'

/** Steam's file metadata, not the character's creation date or pin count. */
export function parseSteamCharacterSaveTimes(raw: string): Map<string, number> {
  const times = new Map<string, number>()
  for (const match of raw.matchAll(/"characters[\\/]([^"\\/]+\.fch)"\s*\{([^{}]*)\}/gi)) {
    if (match[1].toLowerCase().includes('_backup')) continue
    const stamp = match[2].match(/"localtime"\s*"(\d+)"/) ?? match[2].match(/"time"\s*"(\d+)"/)
    const milliseconds = Number(stamp?.[1]) * 1000
    if (Number.isSafeInteger(milliseconds) && milliseconds > 0) times.set(match[1].toLowerCase(), milliseconds)
  }
  return times
}

export function readLastPlayedCharacter(worldUid: string | null): PlayedCharacter | null {
  if (!worldUid) return null
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')[worldUid]
    return value && typeof value.name === 'string' && value.name.trim()
      && typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value : null
  } catch { return null }
}

export function rememberPlayedCharacter(worldUid: string, name: string): void {
  try {
    const previous = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')
    const history = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {}
    window.localStorage.setItem(storageKey, JSON.stringify({ ...history, [worldUid]: { name, updatedAt: Date.now() } }))
  } catch { /* Character selection also works when storage is unavailable. */ }
}
