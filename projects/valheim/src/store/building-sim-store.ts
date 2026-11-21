import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_ROCK_SIZE, type PieceKind, type PlacedPiece, type Yaw } from '../lib/building/building-catalog.ts'
import type { MaterialClass } from '../lib/building/support-model.ts'
import type { Vec3 } from '../lib/building/support-solver.ts'

export type BuildTool =
  | { kind: 'place'; prefabName: string }
  | { kind: 'rock'; size: Vec3 }
  | { kind: 'erase' }

const MAX_HISTORY = 60

export type StudioMode = 'sandbox' | 'lessons' | 'blueprints'
export type CameraPreset = 'reset' | 'top' | 'front' | 'iso'

interface BuildingSimState {
  /** The scene being edited (the sandbox, or a lesson/blueprint copy). */
  scene: PlacedPiece[]
  /** The sandbox scene parked while a lesson/blueprint is open. */
  parkedSandbox: PlacedPiece[] | null
  mode: StudioMode
  lessonId: string | null
  blueprintId: string | null
  tool: BuildTool
  material: MaterialClass
  /** Remembered variant per material+kind so switching back keeps the size. */
  variantChoice: Record<string, string>
  yaw: Yaw
  /** Colour every piece by support (false = only the hovered piece, as in the game). */
  colourAll: boolean
  selectedId: string | null
  history: PlacedPiece[][]
  cameraPreset: { preset: CameraPreset; token: number }
  place: (piece: Omit<PlacedPiece, 'id'>) => string
  remove: (id: string) => void
  clear: () => void
  undo: () => void
  setTool: (tool: BuildTool) => void
  setMaterial: (material: MaterialClass) => void
  rememberVariant: (material: MaterialClass, kind: PieceKind, prefabName: string) => void
  rotate: () => void
  setColourAll: (value: boolean) => void
  select: (id: string | null) => void
  setMode: (mode: StudioMode) => void
  requestCamera: (preset: CameraPreset) => void
  openLesson: (lessonId: string, scene: PlacedPiece[]) => void
  resetLesson: (scene: PlacedPiece[]) => void
  openBlueprint: (blueprintId: string, scene: PlacedPiece[]) => void
  applyBlueprintToSandbox: (scene: PlacedPiece[]) => void
  closeGuidedMode: () => void
}

let counter = 0
const nextId = () => {
  counter += 1
  return `p${Date.now().toString(36)}${counter.toString(36)}`
}

const pushHistory = (history: PlacedPiece[][], scene: PlacedPiece[]) =>
  [...history.slice(-(MAX_HISTORY - 1)), scene]

const DEFAULT_TOOL: BuildTool = { kind: 'place', prefabName: 'wood_pole2' }

type PersistedBuildingSim = Pick<BuildingSimState, 'scene' | 'tool' | 'material' | 'variantChoice' | 'colourAll'>

export const useBuildingSimStore = create<BuildingSimState>()(
  persist(
    (set, get) => ({
      scene: [],
      parkedSandbox: null,
      mode: 'sandbox',
      lessonId: null,
      blueprintId: null,
      tool: DEFAULT_TOOL,
      material: 'Wood',
      variantChoice: {},
      yaw: 0,
      colourAll: true,
      selectedId: null,
      history: [],
      cameraPreset: { preset: 'reset', token: 0 },
      place: (piece) => {
        const id = nextId()
        set((state) => ({
          scene: [...state.scene, { ...piece, id }],
          history: pushHistory(state.history, state.scene),
          selectedId: id,
        }))
        return id
      },
      remove: (id) => set((state) => {
        if (!state.scene.some((piece) => piece.id === id)) return state
        return {
          scene: state.scene.filter((piece) => piece.id !== id),
          history: pushHistory(state.history, state.scene),
          selectedId: state.selectedId === id ? null : state.selectedId,
        }
      }),
      clear: () => set((state) => (state.scene.length === 0 ? state : {
        scene: [],
        history: pushHistory(state.history, state.scene),
        selectedId: null,
      })),
      undo: () => set((state) => {
        const previous = state.history[state.history.length - 1]
        if (!previous) return state
        return { scene: previous, history: state.history.slice(0, -1), selectedId: null }
      }),
      setTool: (tool) => set({ tool }),
      setMaterial: (material) => set({ material }),
      rememberVariant: (material, kind, prefabName) => set((state) => ({
        variantChoice: { ...state.variantChoice, [`${material}:${kind}`]: prefabName },
      })),
      rotate: () => set((state) => ({ yaw: ((state.yaw + 1) % 4) as Yaw })),
      setColourAll: (colourAll) => set({ colourAll }),
      select: (selectedId) => set({ selectedId }),
      setMode: (mode) => {
        const currentMode = get().mode
        if (currentMode === mode) return
        if (mode === 'sandbox') {
          get().closeGuidedMode()
        } else {
          set({ mode })
        }
      },
      requestCamera: (preset) => set((state) => ({
        cameraPreset: { preset, token: state.cameraPreset.token + 1 },
      })),
      openLesson: (lessonId, scene) => set((state) => ({
        mode: 'lessons',
        lessonId,
        blueprintId: null,
        parkedSandbox: state.mode === 'sandbox' ? state.scene : state.parkedSandbox,
        scene,
        history: [],
        selectedId: null,
      })),
      resetLesson: (scene) => set({ scene, history: [], selectedId: null }),
      openBlueprint: (blueprintId, scene) => set((state) => ({
        mode: 'blueprints',
        blueprintId,
        lessonId: null,
        parkedSandbox: state.mode === 'sandbox' ? state.scene : state.parkedSandbox,
        scene,
        history: [],
        selectedId: null,
      })),
      applyBlueprintToSandbox: (blueprintScene) => set((state) => ({
        mode: 'sandbox',
        lessonId: null,
        blueprintId: null,
        parkedSandbox: null,
        scene: blueprintScene,
        history: pushHistory(state.history, state.scene),
        selectedId: null,
      })),
      closeGuidedMode: () => {
        const state = get()
        if (state.mode === 'sandbox') return
        set({
          mode: 'sandbox',
          lessonId: null,
          blueprintId: null,
          scene: state.parkedSandbox ?? [],
          parkedSandbox: null,
          history: [],
          selectedId: null,
        })
      },
    }),
    {
      name: 'valheim-companion:building-sim',
      version: 3,
      // Lessons and blueprint previews are transient; only the sandbox is kept.
      partialize: (state): PersistedBuildingSim => ({
        scene: state.mode === 'sandbox' ? state.scene : (state.parkedSandbox ?? []),
        tool: state.tool.kind === 'erase' ? DEFAULT_TOOL : state.tool,
        material: state.material,
        variantChoice: state.variantChoice,
        colourAll: state.colourAll,
      }),
      migrate: (persisted, version): PersistedBuildingSim => {
        if (version < 3) return { scene: [], tool: DEFAULT_TOOL, material: 'Wood', variantChoice: {}, colourAll: true }
        return persisted as PersistedBuildingSim
      },
    },
  ),
)

export const rockTool = (size: Vec3 = DEFAULT_ROCK_SIZE): BuildTool => ({ kind: 'rock', size })

