import { useEffect, useState } from 'react'
import type { LocationGenerationProfile } from '../lib/valheim/location-generator.ts'
import { PREFERENCES_CHANGED_EVENT, readPreferences, writePreferences } from '../store/preferences.ts'

export function useLocationGenerationProfile(worldKey: string): [
  LocationGenerationProfile,
  (profile: LocationGenerationProfile) => void,
] {
  const [profiles, setProfiles] = useState(() => readPreferences().locationGenerationProfiles)

  useEffect(() => {
    const sync = () => setProfiles(readPreferences().locationGenerationProfiles)
    window.addEventListener(PREFERENCES_CHANGED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(PREFERENCES_CHANGED_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const profile = profiles[worldKey] === 'legacy' ? 'legacy' : 'current'
  const setProfile = (next: LocationGenerationProfile) => {
    const preferences = readPreferences()
    writePreferences({
      ...preferences,
      locationGenerationProfiles: { ...preferences.locationGenerationProfiles, [worldKey]: next },
    })
  }
  return [profile, setProfile]
}
