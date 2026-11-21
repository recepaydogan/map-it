import { create } from 'zustand'

export type PlannerNotificationKind =
  | 'material-completed'
  | 'target-ready'
  | 'plan-completed'
  | 'station-missing'

export interface PlannerNotification {
  id: string
  kind: PlannerNotificationKind
  name: string
  createdAt: number
}

interface PlannerNotificationState {
  notifications: PlannerNotification[]
  push: (kind: PlannerNotificationKind, name: string) => void
  dismiss: (id: string) => void
  clear: () => void
}

const MAX_VISIBLE = 3
/** No sound, no toast storm: ordinary pickups must stay quiet. */
const MIN_INTERVAL_MS = 4_000
const ALWAYS_ALLOWED: PlannerNotificationKind[] = ['plan-completed']

let lastPushAt = 0
let counter = 0

/**
 * Session-only queue. Notifications are transient by design and never persist,
 * so reopening the app cannot resurface yesterday's crafting progress.
 */
export const usePlannerNotificationStore = create<PlannerNotificationState>()((set) => ({
  notifications: [],
  push: (kind, name) => {
    const now = Date.now()
    if (!ALWAYS_ALLOWED.includes(kind) && now - lastPushAt < MIN_INTERVAL_MS) return
    lastPushAt = now
    counter += 1
    const notification: PlannerNotification = {
      id: `${kind}-${counter}`,
      kind,
      name,
      createdAt: now,
    }
    set((state) => ({
      notifications: [...state.notifications, notification].slice(-MAX_VISIBLE),
    }))
  },
  dismiss: (id) => set((state) => ({
    notifications: state.notifications.filter((notification) => notification.id !== id),
  })),
  clear: () => set({ notifications: [] }),
}))
