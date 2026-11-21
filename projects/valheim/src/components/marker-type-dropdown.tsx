import { Check, ChevronDown } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

interface Option { id: string; label: string }

export function MarkerTypeDropdown({ label, options, value, onChange }: {
  label: string
  options: Option[]
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 240 })
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const selectedIndex = Math.max(0, options.findIndex((option) => option.id === value))

  useLayoutEffect(() => {
    if (!open) return
    const rect = trigger.current?.getBoundingClientRect()
    if (!rect) return
    const below = window.innerHeight - rect.bottom - 12
    const above = rect.top - 12
    const height = Math.min(240, Math.max(100, Math.max(below, above)))
    setPosition({ left: rect.left, top: below >= Math.min(240, options.length * 36 + 8) || below >= above
      ? rect.bottom + 4 : rect.top - height - 4, width: rect.width, maxHeight: height })
    const closeOutside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnScroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('resize', closeOnScroll)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('resize', closeOnScroll)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [open, options.length])

  const choose = (id: string) => { onChange(id); setOpen(false); trigger.current?.focus() }
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'Escape') { setOpen(false); return }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) choose(options[selectedIndex].id)
      else setOpen(true)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      if (!open) { setOpen(true); return }
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : (selectedIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
      onChange(options[next].id)
    }
  }

  return <>
    <button ref={trigger} type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => setOpen((current) => !current)} onKeyDown={onKeyDown}
      className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2.5 py-2 text-left text-[12px] text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
      <span className="truncate">{options[selectedIndex]?.label}</span><ChevronDown size={15} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={menu} id={menuId} role="listbox" aria-label={label}
      className="fixed z-[1000] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] p-1 shadow-2xl shadow-black/60"
      style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}>
      {options.map((option) => <button key={option.id} type="button" role="option" aria-selected={option.id === value}
        onClick={() => choose(option.id)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-left text-[12px] text-[var(--text)] hover:outline hover:outline-1 hover:outline-[var(--border-strong)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        style={{ backgroundColor: 'transparent' }}>
        <span className="truncate">{option.label}</span>{option.id === value ? <Check size={13} className="shrink-0 text-[var(--accent-text)]" aria-hidden="true" /> : null}
      </button>)}
    </div>, document.body)}
  </>
}
