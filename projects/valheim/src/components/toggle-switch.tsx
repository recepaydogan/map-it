import { cn } from '../lib/cn'

type ToggleSwitchProps = {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function ToggleSwitch({ checked, label, onChange, disabled = false }: ToggleSwitchProps) {
  return (
    <label className={cn(
      'relative block h-7 w-12 shrink-0',
      disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
    )}>
      <span className="sr-only">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        className="peer sr-only"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-0 rounded-[var(--radius-full)] border border-[var(--border-strong)] bg-[var(--surface-raised)] transition-colors',
          'after:absolute after:left-1 after:top-1 after:size-[18px] after:rounded-[var(--radius-full)] after:bg-[var(--muted)] after:transition-transform',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent-text)]',
          checked && 'border-[var(--accent)] bg-[var(--surface-hover)] after:translate-x-5 after:bg-[var(--accent-text)]',
        )}
      />
    </label>
  )
}
