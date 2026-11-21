import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
let currentNow = Date.now()
let timer = 0

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  if (!timer) {
    timer = window.setInterval(() => {
      currentNow = Date.now()
      for (const notify of listeners) notify()
    }, 15_000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.clearInterval(timer)
      timer = 0
    }
  }
}

const getSnapshot = () => currentNow

/**
 * A shared, slow-ticking clock. Age labels such as "updated 3 minutes ago" need
 * the current time without turning every component into an impure render.
 */
export const useNow = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
