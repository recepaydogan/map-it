import { Pin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCraftOverlayStore } from '../../../store/craft-overlay-store'
import { useCraftPreviewStore } from '../../../store/craft-preview-store'
import { useCraftingPlannerStore } from '../../../store/crafting-planner-store'

export function TrackCraftButton({ planId }: { planId: string }) {
  const { t } = useTranslation()
  const track = async () => {
    const plan = useCraftingPlannerStore.getState().plans.find((entry) => entry.id === planId)
    if (plan) {
      await useCraftPreviewStore.persist.rehydrate()
      useCraftPreviewStore.getState().trackPlan(planId, plan.targets)
    }
    useCraftOverlayStore.getState().setPlanId(planId)
  }
  return <div>
    <button type="button" onClick={() => void track()} className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--accent)] bg-[var(--accent-soft)] px-3 text-[11px] font-semibold text-[var(--accent-text)]">
      <Pin size={13} aria-hidden="true" />{t('planner.tracker.pin')}
    </button>
  </div>
}
