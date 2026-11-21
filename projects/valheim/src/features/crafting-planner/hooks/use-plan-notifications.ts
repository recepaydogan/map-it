import { useEffect, useRef } from 'react'
import type { PlanCalculation } from '../../../lib/crafting/recipe-types.ts'
import type { PlannerNotificationPreferences } from '../../../store/crafting-planner-store.ts'
import { usePlannerNotificationStore } from '../../../store/planner-notification-store.ts'

interface PlanSnapshot {
  planId: string
  completedMaterials: Set<string>
  readyTargets: Set<string>
  planComplete: boolean
}

const snapshotOf = (planId: string, calculation: PlanCalculation): PlanSnapshot => ({
  planId,
  completedMaterials: new Set(
    calculation.materials.filter((material) => material.missing === 0).map((material) => material.prefabName),
  ),
  readyTargets: new Set(
    calculation.targets.filter((target) => target.ready && !target.manuallyCompleted).map((target) => target.targetId),
  ),
  planComplete: calculation.totals.requiredUnits > 0 && calculation.totals.missingUnits === 0,
})

/**
 * Turns plan state changes into restrained, rate-limited notifications. The
 * queue lives in an external store so the effect only pushes to it and never
 * schedules a render of its own.
 */
export function usePlanNotifications(
  planId: string | null,
  calculation: PlanCalculation | null,
  preferences: PlannerNotificationPreferences,
  targetNameFor: (targetId: string) => string,
  materialNameFor: (prefabName: string) => string,
) {
  const previous = useRef<PlanSnapshot | null>(null)

  useEffect(() => {
    if (!planId || !calculation) {
      previous.current = null
      return
    }
    const next = snapshotOf(planId, calculation)
    const before = previous.current
    previous.current = next
    // A different plan, or the first calculation for this one, is not progress.
    if (!before || before.planId !== planId) return

    const { push } = usePlannerNotificationStore.getState()
    if (preferences.planCompleted && next.planComplete && !before.planComplete) {
      push('plan-completed', '')
      return
    }
    if (preferences.targetReady) {
      for (const targetId of next.readyTargets) {
        if (before.readyTargets.has(targetId)) continue
        push('target-ready', targetNameFor(targetId))
        break
      }
    }
    if (preferences.materialCompleted) {
      for (const prefabName of next.completedMaterials) {
        if (before.completedMaterials.has(prefabName)) continue
        push('material-completed', materialNameFor(prefabName))
        break
      }
    }
  }, [calculation, materialNameFor, planId, preferences, targetNameFor])
}
