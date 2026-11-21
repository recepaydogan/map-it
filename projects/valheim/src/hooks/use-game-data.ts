import { useEffect, useState } from 'react'
import type { DataSummary, LocationIndex } from '../types/game-data'

interface GameDataState {
  summary: DataSummary | null
  locations: LocationIndex['locations']
  loading: boolean
  error: boolean
}

const initialState: GameDataState = {
  summary: null,
  locations: [],
  loading: true,
  error: false,
}

export function useGameData(): GameDataState {
  const [state, setState] = useState<GameDataState>(initialState)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetch('/game-data/data-summary.json', { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error(`Data summary request failed: ${response.status}`)
        return response.json() as Promise<DataSummary>
      }),
      fetch('/game-data/location-index.json', { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error(`Location index request failed: ${response.status}`)
        return response.json() as Promise<LocationIndex>
      }),
    ])
      .then(([summary, index]) => {
        setState({ summary, locations: index.locations, loading: false, error: false })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error(error)
        setState({ summary: null, locations: [], loading: false, error: true })
      })

    return () => controller.abort()
  }, [])

  return state
}
