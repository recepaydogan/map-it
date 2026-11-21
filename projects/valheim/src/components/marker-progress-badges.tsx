import { Check, Star } from 'lucide-react'

export function MarkerProgressBadges({ found, favorite }: { found: boolean; favorite: boolean }) {
  if (!found && !favorite) return null
  return <span className="pointer-events-none absolute -right-1 -top-1 flex gap-0.5" aria-hidden="true">
    {found ? <span className="grid size-3.5 place-items-center rounded-full border border-emerald-300/70 bg-zinc-900 text-emerald-300"><Check size={10} strokeWidth={3} /></span> : null}
    {favorite ? <span className="grid size-3.5 place-items-center rounded-full border border-sky-300/70 bg-zinc-900 text-sky-300"><Star size={9} fill="currentColor" /></span> : null}
  </span>
}
