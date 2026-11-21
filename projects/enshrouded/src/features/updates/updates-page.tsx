import { ArrowLeft, Bell } from "lucide-react";
import { Fragment, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { UPDATES_VERSION } from "./updates-release";

type LinkedNote = { target: "appearance"; before: string; link: string; after: string };
type MapFilterCategoryId = string;
type MapFiltersNote = { target: "map-filters"; before: string; links: { categoryId: MapFilterCategoryId; link: string; after: string }[] };
type ReleaseNote = string | LinkedNote | MapFiltersNote;
type Release = { version: string; items: ReleaseNote[] };
const linkedNoteClassName = "cursor-pointer font-semibold text-[var(--gold-bright)] underline decoration-current underline-offset-4 transition-colors hover:text-white focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent";

const isReleaseNote = (entry: unknown): entry is ReleaseNote => {
  if (typeof entry === "string") return true;
  if (typeof entry !== "object" || entry === null || !("target" in entry)
    || !("before" in entry) || typeof entry.before !== "string") return false;
  if (entry.target === "map-filters") return "links" in entry && Array.isArray(entry.links)
    && entry.links.length > 0 && entry.links.every((link: unknown) =>
      typeof link === "object" && link !== null && "categoryId" in link
      && typeof link.categoryId === "string" && Boolean(link.categoryId)
      && "link" in link && typeof link.link === "string"
      && "after" in link && typeof link.after === "string");
  return entry.target === "appearance"
    && "link" in entry && typeof entry.link === "string"
    && "after" in entry && typeof entry.after === "string";
};

const isRelease = (entry: unknown): entry is Release =>
  typeof entry === "object" && entry !== null &&
  "version" in entry && typeof entry.version === "string" &&
  "items" in entry && Array.isArray(entry.items) && entry.items.every(isReleaseNote);

const UpdatesPage = ({ onNavigateMap, onNavigateMapFilter, onNavigateSettingsAppearance }: {
  onNavigateMap: () => void;
  onNavigateMapFilter: (categoryId: MapFilterCategoryId) => void;
  onNavigateSettingsAppearance: () => void;
}) => {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus({ preventScroll: true }), []);

  const result = t("updates.releases", { returnObjects: true });
  const releases = typeof result === "object" && result !== null && !Array.isArray(result)
    ? Object.values(result).filter(isRelease).sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
    : [];
  if (!releases.some((release) => release.version === UPDATES_VERSION)) releases.unshift({ version: UPDATES_VERSION, items: [] });

  return <div className="enshrouded-utility-page flex h-full min-h-0 flex-col" data-updates-page>
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div className="flex items-center gap-3">
        <Bell size={18} className="shrink-0 text-accent" aria-hidden="true" />
        <h1 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-white outline-none">{t("updates.title")}</h1>
      </div>
      <button type="button" onClick={onNavigateMap} aria-label={t("updates.back")}
        className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-subtle transition-colors hover:bg-surface-hover hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
        <ArrowLeft size={18} aria-hidden="true" />
      </button>
    </header>
    <div className="enshrouded-page-body scroll-slim min-h-0 flex-1 space-y-10 overflow-y-auto px-5 py-8 sm:px-8 sm:py-10">
      {releases.map((release) => <article key={release.version} className="max-w-3xl" aria-labelledby={`updates-version-${release.version}`}>
        <h2 id={`updates-version-${release.version}`} className="mb-6 inline-flex rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-1.5 font-mono text-sm font-semibold text-accent">
          {t("updates.version", { version: release.version })}
        </h2>
        {release.items.length ? <ul className="space-y-4 pl-4">
          {release.items.map((note) => <li key={typeof note === "string" ? note : note.target === "map-filters" ? note.before : note.link} className="flex gap-3 text-[15px] leading-7 text-zinc-200">
            <span aria-hidden="true" className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
            <span>{typeof note === "string" ? note : note.target === "map-filters" ? <>{note.before}{note.links.map(({ categoryId, link, after }) => <Fragment key={categoryId}>
              <button type="button" onClick={() => onNavigateMapFilter(categoryId)} className={linkedNoteClassName}>{link}</button>{after}
            </Fragment>)}</> : <>{note.before}<button type="button"
              onClick={onNavigateSettingsAppearance}
              className={linkedNoteClassName}
            >{note.link}</button>{note.after}</>}</span>
          </li>)}
        </ul> : <p className="text-[15px] leading-7 text-zinc-200">{t("updates.noNotes")}</p>}
      </article>)}
    </div>
  </div>;
};

export default UpdatesPage;
