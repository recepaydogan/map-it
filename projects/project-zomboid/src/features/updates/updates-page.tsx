import { ArrowLeft, ArrowRight, Bell } from "lucide-react";
import { Fragment, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { RELEASE_NOTES } from "./release-notes";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const renderReleaseBody = (body: string, modNames: string[]) => {
  if (modNames.length === 0) return body;
  const orderedNames = [...modNames].sort((left, right) => right.length - left.length);
  const nameSet = new Set(orderedNames);
  const pattern = new RegExp(`(${orderedNames.map(escapeRegExp).join("|")})`, "g");
  return body.split(pattern).map((part, index) => nameSet.has(part)
    ? <span key={`${part}-${index}`} className="font-semibold text-accent">{part}</span>
    : part);
};

const UpdatesPage = ({ onNavigateMap, onRequestMods }: {
  onNavigateMap: () => void;
  onRequestMods: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dateFormat = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });

  useEffect(() => headingRef.current?.focus({ preventScroll: true }), []);

  return (
    <div className="@container flex h-full min-h-0 flex-col bg-background" data-updates-page>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4 @min-[620px]:px-8">
        <div className="flex items-center gap-3">
          <Bell size={18} className="shrink-0 text-accent" aria-hidden="true" />
          <h1 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-white outline-none">
            {t("updates.title")}
          </h1>
        </div>
        <button
          type="button"
          onClick={onNavigateMap}
          aria-label={t("updates.back")}
          className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-subtle transition-colors hover:bg-surface-hover hover:text-white"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8 @min-[620px]:px-8 @min-[620px]:py-10">
        <div className="mx-auto max-w-3xl">
          <div>
            {RELEASE_NOTES.map((release, index) => (
              <Fragment key={release.version}>
                <article aria-labelledby={`release-${release.version}`}>
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <h2 id={`release-${release.version}`} className="rounded-[var(--radius-sm)] border border-accent/25 bg-accent-soft px-3 py-1.5 font-mono text-sm font-semibold text-[var(--gold-bright)]">
                      {t("updates.version", { version: release.version })}
                    </h2>
                    <time dateTime={release.publishedAt} className="text-xs text-muted">
                      {dateFormat.format(new Date(`${release.publishedAt}T12:00:00Z`))}
                    </time>
                  </div>
                  <p className="select-text whitespace-pre-line text-sm leading-7 text-subtle">
                    {renderReleaseBody(t(`${release.translationKey}.body`), [
                      ...release.modNames,
                      ...(release.highlightedTextKey ? [t(release.highlightedTextKey)] : []),
                    ])}
                  </p>
                  {release.modNames.length > 0 && (
                    <div className="mt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={onRequestMods}
                        className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] bg-accent px-4 py-2.5 text-xs font-semibold text-on-accent transition-colors hover:bg-[var(--gold-bright)]"
                      >
                        {t("updates.requestMods")}
                        <ArrowRight size={15} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </article>
                {index < RELEASE_NOTES.length - 1 && <hr className="my-8 border-border" />}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdatesPage;
