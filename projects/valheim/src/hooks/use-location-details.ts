import { useEffect, useState } from 'react'
import type { LocationRecord } from '../types/game-data'

interface LocationDetailsState {
  location: LocationRecord
  loading: boolean
  error: boolean
}

export function useLocationDetails(location: LocationRecord): LocationDetailsState {
  const [loaded, setLoaded] = useState<{
    path: string
    location: LocationRecord
  } | null>(null)
  const [errorPath, setErrorPath] = useState<string | null>(null)

  useEffect(() => {
    if (!location.detailPath) return

    const controller = new AbortController()
    fetch(location.detailPath, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Location detail request failed: ${response.status}`)
        }
        return response.json() as Promise<{ location: LocationRecord }>
      })
      .then((payload) => {
        setLoaded({ path: location.detailPath as string, location: payload.location })
        setErrorPath(null)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error(error)
        setErrorPath(location.detailPath as string)
      })

    return () => controller.abort()
  }, [location])

  const hasLoadedCurrent = Boolean(
    location.detailPath && loaded?.path === location.detailPath,
  )
  return {
    location: hasLoadedCurrent ? loaded?.location as LocationRecord : location,
    loading: Boolean(location.detailPath) && !hasLoadedCurrent &&
      errorPath !== location.detailPath,
    error: Boolean(location.detailPath) && errorPath === location.detailPath,
  }
}
