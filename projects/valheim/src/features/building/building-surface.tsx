import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { placedToSimBody, type PlacedPiece } from '../../lib/building/building-catalog.ts'
import { solveSupport, type SimBody } from '../../lib/building/support-solver.ts'
import { useBuildingSimStore, type CameraPreset } from '../../store/building-sim-store.ts'
import { BlueprintsModal } from './components/blueprints-modal.tsx'
import { BuildingTelemetry } from './components/building-telemetry.tsx'
import { BuildingToolbar } from './components/building-toolbar.tsx'
import { ControlsHud } from './components/controls-hud.tsx'
import { HammerDock } from './components/hammer-dock.tsx'
import { LessonStrip } from './components/lesson-strip.tsx'
import { ReferenceOverlay } from './components/reference-overlay.tsx'
import { useBuildingCatalog } from './hooks/use-building-catalog.ts'
import { buildLessonScene, lessonById, LESSONS } from './lessons.ts'
import { buildBlueprintScene, blueprintById, type BlueprintDefinition } from './blueprints.ts'
import { BuildScene, type FitRequest } from './scene/build-scene.tsx'

/**
 * The Building tab: an immersive Valheim architect studio and 3D structural
 * integrity sandbox with in-game hammer build dock, live telemetry, BOM calculator,
 * blueprints, and Master Builder academy lessons.
 */
export function BuildingSurface() {
  const { t } = useTranslation()
  const { catalog, loading, error } = useBuildingCatalog()
  const scene = useBuildingSimStore((state) => state.scene)
  const mode = useBuildingSimStore((state) => state.mode)
  const lessonId = useBuildingSimStore((state) => state.lessonId)
  const blueprintId = useBuildingSimStore((state) => state.blueprintId)
  const tool = useBuildingSimStore((state) => state.tool)
  const material = useBuildingSimStore((state) => state.material)
  const yaw = useBuildingSimStore((state) => state.yaw)
  const colourAll = useBuildingSimStore((state) => state.colourAll)
  const selectedId = useBuildingSimStore((state) => state.selectedId)
  const historyLength = useBuildingSimStore((state) => state.history.length)
  const cameraPreset = useBuildingSimStore((state) => state.cameraPreset)
  const store = useBuildingSimStore

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [fit, setFit] = useState<FitRequest>({ token: 0 })
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [blueprintsModalOpen, setBlueprintsModalOpen] = useState(false)

  const requestFit = useCallback(() => setFit((current) => ({ token: current.token + 1 })), [])

  // Open the first lesson if entering lessons mode for the first time
  useEffect(() => {
    if (!catalog) return
    if (store.getState().mode === 'lessons' && store.getState().lessonId === null) {
      const lesson = LESSONS[0]
      store.getState().openLesson(lesson.id, buildLessonScene(lesson, catalog))
      queueMicrotask(() => requestFit())
    }
  }, [catalog, mode, requestFit, store])

  const openLesson = useCallback(
    (id: string) => {
      if (!catalog) return
      const lesson = lessonById(id)
      if (!lesson) return
      store.getState().openLesson(lesson.id, buildLessonScene(lesson, catalog))
      requestFit()
    },
    [catalog, requestFit, store]
  )

  const openSandbox = useCallback(() => {
    store.getState().setMode('sandbox')
    requestFit()
  }, [requestFit, store])

  const resetLesson = useCallback(() => {
    const id = store.getState().lessonId
    const lesson = id ? lessonById(id) : null
    if (!lesson || !catalog) return
    store.getState().resetLesson(buildLessonScene(lesson, catalog))
    requestFit()
  }, [catalog, requestFit, store])

  const handlePreviewBlueprint = useCallback(
    (id: string) => {
      if (!catalog) return
      const bp = blueprintById(id)
      if (!bp) return
      store.getState().openBlueprint(bp.id, buildBlueprintScene(bp, catalog))
      requestFit()
    },
    [catalog, requestFit, store]
  )

  const handleApplyBlueprintToSandbox = useCallback(
    (blueprint: BlueprintDefinition) => {
      if (!catalog) return
      const newScene = buildBlueprintScene(blueprint, catalog)
      store.getState().applyBlueprintToSandbox(newScene)
      requestFit()
    },
    [catalog, requestFit, store]
  )

  const bodies = useMemo(() => {
    const map = new Map<string, SimBody>()
    if (!catalog) return map
    for (const placed of scene) {
      const body = placedToSimBody(placed, catalog)
      if (body) map.set(placed.id, body)
    }
    return map
  }, [catalog, scene])

  const solution = useMemo(() => solveSupport([...bodies.values()]), [bodies])

  const handlePlace = useCallback((piece: Omit<PlacedPiece, 'id'>) => {
    store.getState().place(piece)
  }, [store])

  const handleRemove = useCallback((id: string) => {
    store.getState().remove(id)
  }, [store])

  const handleHover = useCallback((id: string | null) => {
    setHoveredId(id)
  }, [])

  const handleSelect = useCallback((id: string | null) => {
    store.getState().select(id)
  }, [store])

  const handleCameraPreset = useCallback(
    (preset: CameraPreset) => {
      if (preset === 'reset') {
        requestFit()
      } else {
        store.getState().requestCamera(preset)
      }
    },
    [requestFit, store]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return
      const state = store.getState()
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        state.undo()
      } else if (event.key.toLowerCase() === 'r') {
        state.rotate()
      } else if (event.key.toLowerCase() === 'f') {
        requestFit()
      } else if (event.key.toLowerCase() === 'c') {
        state.setColourAll(!state.colourAll)
      } else if (event.key === 'Escape') {
        state.select(null)
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedId) {
        state.remove(state.selectedId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [requestFit, store])

  if (loading) {
    return (
      <div className="grid h-full place-items-center gap-2 bg-[var(--background)] text-[var(--muted)]">
        <LoaderCircle size={22} className="animate-spin text-[var(--accent-text)]" aria-hidden="true" />
        <p className="text-xs font-semibold">{t('common.loading', { defaultValue: 'Loading building catalog...' })}</p>
      </div>
    )
  }

  if (error || !catalog) {
    return (
      <div className="grid h-full place-items-center gap-2 bg-[var(--background)] p-8 text-center">
        <TriangleAlert size={26} className="text-amber-300" aria-hidden="true" />
        <p className="text-[14px] font-bold text-[var(--text)]">{t('building.empty.catalogErrorTitle')}</p>
        <p className="max-w-md text-[12px] leading-relaxed text-[var(--muted)]">{t('building.empty.catalogErrorDescription')}</p>
      </div>
    )
  }

  const focusId = hoveredId ?? selectedId
  const focusPiece = focusId ? scene.find((piece) => piece.id === focusId) ?? null : null
  const focusBody = focusPiece ? bodies.get(focusPiece.id) ?? null : null

  return (
    <main className="relative h-full min-h-0 select-none overflow-hidden bg-[var(--background)]">
      {/* 3D Canvas Viewport */}
      <BuildScene
        catalog={catalog}
        scene={scene}
        bodies={bodies}
        solution={solution}
        tool={tool}
        yaw={yaw}
        colourAll={colourAll}
        hoveredId={hoveredId}
        selectedId={selectedId}
        fit={fit}
        cameraPreset={cameraPreset}
        onHover={handleHover}
        onPlace={handlePlace}
        onRemove={handleRemove}
        onSelect={handleSelect}
      />

      {/* Top Architect Studio Ribbon */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-center p-3">
        <BuildingToolbar
          mode={mode}
          colourAll={colourAll}
          canUndo={historyLength > 0}
          canClear={scene.length > 0}
          scenePieceCount={scene.length}
          onModeChange={(nextMode) => {
            if (nextMode === 'blueprints') {
              setBlueprintsModalOpen(true)
            } else if (nextMode === 'lessons') {
              store.getState().setMode('lessons')
              if (lessonId === null) {
                openLesson(LESSONS[0].id)
              }
            } else {
              openSandbox()
            }
          }}
          onColourAll={(value) => store.getState().setColourAll(value)}
          onUndo={() => store.getState().undo()}
          onClear={() => store.getState().clear()}
          onCameraPreset={handleCameraPreset}
          onReference={() => setReferenceOpen(true)}
          onOpenBlueprints={() => setBlueprintsModalOpen(true)}
        />
      </div>

      {/* Right Structural Telemetry & Bill of Materials (BOM) HUD */}
      <div className="pointer-events-none absolute right-3 top-14 bottom-3 flex flex-col items-end justify-start">
        <BuildingTelemetry
          catalog={catalog}
          scene={scene}
          solution={solution}
          focusPiece={focusPiece}
          focusBody={focusBody}
          onSelectPiece={handleSelect}
        />
      </div>

      {/* Bottom Center: Valheim Hammer Build Dock / Academy Lesson Card */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 px-3">
        {mode === 'lessons' ? (
          <LessonStrip
            activeLessonId={lessonId}
            onLesson={openLesson}
            onSandbox={openSandbox}
            onReset={resetLesson}
          />
        ) : (
          <HammerDock
            catalog={catalog}
            material={material}
            tool={tool}
            yaw={yaw}
            onMaterial={(next) => store.getState().setMaterial(next)}
            onTool={(next) => store.getState().setTool(next)}
            onRotate={() => store.getState().rotate()}
          />
        )}
      </div>

      {/* Bottom Left: In-game Controls HUD Legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex items-end">
        <ControlsHud />
      </div>

      {/* Blueprints Modal */}
      {blueprintsModalOpen ? (
        <BlueprintsModal
          activeBlueprintId={blueprintId}
          onClose={() => setBlueprintsModalOpen(false)}
          onPreviewBlueprint={handlePreviewBlueprint}
          onApplyToSandbox={handleApplyBlueprintToSandbox}
        />
      ) : null}

      {/* Reference Guide Matrix Modal */}
      {referenceOpen ? <ReferenceOverlay onClose={() => setReferenceOpen(false)} /> : null}
    </main>
  )
}
