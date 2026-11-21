import { Compass, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ExploredMap } from '../lib/valheim/explored-map'
import { hasSeenExplorationIntro, markExplorationIntroSeen, smallPersonalExploration, type SmallExploration } from '../lib/valheim/personal-exploration-intro'
import { readMapCamera } from '../lib/map-camera-persistence'

/** Keyed by character/world: live updates can never keep pulling the camera back. */
export function PersonalExplorationGuide({ context, cameraStorageKey, exploration, interacted, filtersOpen, onFocus }: {
  context: string
  cameraStorageKey: string | undefined
  exploration: ExploredMap | null
  interacted: boolean
  filtersOpen: boolean
  onFocus: (summary: SmallExploration) => boolean
}) {
  const { t } = useTranslation()
  const [finished, setFinished] = useState(() => hasSeenExplorationIntro(context) || Boolean(cameraStorageKey && readMapCamera(cameraStorageKey)))
  const [notice, setNotice] = useState(false)
  const summary = useMemo(() => smallPersonalExploration(exploration), [exploration])
  useEffect(() => {
    if (finished || (!interacted && !summary)) return
    const timer = window.setTimeout(() => {
      if (!interacted && summary && !onFocus(summary)) return
      markExplorationIntroSeen(context)
      setFinished(true)
      if (!interacted) setNotice(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [context, finished, interacted, summary, onFocus])
  if (!notice || !summary) return null
  return <div data-personal-exploration-hint role="status"
    className={`pointer-events-none absolute right-14 top-24 z-20 flex justify-center ${filtersOpen ? 'left-[336px]' : 'left-14'}`}>
    <div className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--overlay-background)] py-2 pl-3 pr-1.5 text-xs text-[var(--text)] shadow-lg">
      <Compass size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--accent-text)]" />
      <p className="leading-relaxed">{t('map.spoilers.newCharacterHint')}</p>
      <button type="button" onClick={() => setNotice(false)} aria-label={t('common.close')}
        className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><X size={14} aria-hidden="true" /></button>
    </div>
  </div>
}
