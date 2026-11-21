import { Loader2 } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

/** Shared form primitives for the account screens - one input style, one submit
 *  button, one error/notice treatment across every auth form. */

/** Which form the auth card is showing. */
export type AuthView = "sign-in" | "sign-up" | "forgot-password";

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const AuthField = ({ label, className, ...props }: AuthFieldProps) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">
      {label}
    </span>
    <input
      className={twMerge(
        "w-full rounded-[var(--radius-sm)] border border-border bg-background/60 px-3 py-2 text-sm text-primary transition-colors placeholder:text-subtle/70 focus:border-accent/60 focus:outline-none",
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
    className="mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-accent py-2.5 text-sm font-semibold text-background transition-colors hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-50"
  >
    {pending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
    {children}
  </button>
);

export const AuthError = ({ children }: { children: ReactNode }) =>
  children ? (
    <p role="alert" className="text-xs leading-relaxed text-danger">
      {children}
    </p>
  ) : null;

export const AuthNotice = ({ children }: { children: ReactNode }) =>
  children ? (
    <p role="status" className="text-xs leading-relaxed text-accent">
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
    className="cursor-pointer text-xs text-accent transition-colors hover:text-accent-bright"
  >
    {children}
  </button>
);
