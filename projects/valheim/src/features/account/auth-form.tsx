import { Loader2 } from 'lucide-react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** Shared form primitives for the auth and profile screens — one input style,
 *  one submit button, one error/notice treatment across every account form. */

/** Which form the auth card is showing. */
export type AuthView = 'sign-in' | 'sign-up' | 'forgot-password'

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
}

export function AuthField({ label, className, ...props }: AuthFieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
        {label}
      </span>
      <input
        className={cn(
          'w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-black/25 px-3 py-2 text-[13px] text-[var(--text)] transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none',
          className,
        )}
        {...props}
      />
    </label>
  )
}

type AuthSubmitProps = {
  children: ReactNode
  pending: boolean
  disabled?: boolean
}

export function AuthSubmit({ children, pending, disabled }: AuthSubmitProps) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] py-2.5 text-[13px] font-bold text-[var(--text)] transition-[background-color,opacity] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

export function AuthError({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="text-[11.5px] leading-relaxed text-red-300">
      {children}
    </p>
  )
}

export function AuthNotice({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="status" className="text-[11.5px] leading-relaxed text-[var(--accent-text)]">
      {children}
    </p>
  )
}

type AuthLinkProps = {
  children: ReactNode
  onClick: () => void
}

/** Inline mode-switch link ("Forgot password?", "Sign up"). */
export function AuthLink({ children, onClick }: AuthLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer text-[11.5px] font-medium text-[var(--accent-text)] transition-colors hover:brightness-125"
    >
      {children}
    </button>
  )
}
