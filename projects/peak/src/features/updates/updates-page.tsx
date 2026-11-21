import { ArrowLeft, Bell } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { UPDATES_RELEASE } from "./updates-release";

const UpdatesPage = ({ onNavigateMap }: { onNavigateMap: () => void }) => {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-updates-page>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <Bell size={18} className="shrink-0 text-accent" aria-hidden="true" />
          <h1 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-primary outline-none">
            {t("updates.title")}
          </h1>
        </div>
        <button
          type="button"
          onClick={onNavigateMap}
          aria-label={t("updates.back")}
          title={t("updates.back")}
          className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-sm text-subtle transition-colors hover:bg-surface-hover hover:text-primary"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 sm:py-10">
        <article className="max-w-3xl" aria-labelledby="updates-version">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <h2 id="updates-version" className="rounded-sm border border-border-strong bg-surface px-3 py-1.5 font-mono text-sm font-semibold text-primary">
              {t("updates.version", { version: UPDATES_RELEASE.version })}
            </h2>
            <time dateTime={UPDATES_RELEASE.date} className="text-sm text-subtle">
              {t(UPDATES_RELEASE.dateKey)}
            </time>
          </div>
          <ul className="space-y-4 pl-4">
            {UPDATES_RELEASE.items.map((key) => (
              <li key={key} className="flex gap-3 text-[15px] leading-7 text-primary">
                <span aria-hidden="true" className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-subtle" />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </div>
  );
};

export default UpdatesPage;
