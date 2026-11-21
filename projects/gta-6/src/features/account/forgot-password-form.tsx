import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  confirmPasswordReset,
  requestPasswordReset,
} from "../../services/auth/auth-service";
import { isValidRecoveryCode, RECOVERY_CODE_LENGTH, RECOVERY_CODE_PATTERN } from "../../services/auth/recovery-code";
import {
  AuthError,
  AuthField,
  AuthLink,
  AuthNotice,
  AuthSubmit,
  type AuthView,
} from "./auth-form";

interface ForgotPasswordFormProps {
  onSwitch: (view: AuthView) => void;
}

/**
 * Two-step in-app reset (no redirect links — Overwolf can't receive them):
 * request emails a recovery code, confirm verifies it and sets the new
 * password. Verifying also signs the user in, so the account overlay swaps
 * to the profile on success.
 */
const ForgotPasswordForm = ({ onSwitch }: ForgotPasswordFormProps) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleRequest = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await requestPasswordReset(email.trim());
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice(t("account.recoveryCodeOnItsWay", { email: email.trim(), count: RECOVERY_CODE_LENGTH }));
    setStep("confirm");
  };

  const handleConfirm = async (event: FormEvent) => {
    event.preventDefault();
    if (!isValidRecoveryCode(code)) {
      setError(t("account.errors.recoveryCodeLength", { count: RECOVERY_CODE_LENGTH }));
      return;
    }
    if (password !== confirm) {
      setError(t("account.passwordsDontMatch"));
      return;
    }
    setPending(true);
    setError(null);
    const result = await confirmPasswordReset(email.trim(), code, password);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
    }
  };

  if (step === "request") {
    return (
      <form onSubmit={(event) => void handleRequest(event)} className="flex flex-col gap-4">
        <p className="text-[12px] leading-relaxed text-muted">
          {t("account.forgotPasswordIntro", { count: RECOVERY_CODE_LENGTH })}
        </p>
        <AuthField
          label={t("account.email")}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t("account.emailPlaceholder")}
          autoComplete="email"
          autoFocus
          required
        />
        <AuthError>{error}</AuthError>
        <AuthSubmit pending={pending} disabled={!email.trim()}>
          {t("account.sendRecoveryCode")}
        </AuthSubmit>
        <div className="text-center">
          <AuthLink onClick={() => onSwitch("sign-in")}>{t("account.backToSignIn")}</AuthLink>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={(event) => void handleConfirm(event)} className="flex flex-col gap-4">
      {!error && <AuthNotice>{notice}</AuthNotice>}
      <AuthField
        label={t("account.recoveryCode")}
        type="text"
        inputMode="numeric"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, RECOVERY_CODE_LENGTH))}
        placeholder={t("account.recoveryCodePlaceholder", { count: RECOVERY_CODE_LENGTH })}
        minLength={RECOVERY_CODE_LENGTH}
        maxLength={RECOVERY_CODE_LENGTH}
        pattern={RECOVERY_CODE_PATTERN}
        autoComplete="one-time-code"
        autoFocus
        required
      />
      <AuthField
        label={t("account.newPassword")}
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder={t("account.atLeast6Characters")}
        autoComplete="new-password"
        minLength={6}
        required
      />
      <AuthField
        label={t("account.confirmNewPassword")}
        type="password"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        placeholder={t("account.repeatThePassword")}
        autoComplete="new-password"
        required
      />
      <AuthError>{error}</AuthError>
      <AuthSubmit pending={pending} disabled={!isValidRecoveryCode(code) || !password || !confirm}>
        {t("account.resetPassword")}
      </AuthSubmit>
      <div className="flex items-center justify-between">
        <AuthLink onClick={() => setStep("request")}>{t("account.resendCode")}</AuthLink>
        <AuthLink onClick={() => onSwitch("sign-in")}>{t("account.backToSignIn")}</AuthLink>
      </div>
    </form>
  );
};

export default ForgotPasswordForm;
