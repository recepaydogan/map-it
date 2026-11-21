import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'valheim-companion:whats-new:seen-version'

const readLastSeenVersion = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function useWhatsNewReadState(version: string) {
  const [lastSeenVersion, setLastSeenVersion] = useState(readLastSeenVersion)

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) setLastSeenVersion(readLastSeenVersion())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const markRead = useCallback(() => {
    setLastSeenVersion(version)
    try {
      window.localStorage.setItem(STORAGE_KEY, version)
    } catch {
      // Keep the current window's read state when storage is unavailable.
    }
  }, [version])

  return { unread: lastSeenVersion !== version, markRead }
}
