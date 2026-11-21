import { Loader2 } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

/** Shared form primitives for the auth and profile screens — one input style,
 *  one submit button, one error/notice treatment across every account form. */

/** Which form the auth card is showing. */
export type AuthView = "sign-in" | "sign-up" | "forgot-password";

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const AuthField = ({ label, className, ...props }: AuthFieldProps) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">
      {label}
    </span>
    <input
      className={cn(
        "w-full rounded-[var(--radius-sm)] border border-border bg-background/60 px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-500 focus:border-accent/60 focus:outline-none",
        className,
      )}
      {...props}
    />
  </label>
);

interface AuthSubmitProps {
  children: ReactNode;
  pending: boolean;
  disabled?: boolean;
}

export const AuthSubmit = ({ children, pending, disabled }: AuthSubmitProps) => (
  <button
    type="submit"
    disabled={pending || disabled}
    className="mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-accent py-2.5 text-[13px] font-semibold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
  >
    {pending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
    {children}
  </button>
);

export const AuthError = ({ children }: { children: ReactNode }) =>
  children ? (
    <p role="alert" className="text-[12px] leading-relaxed text-danger-text">
      {children}
    </p>
  ) : null;

export const AuthNotice = ({ children }: { children: ReactNode }) =>
  children ? (
    <p role="status" className="text-[12px] leading-relaxed text-emerald-400">
      {children}
    </p>
  ) : null;

interface AuthLinkProps {
  children: ReactNode;
  onClick: () => void;
}

/** Inline mode-switch link ("Forgot password?", "Sign up"). */
export const AuthLink = ({ children, onClick }: AuthLinkProps) => (
  <button
    type="button"
    onClick={onClick}
    className="cursor-pointer text-[12px] text-accent transition-colors hover:text-accent/80"
  >
    {children}
  </button>
);
