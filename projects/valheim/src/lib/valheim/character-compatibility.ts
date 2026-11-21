/** Remote data may select this bundled reader; it never supplies executable code. */
export interface CharacterCompatibility {
  schema_version: 1
  revision: number
  parser_profile: 'grouped-stats-v1'
  compatible_versions: number[]
}

export class UnsupportedCharacterVersionError extends Error {
  readonly version: number
  constructor(version: number) {
    super(`Unsupported Valheim character version ${version}`)
    this.name = 'UnsupportedCharacterVersionError'
    this.version = version
  }
}

export function parseCharacterCompatibility(value: unknown): CharacterCompatibility | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (row.schema_version !== 1 || row.parser_profile !== 'grouped-stats-v1'
    || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1
    || !Array.isArray(row.compatible_versions) || row.compatible_versions.length > 128
    || !row.compatible_versions.every(v => Number.isInteger(v) && v >= 47 && v <= 2147483647)) return null
  return {
    schema_version: 1,
    revision: Number(row.revision),
    parser_profile: 'grouped-stats-v1',
    compatible_versions: [...new Set<number>(row.compatible_versions)].sort((a, b) => a - b),
  }
}

export function characterLayoutVersion(version: number, compatibility: CharacterCompatibility | null): number {
  if (version >= 30 && version <= 47) return version
  const verified = parseCharacterCompatibility(compatibility)
  if (verified?.compatible_versions.includes(version)) return 47
  throw new UnsupportedCharacterVersionError(version)
}

/** Per-window request deduplication and validated offline fallback. */
export function createCharacterCompatibilityStore(options: {
  readCache: () => unknown
  writeCache: (value: CharacterCompatibility) => void
  fetchRemote: (signal: AbortSignal) => Promise<unknown>
  now?: () => number
  timeoutMs?: number
}) {
  let current: CharacterCompatibility | null = null
  try { current = parseCharacterCompatibility(options.readCache()) } catch { /* Storage can be unavailable. */ }
  let pending: Promise<CharacterCompatibility | null> | null = null
  let lastAttempt = -Infinity
  const now = options.now ?? Date.now
  return {
    getSnapshot: () => current,
    refresh(force = false): Promise<CharacterCompatibility | null> {
      if (pending) return pending
      if (!force && now() - lastAttempt < 60_000) return Promise.resolve(current)
      lastAttempt = now()
      pending = (async () => {
        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort()
              reject(new Error('Character compatibility request timed out'))
            }, options.timeoutMs ?? 5000)
          })
          const next = parseCharacterCompatibility(await Promise.race([options.fetchRemote(controller.signal), timeout]))
          if (!next) throw new Error('Invalid character compatibility response')
          // An intentional rollback is a newer revision with a smaller explicit list.
          if (current && next.revision < current.revision) return current
          if (JSON.stringify(next) !== JSON.stringify(current)) {
            current = next
            try { options.writeCache(next) } catch { /* In-memory config still works. */ }
          }
        } catch { /* Missing table, offline, timeout or malformed data: keep the last verified list. */ }
        finally { clearTimeout(timer) }
        return current
      })().finally(() => { pending = null })
      return pending
    },
  }
}
