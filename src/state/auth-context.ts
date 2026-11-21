import { createContext } from "react";
import type { AuthUser } from "../services/auth/auth-service";

export type AuthStatus =
  /** Restoring the persisted session on boot. */
  | "loading"
  | "signed-in"
  | "signed-out"
  /** Supabase env vars missing — account features hidden, app unaffected. */
  | "unavailable";

export interface AuthContextValue {
  status: AuthStatus;
  /** Set exactly when status is "signed-in". */
  user: AuthUser | null;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
