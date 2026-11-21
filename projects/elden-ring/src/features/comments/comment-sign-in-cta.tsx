import { LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";

interface CommentSignInCtaProps {
  onSignIn: () => void;
}

/**
 * What a signed-out reader sees in place of the composer.
 *
 * It leads with what they already have — every note on the page is readable —
 * because an account wall in front of content nobody has read yet converts
 * nobody. The ask is for the thing an account is actually needed for.
 */
const CommentSignInCta = ({ onSignIn }: CommentSignInCtaProps) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onSignIn}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border border-border bg-white/[0.03] px-3 py-2 text-left transition-colors hover:border-accent/40 hover:bg-accent/[0.06]"
    >
      <LogIn size={14} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold text-zinc-200">
          {t("comments.signInTitle")}
        </span>
        <span className="block text-[11px] leading-snug text-subtle">
          {t("comments.signInBody")}
        </span>
      </span>
    </button>
  );
};

export default CommentSignInCta;
