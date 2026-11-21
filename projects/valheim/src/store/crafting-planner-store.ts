import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { MAX_TARGET_QUANTITY, type PlanTarget } from '../lib/crafting/recipe-types.ts'

export const PLANNER_SCHEMA_VERSION = 2

export type ChecklistSort =
  | 'recommended'
  | 'mostMissing'
  | 'closestToCompletion'
  | 'sourceType'
  | 'alphabetical'

export type ChecklistFilter =
  | 'all'
  | 'missing'
  | 'completed'
  | 'craftable'
  | 'raw'
  | 'manual'

export type ChecklistTeleportFilter = 'any' | 'teleportable' | 'nonTeleportable'

export type PlannerView = 'checklist' | 'breakdown'

export interface ChecklistPreferences {
  sort: ChecklistSort
  filter: ChecklistFilter
  teleport: ChecklistTeleportFilter
  view: PlannerView
  showIntermediates: boolean
}

export interface PlannerNotificationPreferences {
  materialCompleted: boolean
  targetReady: boolean
  planCompleted: boolean
}

export interface CraftingPlan {
  id: string
  name: string
  targets: PlanTarget[]
  /** Manually entered owned amounts, keyed by lowercased prefab name. */
  manualOwned: Record<string, number>
  /** Recipe preference for intermediates, keyed by lowercased prefab name. */
  recipeChoices: Record<string, string>
  archived: boolean
  createdAt: number
  updatedAt: number
}

export interface CraftingPlannerState {
  schemaVersion: number
  plans: CraftingPlan[]
  activePlanId: string | null
  checklist: ChecklistPreferences
  notifications: PlannerNotificationPreferences
  createPlan: (name?: string) => string
  renamePlan: (planId: string, name: string) => void
  duplicatePlan: (planId: string) => string | null
  setPlanArchived: (planId: string, archived: boolean) => void
  deletePlan: (planId: string) => void
  setActivePlan: (planId: string | null) => void
  addTarget: (planId: string, target: Omit<PlanTarget, 'id'>) => string
  updateTarget: (planId: string, targetId: string, changes: Partial<Omit<PlanTarget, 'id'>>) => void
  removeTarget: (planId: string, targetId: string) => void
  moveTarget: (planId: string, targetId: string, direction: -1 | 1) => void
  setManualOwned: (planId: string, prefabName: string, amount: number) => void
  resetManualProgress: (planId: string) => void
  setRecipeChoice: (planId: string, prefabName: string, recipeId: string | null) => void
  setChecklistPreferences: (changes: Partial<ChecklistPreferences>) => void
  setNotificationPreferences: (changes: Partial<PlannerNotificationPreferences>) => void
  importPlan: (plan: CraftingPlan) => string
}

export const DEFAULT_CHECKLIST_PREFERENCES: ChecklistPreferences = {
  sort: 'recommended',
  filter: 'missing',
  teleport: 'any',
  view: 'checklist',
  showIntermediates: false,
}

export const DEFAULT_NOTIFICATION_PREFERENCES: PlannerNotificationPreferences = {
  materialCompleted: false,
  targetReady: true,
  planCompleted: true,
}

let identityCounter = 0
const createId = (prefix: string) => {
  identityCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${identityCounter.toString(36)}`
}

const clampAmount = (value: number, maximum: number) => {
  if (!Number.isFinite(value)) return 0
  return Math.min(maximum, Math.max(0, Math.floor(value)))
}

/** Prefab identity is the persistence key; localized names are display-only. */
const normalizePrefabKey = (prefabName: string) => prefabName.trim().toLowerCase()

export const sanitizeTarget = (target: Partial<PlanTarget> & { prefabName: string }): PlanTarget => ({
  id: typeof target.id === 'string' && target.id ? target.id : createId('target'),
  prefabName: target.prefabName,
  quantity: Math.min(MAX_TARGET_QUANTITY, Math.max(1, Math.floor(Number(target.quantity) || 1))),
  currentQuality: Math.max(0, Math.floor(Number(target.currentQuality) || 0)),
  targetQuality: Math.max(1, Math.floor(Number(target.targetQuality) || 1)),
  recipeId: typeof target.recipeId === 'string' && target.recipeId ? target.recipeId : null,
  expandIntermediates: target.expandIntermediates !== false,
  note: typeof target.note === 'string' ? target.note.slice(0, 280) : '',
  completed: target.completed === true,
})

export type PlanDraft = Partial<Omit<CraftingPlan, 'targets'>> & {
  targets?: Array<Partial<PlanTarget> & { prefabName: string }>
}

export const sanitizePlan = (plan: PlanDraft): CraftingPlan => {
  const timestamp = Date.now()
  const manualOwned: Record<string, number> = {}
  for (const [prefabName, amount] of Object.entries(plan.manualOwned ?? {})) {
    const key = normalizePrefabKey(prefabName)
    if (!key) continue
    const value = clampAmount(Number(amount), 9_999_999)
    if (value > 0) manualOwned[key] = value
  }
  const recipeChoices: Record<string, string> = {}
  for (const [prefabName, recipeId] of Object.entries(plan.recipeChoices ?? {})) {
    const key = normalizePrefabKey(prefabName)
    if (key && typeof recipeId === 'string' && recipeId) recipeChoices[key] = recipeId
  }
  return {
    id: typeof plan.id === 'string' && plan.id ? plan.id : createId('plan'),
    name: (typeof plan.name === 'string' && plan.name.trim() ? plan.name : 'Plan').slice(0, 80),
    targets: (plan.targets ?? [])
      .filter((target) => Boolean(target?.prefabName))
      .map(sanitizeTarget),
    manualOwned,
    recipeChoices,
    archived: plan.archived === true,
    createdAt: Number.isFinite(plan.createdAt) ? Number(plan.createdAt) : timestamp,
    updatedAt: Number.isFinite(plan.updatedAt) ? Number(plan.updatedAt) : timestamp,
  }
}

const touch = (plan: CraftingPlan): CraftingPlan => ({ ...plan, updatedAt: Date.now() })

export const useCraftingPlannerStore = create<CraftingPlannerState>()(
  persist(
    (set, get) => {
      const updatePlan = (planId: string, update: (plan: CraftingPlan) => CraftingPlan) => {
        set((state) => ({
          plans: state.plans.map((plan) => (plan.id === planId ? touch(update(plan)) : plan)),
        }))
      }

      return {
        schemaVersion: PLANNER_SCHEMA_VERSION,
        plans: [],
        activePlanId: null,
        checklist: DEFAULT_CHECKLIST_PREFERENCES,
        notifications: DEFAULT_NOTIFICATION_PREFERENCES,

        createPlan: (name) => {
          const plan = sanitizePlan({ name: name?.trim() || undefined })
          set((state) => ({ plans: [...state.plans, plan], activePlanId: plan.id }))
          return plan.id
        },
        renamePlan: (planId, name) => updatePlan(planId, (plan) => ({
          ...plan,
          name: name.trim().slice(0, 80) || plan.name,
        })),
        duplicatePlan: (planId) => {
          const source = get().plans.find((plan) => plan.id === planId)
          if (!source) return null
          const copy = sanitizePlan({
            ...source,
            id: undefined,
            name: `${source.name} (2)`,
            archived: false,
            targets: source.targets.map((target) => ({ ...target, id: undefined })),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
          set((state) => ({ plans: [...state.plans, copy], activePlanId: copy.id }))
          return copy.id
        },
        setPlanArchived: (planId, archived) => {
          updatePlan(planId, (plan) => ({ ...plan, archived }))
          set((state) => (archived && state.activePlanId === planId
            ? { activePlanId: state.plans.find((plan) => plan.id !== planId && !plan.archived)?.id ?? null }
            : {}))
        },
        deletePlan: (planId) => set((state) => {
          const plans = state.plans.filter((plan) => plan.id !== planId)
          return {
            plans,
            activePlanId: state.activePlanId === planId
              ? plans.find((plan) => !plan.archived)?.id ?? null
              : state.activePlanId,
          }
        }),
        setActivePlan: (planId) => set({ activePlanId: planId }),

        addTarget: (planId, target) => {
          const sanitized = sanitizeTarget(target)
          updatePlan(planId, (plan) => ({ ...plan, targets: [...plan.targets, sanitized] }))
          return sanitized.id
        },
        updateTarget: (planId, targetId, changes) => updatePlan(planId, (plan) => ({
          ...plan,
          targets: plan.targets.map((target) => (target.id === targetId
            ? sanitizeTarget({ ...target, ...changes, id: target.id })
            : target)),
        })),
        removeTarget: (planId, targetId) => updatePlan(planId, (plan) => ({
          ...plan,
          targets: plan.targets.filter((target) => target.id !== targetId),
        })),
        moveTarget: (planId, targetId, direction) => updatePlan(planId, (plan) => {
          const index = plan.targets.findIndex((target) => target.id === targetId)
          const nextIndex = index + direction
          if (index < 0 || nextIndex < 0 || nextIndex >= plan.targets.length) return plan
          const targets = [...plan.targets]
          const [moved] = targets.splice(index, 1)
          targets.splice(nextIndex, 0, moved)
          return { ...plan, targets }
        }),

        setManualOwned: (planId, prefabName, amount) => updatePlan(planId, (plan) => {
          const key = normalizePrefabKey(prefabName)
          const manualOwned = { ...plan.manualOwned }
          const value = clampAmount(amount, 9_999_999)
          if (value > 0) manualOwned[key] = value
          else delete manualOwned[key]
          return { ...plan, manualOwned }
        }),
        resetManualProgress: (planId) => updatePlan(planId, (plan) => ({
          ...plan,
          manualOwned: {},
          targets: plan.targets.map((target) => ({ ...target, completed: false })),
        })),
        setRecipeChoice: (planId, prefabName, recipeId) => updatePlan(planId, (plan) => {
          const key = normalizePrefabKey(prefabName)
          const recipeChoices = { ...plan.recipeChoices }
          if (recipeId) recipeChoices[key] = recipeId
          else delete recipeChoices[key]
          return { ...plan, recipeChoices }
        }),

        setChecklistPreferences: (changes) => set((state) => ({
          checklist: { ...state.checklist, ...changes },
        })),
        setNotificationPreferences: (changes) => set((state) => ({
          notifications: { ...state.notifications, ...changes },
        })),

        importPlan: (plan) => {
          const imported = sanitizePlan({ ...plan, id: undefined })
          set((state) => ({ plans: [...state.plans, imported], activePlanId: imported.id }))
          return imported.id
        },
      }
    },
    {
      name: 'valheim-companion:crafting-planner',
      version: PLANNER_SCHEMA_VERSION,
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        plans: state.plans,
        activePlanId: state.activePlanId,
        checklist: state.checklist,
        notifications: state.notifications,
      }),
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<CraftingPlannerState>
        // Version 0 is anything written before the schema was versioned. Plans
        // are keyed by prefab identity, so re-sanitizing is always safe.
        if (version < PLANNER_SCHEMA_VERSION || !Array.isArray(state.plans)) {
          // Version 2 made a craft a single item. Old multi-target plans are
          // split into one craft per target so nothing becomes invisible.
          const plans = (state.plans ?? []).map(sanitizePlan).flatMap((plan) =>
            plan.targets.length <= 1
              ? [plan]
              : plan.targets.map((target, index) => sanitizePlan({
                ...plan,
                id: index === 0 ? plan.id : undefined,
                targets: [target],
              })))
          return {
            ...state,
            schemaVersion: PLANNER_SCHEMA_VERSION,
            plans,
            checklist: { ...DEFAULT_CHECKLIST_PREFERENCES, ...(state.checklist ?? {}) },
            notifications: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(state.notifications ?? {}) },
          } as CraftingPlannerState
        }
        return state as CraftingPlannerState
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // The surface expects at least one craft, so a first run starts with an
        // empty one instead of a "create" empty state.
        if (state.plans.length === 0) {
          const plan = sanitizePlan({ name: 'New craft' })
          state.plans = [plan]
          state.activePlanId = plan.id
          return
        }
        // A plan may have been deleted in another window before this one loaded.
        if (state.activePlanId && !state.plans.some((plan) => plan.id === state.activePlanId)) {
          state.activePlanId = state.plans.find((plan) => !plan.archived)?.id ?? null
        }
      },
    },
  ),
)

export const selectActivePlan = (state: CraftingPlannerState): CraftingPlan | null =>
  state.plans.find((plan) => plan.id === state.activePlanId) ?? null
