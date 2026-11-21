import { Check, RefreshCw, UserRound } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { CHARACTER_PROFILE_CONFIG } from "../../game-config";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import type { CharacterProfileData, CharacterRegion } from "./character-profile-api";
import { characterProfileImageUrl } from "./character-profile-image-url";
import CharacterProfileSections, { PROFILE_TABS, type ProfileTab } from "./character-profile-sections";

const CharacterProfileDetail = ({ data, region, primaryMetric = "combatPower", refreshLabel, refreshState, onRefresh }: {
  data: CharacterProfileData;
  region: CharacterRegion;
  primaryMetric?: "combatPower" | "gearScore";
  refreshLabel?: string;
  refreshState: "idle" | "updating" | "updated";
  onRefresh: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const [tab, setTab] = useState<ProfileTab>("equipment");
  const { profile } = data;
  const portrait = characterProfileImageUrl(profile.profileImage);
  const gearScore = data.stats.find((stat) => stat.type === CHARACTER_PROFILE_CONFIG.gearScoreStatType)?.value;

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: ProfileTab) => {
    const index = PROFILE_TABS.indexOf(current);
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % PROFILE_TABS.length
      : event.key === "ArrowLeft" ? (index - 1 + PROFILE_TABS.length) % PROFILE_TABS.length
        : event.key === "Home" ? 0 : event.key === "End" ? PROFILE_TABS.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = PROFILE_TABS[nextIndex]!;
    setTab(next);
    document.getElementById(`character-profile-tab-${next}`)?.focus();
  };

  return <article className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
    <div className="flex flex-wrap items-start gap-3 border-b border-border px-5 py-5 sm:flex-nowrap sm:gap-4 sm:px-6">
      <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] border border-accent/30 bg-background text-accent sm:size-20">
        <UserRound size={30} aria-hidden="true" />
        {portrait && <img src={portrait} alt="" onError={(event) => { event.currentTarget.hidden = true; }} className="absolute inset-0 size-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="min-w-0 truncate text-2xl font-semibold tracking-tight text-white">{profile.characterName}</h2>
          <span className="rounded-[var(--radius-full)] border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent">{t("characterProfiles.level", { level: profile.characterLevel })}</span>
        </div>
        {profile.titleName && <p className="mt-0.5 text-[12px] text-accent">{gameText(profile.titleName)}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-zinc-300">
          <span>{gameText(profile.className)}</span><span aria-hidden="true" className="text-muted">·</span>
          <span>{gameText(profile.raceName)}</span><span aria-hidden="true" className="text-muted">·</span>
          <span>{t(`characterProfiles.regions.${region}`)} / {profile.serverName}</span>
        </div>
        {profile.regionName && <p className="mt-2 text-[11px] text-subtle">{t("characterProfiles.legion", { name: profile.regionName })}</p>}
      </div>
      <button type="button" onClick={onRefresh} disabled={refreshState === "updating"}
        className={cn("inline-flex min-h-9 w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border px-3 text-[12px] font-medium transition-colors disabled:cursor-wait disabled:opacity-70 sm:w-auto",
          refreshState === "updated"
            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15 hover:text-emerald-200"
            : "border-border text-subtle hover:bg-surface-hover hover:text-white")}>
        {refreshState === "updated" ? <Check size={15} aria-hidden="true" />
          : <RefreshCw size={15} className={refreshState === "updating" ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden="true" />}
        <span aria-live="polite">{refreshState === "idle" && refreshLabel ? refreshLabel : t(`characterProfiles.${refreshState === "idle" ? "update" : refreshState}`)}</span>
      </button>
    </div>
    <dl className="grid grid-cols-2 divide-x divide-border border-b border-border bg-background/40">
      <div className="px-5 py-4 sm:px-6"><dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-subtle">{t("characterProfiles.combatPower")}</dt>
        <dd className={cn("mt-1 text-2xl font-semibold tabular-nums", primaryMetric === "combatPower" ? "text-accent" : "text-white")}>{profile.combatPower.toLocaleString(i18n.language)}</dd></div>
      <div className="px-5 py-4 sm:px-6"><dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-subtle">{t("characterProfiles.gearScore")}</dt>
        <dd className={cn("mt-1 text-2xl font-semibold tabular-nums", primaryMetric === "gearScore" ? "text-accent" : "text-white")}>{gearScore?.toLocaleString(i18n.language) ?? "—"}</dd></div>
    </dl>
    <div role="tablist" aria-label={t("characterProfiles.sections")} className="scroll-slim flex overflow-x-auto overflow-y-hidden border-b border-border px-3 sm:px-5">
      {PROFILE_TABS.map((value) => <button key={value} type="button" id={`character-profile-tab-${value}`} role="tab"
        aria-selected={tab === value} aria-controls="character-profile-panel" tabIndex={tab === value ? 0 : -1}
        onClick={() => setTab(value)} onKeyDown={(event) => onTabKeyDown(event, value)}
        className={cn("-mb-px min-h-11 shrink-0 cursor-pointer border-b-2 px-3 text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent sm:px-4",
          tab === value ? "border-accent text-accent" : "border-transparent text-subtle hover:text-white")}>
        {t(`characterProfiles.tabs.${value}`)}
      </button>)}
    </div>
    <div id="character-profile-panel" role="tabpanel" aria-labelledby={`character-profile-tab-${tab}`} tabIndex={0} className="min-h-48 px-4 py-5 outline-none sm:px-6 sm:py-6">
      <CharacterProfileSections data={data} tab={tab} />
    </div>
  </article>;
};

export default CharacterProfileDetail;
