import { Check, CheckCircle2, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { useMarkerProgress } from '../hooks/use-marker-progress'
import { useMarkerProgressStore } from '../store/marker-progress-store'

export function MarkerProgressActions({ worldKey, markerId }: { worldKey: string; markerId: string }) {
  const { t } = useTranslation()
  const progress = useMarkerProgress(worldKey)
  const toggleFound = useMarkerProgressStore(state => state.toggleFound)
  const toggleFavorite = useMarkerProgressStore(state => state.toggleFavorite)
  const found = progress.found.has(markerId)
  const favorite = progress.favorites.has(markerId)
  const buttonClass = (active: boolean) => cn(
    'flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-2 text-xs font-semibold leading-4 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white',
    active ? 'border-[var(--border-strong)] bg-white/10 text-[var(--text)]' : 'border-[var(--border)] bg-transparent text-[var(--text)]',
  )
  return <div className="flex shrink-0 gap-2 border-b border-[var(--border)] px-4 py-3">
    <button type="button" onClick={() => toggleFound(worldKey, markerId)} aria-pressed={found}
      className={buttonClass(found)}>
      {found ? <CheckCircle2 size={15} className="shrink-0" aria-hidden="true" /> : <Check size={15} className="shrink-0" aria-hidden="true" />}
      <span>{found ? t('markerProgress.found') : t('markerProgress.markAsFound')}</span>
    </button>
    <button type="button" onClick={() => toggleFavorite(worldKey, markerId)} aria-pressed={favorite}
      aria-label={favorite ? t('markerProgress.removeFavorite') : t('markerProgress.addFavorite')}
      title={favorite ? t('markerProgress.removeFavorite') : t('markerProgress.addFavorite')}
      className={buttonClass(favorite)}>
      <Star size={15} className="shrink-0" fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
      <span>{favorite ? t('markerProgress.favorited') : t('markerProgress.favorite')}</span>
    </button>
  </div>
}
