import { create } from 'zustand'

export type PlannerMapSourceAction =
  | 'pick' | 'mine' | 'chop' | 'break' | 'hunt' | 'defeat' | 'buy' | 'loot' | 'fish'

export interface PlannerMapSourcePoint {
  x: number
  z: number
  /** Unique navigation request; forces the map to honour repeated target changes. */
  focusId?: string
  /** Optional camera zoom for a target that needs to frame more than one point. */
  focusZoom?: number
  /** Standing world object at this spot (e.g. RaspberryBush); absent for plain focus points. */
  nodePrefab?: string
  kind?: string
  status?: 'present' | 'partial' | 'respawning'
  /** Ready-made tooltip text (e.g. "Chest · 24 Iron"); overrides the derived label. */
  label?: string
  /** Tracked chest this point stands for, so the map can ring that chest. */
  containerId?: string
}

/** What the player has to do at the shown sources, plus what they get. */
export interface PlannerMapSourceContext {
  action: PlannerMapSourceAction
  /** Localized node/creature/location name (e.g. "Copper deposit", "Greydwarf"). */
  subject: string
  /** Localized item name that drops. */
  itemName: string
  amountMin?: number
  amountMax?: number
  chance?: number
  /** Pickaxe/axe tier needed for mine/chop/break (0 = any). */
  minToolTier?: number
  /** Number of confirmed standing spots (from the world save). */
  confirmedCount?: number
}

export interface PlannerMapSourceRequest {
  planId: string
  /** Localized label describing what is being shown, e.g. the material name. */
  label: string
  materialPrefabs: string[]
  locationPrefabs: string[]
  characterPrefabs: string[]
  /** Exact world positions confirmed by the save (standing resource nodes). */
  points: PlannerMapSourcePoint[]
  /** Where the camera should travel when the map opens. */
  focus: PlannerMapSourcePoint | null
  context: PlannerMapSourceContext | null
}

interface PlannerMapSourceState extends PlannerMapSourceRequest {
  active: boolean
  show: (request: PlannerMapSourceRequest) => void
  clear: () => void
}

const emptyRequest: PlannerMapSourceRequest = {
  planId: '',
  label: '',
  materialPrefabs: [],
  locationPrefabs: [],
  characterPrefabs: [],
  points: [],
  focus: null,
  context: null,
}

/**
 * Planner source mode is deliberately session-only. It temporarily overrides
 * which markers the map draws without ever touching the persisted map filters,
 * so leaving the mode restores exactly what the player had configured.
 */
export const usePlannerMapSourceStore = create<PlannerMapSourceState>()((set) => ({
  ...emptyRequest,
  active: false,
  show: (request) => set({ ...request, active: true }),
  clear: () => set({ ...emptyRequest, active: false }),
}))
