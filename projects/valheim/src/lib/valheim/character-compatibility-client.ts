/// <reference types="vite/client" />
import { createCharacterCompatibilityStore } from './character-compatibility.ts'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const cacheKey = `valheim:character-compatibility:v1:${url ?? 'unconfigured'}`

// Public read-only configuration uses the existing public key without creating
// an auth session or depending on the user's login/refresh token.
export const characterCompatibility = createCharacterCompatibilityStore({
  readCache: () => JSON.parse(localStorage.getItem(cacheKey) ?? 'null'),
  writeCache: value => localStorage.setItem(cacheKey, JSON.stringify(value)),
  fetchRemote: async signal => {
    if (!url || !key) throw new Error('Supabase is not configured')
    const response = await fetch(`${url}/rest/v1/valheim_character_compatibility?id=eq.default&select=schema_version,revision,parser_profile,compatible_versions&limit=1`, {
      headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) },
      signal,
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`Character compatibility HTTP ${response.status}`)
    const rows: unknown = await response.json()
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Missing character compatibility row')
    return rows[0]
  },
})
