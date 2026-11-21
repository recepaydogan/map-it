import { ArrowLeft, ArrowUpRight, Bell, LocateFixed } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { CURRENT_UPDATE, UPDATE_REFERENCE_LINKS } from "../../game-config";
import { openReference } from "../reference/reference-navigation";

const InlineUpdateLink = ({ children, onClick }: { children?: ReactNode; onClick: () => void }) => (
  <button type="button" onClick={onClick}
    className="inline-flex cursor-pointer items-center gap-0.5 rounded-[var(--radius-sm)] align-baseline font-semibold text-[var(--gold-bright)] focus-visible:outline-2 focus-visible:outline-accent hover:text-white">
    <span className="underline underline-offset-4">{children}</span>
    <ArrowUpRight size={14} aria-hidden="true" />
  </button>
);

const UpdateNote = ({ beforeKey, linkKey, afterKey, onClick }: {
  beforeKey?: string;
  linkKey: string;
  afterKey: string;
  onClick: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const separator = /^(ja|ko)(?:-|$)/u.test(i18n.resolvedLanguage ?? i18n.language) ? "" : " ";
  return <li className="flex gap-3 text-sm leading-6 text-zinc-200">
    <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />
    <span>
      {beforeKey && <>{t(beforeKey)}{separator}</>}
      <InlineUpdateLink onClick={onClick}>{t(linkKey)}</InlineUpdateLink>{separator}
      {t(afterKey)}
    </span>
  </li>;
};

const ReleaseHeading = ({ id, releaseKey, versionKey }: { id: string; releaseKey: string; versionKey: string }) => {
  const { t } = useTranslation();
  return <h2 id={id} className="mb-6 inline-flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-accent/25 px-3 py-1.5 font-mono text-sm font-semibold text-[var(--gold-bright)]">
    <span>{t(releaseKey)}</span>
    <span className="border-l border-accent/30 pl-2.5">{t(versionKey)}</span>
  </h2>;
};

const PatchNotes = () => {
  const { t } = useTranslation();
  const notes = ["expeditions", "progression", "fixes"] as const;

  return <article className="max-w-3xl" aria-labelledby="updates-game-patch">
    <ReleaseHeading id="updates-game-patch" releaseKey="updates.gamePatch.date" versionKey="updates.gamePatch.label" />
    <ul className="space-y-2 text-sm leading-6 text-zinc-200">
      {notes.map((note) => <li key={note} className="flex gap-2"><span aria-hidden="true" className="text-accent">•</span><span>{t(`updates.gamePatch.highlights.${note}`)}</span></li>)}
    </ul>
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
      {UPDATE_REFERENCE_LINKS.map(({ label, category, id }) => <InlineUpdateLink key={label} onClick={() => openReference({ category, id })}>{t(label)}</InlineUpdateLink>)}
    </div>
  </article>;
};

const CurrentPatchNotes = () => {
  const links = Object.fromEntries(CURRENT_UPDATE.links.map(({ key, category, id }) => [
    key, <InlineUpdateLink key={key} onClick={() => openReference({ category, id })} />,
  ]));
  return <article className="mb-8 max-w-3xl border-b border-border/70 pb-8" aria-labelledby="updates-current-patch">
    <ReleaseHeading id="updates-current-patch" releaseKey="updates.weeklyPatch.date" versionKey="updates.weeklyPatch.label" />
    <ul className="space-y-2 text-sm leading-6 text-zinc-200">
      {CURRENT_UPDATE.highlights.map((note) => <li key={note} className="flex gap-2"><span aria-hidden="true" className="text-accent">•</span><span><Trans i18nKey={`updates.weeklyPatch.highlights.${note}`} components={links} /></span></li>)}
    </ul>
  </article>;
};

const UpdatesPage = ({ onNavigateMap, onNavigateQuests, onNavigateTitles, onNavigateChallenges, onNavigateAchievements, onNavigatePetsFilter, onNavigateMarkerSizes, onNavigateWings, onNavigateLeaderboard, onNavigateHalloween, onNavigateHalloweenGuide, onNavigateHalloweenLooks, onNavigateHalloweenCandy }: {
  onNavigateMap: () => void;
  onNavigateQuests: () => void;
  onNavigateTitles: () => void;
  onNavigateChallenges: () => void;
  onNavigateAchievements: () => void;
  onNavigatePetsFilter: () => void;
  onNavigateMarkerSizes: () => void;
  onNavigateWings: () => void;
  onNavigateLeaderboard: () => void;
  onNavigateHalloween: () => void;
  onNavigateHalloweenGuide: () => void;
  onNavigateHalloweenLooks: () => void;
  onNavigateHalloweenCandy: () => void;
}) => {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus({ preventScroll: true }), []);

  return <div className="flex h-full min-h-0 flex-col bg-background" data-updates-page>
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
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 sm:py-10">
      <CurrentPatchNotes />
      <article className="mb-8 max-w-3xl border-b border-border/70 pb-8" aria-labelledby="updates-live-tracker">
        <ReleaseHeading id="updates-live-tracker" releaseKey="updates.liveTracker.date" versionKey="updates.liveTracker.label" />
        <div className="rounded-[var(--radius-sm)] border border-accent/25 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><LocateFixed size={18} className="text-accent" aria-hidden="true" />{t("updates.liveTracker.title")}</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-200">{t("updates.liveTracker.summary")}</p>
          <p className="mt-1 text-xs leading-5 text-subtle">{t("updates.liveTracker.setup")}</p>
          <div className="mt-3 text-xs"><InlineUpdateLink onClick={onNavigateMap}>{t("updates.liveTracker.action")}</InlineUpdateLink></div>
        </div>
      </article>
      <details className="mt-8 max-w-3xl border-t border-border/70 pt-5">
        <summary className="cursor-pointer rounded-[var(--radius-sm)] text-sm font-semibold text-subtle hover:text-white focus-visible:outline-2 focus-visible:outline-accent">{t("updates.previousUpdates")}</summary>
        <div className="mt-6"><PatchNotes /></div>
        <article className="mt-6" aria-labelledby="updates-303-release">
          <ReleaseHeading id="updates-303-release" releaseKey="updates.v303Release" versionKey="updates.v303Version" />
          <p className="mb-5 text-sm leading-6 text-zinc-200">{t("updates.v303Summary")}</p>
          <ul className="space-y-4 pl-4">
            <UpdateNote linkKey="updates.v303GuideLink" afterKey="updates.v303GuideNote" onClick={onNavigateHalloweenGuide} />
            <UpdateNote linkKey="updates.v303CandyLink" afterKey="updates.v303CandyNote" onClick={onNavigateHalloweenCandy} />
            <UpdateNote linkKey="updates.v303LooksLink" afterKey="updates.v303LooksNote" onClick={onNavigateHalloweenLooks} />
          </ul>
        </article>
        <article className="mt-8 max-w-3xl border-t border-border/70 pt-8" aria-labelledby="updates-halloween-release">
          <ReleaseHeading id="updates-halloween-release" releaseKey="updates.halloweenRelease" versionKey="updates.halloweenReleaseLabel" />
          <p className="mb-5 text-sm leading-6 text-zinc-200">{t("updates.halloweenSummary")}</p>
          <ul className="space-y-4 pl-4">
            <UpdateNote beforeKey="updates.halloweenMissionsBefore" linkKey="updates.halloweenMissionsLink" afterKey="updates.halloweenMissionsNote" onClick={onNavigateHalloween} />
            <UpdateNote beforeKey="updates.halloweenTradersBefore" linkKey="updates.halloweenTradersLink" afterKey="updates.halloweenTradersNote" onClick={onNavigateHalloween} />
          </ul>
        </article>
        <article className="mt-8 max-w-3xl border-t border-border/70 pt-8" aria-labelledby="updates-release">
          <ReleaseHeading id="updates-release" releaseKey="updates.release" versionKey="updates.version" />
          <ul className="space-y-4 pl-4">
            <UpdateNote linkKey="updates.questsLink" afterKey="updates.questsNote" onClick={onNavigateQuests} />
            <UpdateNote linkKey="updates.titlesLink" afterKey="updates.titlesNote" onClick={onNavigateTitles} />
            <UpdateNote linkKey="updates.challengesLink" afterKey="updates.challengesNote" onClick={onNavigateChallenges} />
            <UpdateNote linkKey="updates.achievementsLink" afterKey="updates.achievementsNote" onClick={onNavigateAchievements} />
          </ul>
        </article>
        <article className="mt-8 max-w-3xl border-t border-border/70 pt-8" aria-labelledby="updates-previous-release">
          <ReleaseHeading id="updates-previous-release" releaseKey="updates.previousRelease" versionKey="updates.previousVersion" />
          <ul className="space-y-4 pl-4">
            <UpdateNote beforeKey="updates.petsBefore" linkKey="updates.petsLink" afterKey="updates.petsNote" onClick={onNavigatePetsFilter} />
          </ul>
        </article>
        <article className="mt-8 max-w-3xl border-t border-border/70 pt-8" aria-labelledby="updates-older-release">
          <ReleaseHeading id="updates-older-release" releaseKey="updates.olderRelease" versionKey="updates.olderVersion" />
          <ul className="space-y-4 pl-4">
            <UpdateNote linkKey="updates.wingsLink" afterKey="updates.note" onClick={onNavigateWings} />
            <UpdateNote beforeKey="updates.leaderboardBefore" linkKey="updates.leaderboardLink" afterKey="updates.leaderboardNote" onClick={onNavigateLeaderboard} />
            <UpdateNote beforeKey="updates.markerSizesBefore" linkKey="updates.markerSizesLink" afterKey="updates.markerSizesNote" onClick={onNavigateMarkerSizes} />
          </ul>
        </article>
      </details>
    </div>
  </div>;
};

export default UpdatesPage;
