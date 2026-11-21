import { Check } from 'lucide-react'
import { cn } from '../../../lib/cn'

interface ProgressRingProps {
  completion: number
  size?: number
  label: string
  className?: string
}

/**
 * Progress never relies on colour alone: the ring always ships with a numeric
 * percentage or complete checkmark and an accessible label.
 */
export function ProgressRing({ completion, size = 30, label, className }: ProgressRingProps) {
  const clamped = Math.min(1, Math.max(0, completion))
  const percent = Math.round(clamped * 100)
  const isComplete = percent >= 100
  const radius = size / 2 - 3
  const circumference = 2 * Math.PI * radius

  return (
    <span
      className={cn('relative grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth="2.5"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isComplete ? '#4ade80' : 'var(--accent)'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {isComplete ? (
        <Check
          size={size <= 28 ? 13 : 16}
          strokeWidth={3}
          className="absolute text-emerald-400"
          aria-hidden="true"
        />
      ) : (
        <span
          className={cn(
            'absolute font-bold tabular-nums text-[var(--text)]',
            size <= 28 ? 'text-[8.5px]' : 'text-[10px]',
          )}
        >
          {percent}
        </span>
      )}
    </span>
  )
}
