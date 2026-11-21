import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { signInWithGoogle } from "../../services/auth/google-oauth";

/** The four-color Google "G" — lucide has no brand marks. */
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.28a7.21 7.21 0 0 1 0-4.56V6.61H1.27a12 12 0 0 0 0 10.78l4.01-3.11z"
    />
    <path
      fill="#EA4335"
      d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77z"
    />
  </svg>
);

interface GoogleButtonProps {
  label: string;
  /** Surfaces flow failures in the host form's error slot. */
  onError: (message: string) => void;
}

/**
 * Google OAuth entry. The flow runs in the system browser, so the button sits
 * in a waiting state until the redirect lands (or times out); success arrives
 * through the AuthProvider session change. The button stays clickable while
 * waiting: a re-click (e.g. after the user closed the browser tab) aborts the
 * stale attempt and starts a fresh one immediately — no need to wait out the
 * timeout. An `attempt` token ensures only the latest click drives the state.
 */
const GoogleButton = ({ label, onError }: GoogleButtonProps) => {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const attempt = useRef(0);

  const handleClick = async () => {
    const id = ++attempt.current;
    onError(""); // clear any stale error from a previous attempt
    setPending(true);
    const result = await signInWithGoogle();
    if (attempt.current !== id) return; // superseded by a newer click — ignore
    setPending(false);
    if (!result.ok && result.error) onError(result.error);
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-surface py-2.5 text-sm font-semibold text-zinc-100 transition-colors hover:bg-surface-hover"
    >
      {pending ? (
        <>
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          {t("account.waitingForBrowser")}
        </>
      ) : (
        <>
          <GoogleIcon />
          {label}
        </>
      )}
    </button>
  );
};

export default GoogleButton;
