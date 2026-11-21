import type { PlanCalculation } from '../../lib/crafting/recipe-types.ts'
import { sanitizePlan, type CraftingPlan } from '../../store/crafting-planner-store.ts'

export const PLAN_TRANSFER_VERSION = 1

interface PlanTransferFile {
  kind: 'valheim-companion-plan'
  version: number
  plan: Pick<CraftingPlan, 'name' | 'targets' | 'manualOwned' | 'recipeChoices'>
}

/** Compact, prefab-keyed export so a plan survives localization and app updates. */
export function exportPlan(plan: CraftingPlan): string {
  const payload: PlanTransferFile = {
    kind: 'valheim-companion-plan',
    version: PLAN_TRANSFER_VERSION,
    plan: {
      name: plan.name,
      targets: plan.targets,
      manualOwned: plan.manualOwned,
      recipeChoices: plan.recipeChoices,
    },
  }
  return JSON.stringify(payload, null, 2)
}

export type PlanImportResult =
  | { ok: true; plan: CraftingPlan }
  | { ok: false; reason: 'invalid-json' | 'wrong-format' | 'unsupported-version' | 'empty' }

export function importPlanFromText(text: string): PlanImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'wrong-format' }
  const payload = parsed as Partial<PlanTransferFile>
  if (payload.kind !== 'valheim-companion-plan') return { ok: false, reason: 'wrong-format' }
  if (typeof payload.version !== 'number' || payload.version > PLAN_TRANSFER_VERSION) {
    return { ok: false, reason: 'unsupported-version' }
  }
  if (!payload.plan || !Array.isArray(payload.plan.targets) || payload.plan.targets.length === 0) {
    return { ok: false, reason: 'empty' }
  }
  return { ok: true, plan: sanitizePlan({ ...payload.plan, id: undefined }) }
}

/**
 * Plain-text collection list for sharing outside the app. Uses localized names
 * because it is meant to be read by a person, never re-imported.
 */
export function formatCollectionSummary(
  planName: string,
  calculation: PlanCalculation,
  labels: { missing: string; nothingMissing: string },
): string {
  const missing = calculation.materials.filter((material) => material.missing > 0)
  const lines = [`${planName} — ${labels.missing}`]
  if (missing.length === 0) {
    lines.push(labels.nothingMissing)
    return lines.join('\n')
  }
  for (const material of missing) {
    lines.push(`- ${material.item?.name ?? material.prefabName} ×${material.missing}`)
  }
  return lines.join('\n')
}
