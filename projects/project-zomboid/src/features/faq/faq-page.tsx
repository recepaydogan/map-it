import { ArrowLeft, ArrowRight, CircleHelp } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface FaqPageProps {
  onNavigateMap: () => void;
  onNavigateBridgeSettings: () => void;
  onNavigateHotkeySettings: () => void;
  onNavigateMods: () => void;
}

const FaqPage = ({
  onNavigateMap,
  onNavigateBridgeSettings,
  onNavigateHotkeySettings,
  onNavigateMods,
}: FaqPageProps) => {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => headingRef.current?.focus({ preventScroll: true }), []);

  return (
    <div className="@container flex h-full min-h-0 flex-col bg-background animate-fade-in">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4 @min-[620px]:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
            <CircleHelp size={18} className="text-accent" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-white outline-none">
              {t("faq.title")}
            </h1>
            <p className="mt-0.5 text-xs text-muted">{t("faq.subtitle")}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onNavigateMap}
          aria-label={t("faq.back")}
          className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-subtle transition-colors hover:bg-surface-hover hover:text-white"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8 @min-[620px]:px-8 @min-[620px]:py-10">
        <div className="mx-auto w-full max-w-3xl">
          <p className="max-w-2xl text-sm leading-6 text-subtle">{t("faq.intro")}</p>
          <div className="mt-7 divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/60">
            <FaqItem
              title={t("faq.livePosition.question")}
              action={<FaqAction onClick={onNavigateBridgeSettings}>{t("settings.title")}</FaqAction>}
            >
              {t("faq.livePosition.answer")}
            </FaqItem>
            <FaqItem title={t("faq.minimapCursor.question")}>
              {t("faq.minimapCursor.answer")}
            </FaqItem>
            <FaqItem
              title={t("faq.overlay.question")}
              action={<FaqAction onClick={onNavigateHotkeySettings}>{t("faq.overlay.action")}</FaqAction>}
            >
              {t("faq.overlay.answer")}
            </FaqItem>
            <FaqItem
              title={t("faq.mapMods.question")}
              action={<FaqAction onClick={onNavigateMods}>{t("faq.mapMods.action")}</FaqAction>}
            >
              {t("faq.mapMods.answer")}
            </FaqItem>
            <FaqItem title={t("faq.firstLaunch.question")}>{t("faq.firstLaunch.answer")}</FaqItem>
          </div>
        </div>
      </div>
    </div>
  );
};

const FaqItem = ({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) => (
  <article className="px-5 py-5 @min-[620px]:px-6">
    <h2 className="text-sm font-semibold text-white">{title}</h2>
    <p className="mt-2 text-sm leading-6 text-subtle">{children}</p>
    {action && <div className="mt-3">{action}</div>}
  </article>
);

const FaqAction = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border border-accent/25 bg-accent-soft px-2.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/15 hover:text-[var(--gold-bright)]"
  >
    {children}
    <ArrowRight size={13} aria-hidden="true" />
  </button>
);

export default FaqPage;
