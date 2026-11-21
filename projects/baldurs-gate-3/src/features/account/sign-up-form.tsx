import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { DISPLAY_NAME_MAX, signUp } from "../../services/auth/auth-service";
import {
  AuthError,
  AuthField,
  AuthLink,
  AuthSubmit,
  type AuthView,
} from "./auth-form";

interface SignUpFormProps {
  onSwitch: (view: AuthView) => void;
  /** Email-confirmation projects bounce back to sign-in with this notice. */
  onNeedsConfirmation: (notice: string) => void;
}

const SignUpForm = ({ onSwitch, onNeedsConfirmation }: SignUpFormProps) => {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError(t("account.passwordsDontMatch"));
      return;
    }
    setPending(true);
    setError(null);
    const result = await signUp(email.trim(), password, displayName.trim());
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    // With confirmation off the session lands via AuthProvider and the overlay
    // swaps to the profile on its own; otherwise hand the user back to sign-in.
    if (result.needsConfirmation) {
      onNeedsConfirmation(t("account.accountCreatedConfirm"));
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
      <AuthField
        label={t("account.displayName")}
        type="text"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        placeholder={t("account.displayNamePlaceholder")}
        autoComplete="nickname"
        maxLength={DISPLAY_NAME_MAX}
        autoFocus
        required
      />
      <AuthField
        label={t("account.email")}
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={t("account.emailPlaceholder")}
        autoComplete="email"
        required
      />
      <AuthField
        label={t("account.password")}
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder={t("account.atLeast6Characters")}
        autoComplete="new-password"
        minLength={6}
        required
      />
      <AuthField
        label={t("account.confirmPassword")}
        type="password"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        placeholder={t("account.repeatThePassword")}
        autoComplete="new-password"
        required
      />
      <AuthError>{error}</AuthError>
      <AuthSubmit
        pending={pending}
        disabled={!displayName.trim() || !email.trim() || !password || !confirm}
      >
        {t("account.createAccount")}
      </AuthSubmit>
      <div className="text-center">
        <AuthLink onClick={() => onSwitch("sign-in")}>
          {t("account.alreadyHaveAccountSignIn")}
        </AuthLink>
      </div>
    </form>
  );
};

export default SignUpForm;
