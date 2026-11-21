import { Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { useWhatsNewReadState } from './use-whats-new-read-state'
import { WHATS_NEW_VERSION } from './whats-new-release'

export function WhatsNewControl({ active, onNavigate }: { active: boolean; onNavigate: () => void }) {
  const { t } = useTranslation()
  const { unread, markRead } = useWhatsNewReadState(WHATS_NEW_VERSION)

  return (
    <button
      type="button"
      data-ow-no-drag
      onClick={() => { markRead(); onNavigate() }}
      aria-label={unread ? t('whatsNew.unread', { version: WHATS_NEW_VERSION }) : t('whatsNew.title')}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap px-2.5 text-[12.5px] font-medium transition-colors outline-none focus-visible:bg-[var(--accent-soft)]',
        active ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]' : 'text-white/75 hover:bg-white/8 hover:text-white',
      )}
    >
      <Bell size={15} className="shrink-0" aria-hidden="true" />
      <span>{t('whatsNew.title')}</span>
      {unread && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />}
    </button>
  )
}
