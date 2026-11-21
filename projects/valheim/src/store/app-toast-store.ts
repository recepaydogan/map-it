import { create } from 'zustand'

export type AppToastKind = 'tracker-restart-required' | 'tracker-failed'

export interface AppToast {
  id: string
  kind: AppToastKind
  /** Optional detail passed to the translation (e.g. an error reason). */
  detail?: string
  /** Sticky toasts stay until dismissed or explicitly cleared by kind. */
  sticky: boolean
  createdAt: number
}

interface AppToastState {
  toasts: AppToast[]
  push: (kind: AppToastKind, options?: { detail?: string; sticky?: boolean }) => void
  dismiss: (id: string) => void
  clearKind: (kind: AppToastKind) => void
}

let counter = 0

/**
 * App-wide, session-only toasts (tracker install state, restart hints). One
 * toast per kind at a time so a retry loop never stacks duplicates.
 */
export const useAppToastStore = create<AppToastState>()((set) => ({
  toasts: [],
  push: (kind, options = {}) => {
    counter += 1
    set((state) => ({
      toasts: [
        ...state.toasts.filter((toast) => toast.kind !== kind),
        {
          id: `${kind}-${counter}`,
          kind,
          detail: options.detail,
          sticky: options.sticky ?? false,
          createdAt: Date.now(),
        },
      ].slice(-3),
    }))
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  clearKind: (kind) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.kind !== kind) })),
}))
