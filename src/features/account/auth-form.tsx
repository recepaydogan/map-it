import { Loader2 } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { useAuth } from "../../state/use-auth";

/** Shared form primitives for the auth and profile screens — one input style,
 *  one submit button, one error/notice treatment across every account form. */

/** Which form the auth card is showing. */
export type AuthView = "sign-in" | "sign-up" | "forgot-password";

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const AuthField = ({ label, className, ...props }: AuthFieldProps) => (
  <label className="flex flex-col gap-1.5">
    <span className="map-it-label">
      {label}
    </span>
    <input
      className={cn(
        "map-it-field",
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

export const AuthSubmit = ({ children, pending, disabled }: AuthSubmitProps) => {
  const { status } = useAuth();
  return (
  <button
    type="submit"
    disabled={pending || disabled || status === "unavailable"}
    className="map-it-button map-it-button-primary mt-1 w-full"
  >
    {pending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
    {children}
  </button>
);
};

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
    className="map-it-auth-link"
  >
    {children}
  </button>
);
