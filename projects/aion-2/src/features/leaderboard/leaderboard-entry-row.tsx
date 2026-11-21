import { ChevronRight, Crown, Medal, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import { characterProfileImageUrl } from "../character-profiles/character-profile-image-url";
import type { LeaderboardEntry } from "./leaderboard-api";
import LeaderboardClassBadge from "./leaderboard-class-badge";

const LeaderboardEntryRow = ({ entry, personal, inPersonalSection, onOpen }: {
  entry: LeaderboardEntry;
  personal?: boolean;
  inPersonalSection?: boolean;
  onOpen: (entry: LeaderboardEntry, button: HTMLButtonElement) => void;
}) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const portrait = characterProfileImageUrl(entry.profileImageUrl);
  const podium = entry.rank <= 3;

  return <button type="button" onClick={(event) => onOpen(entry, event.currentTarget)}
    aria-label={t("leaderboard.rowLabelFull", { rank: entry.rank, name: entry.name, className: gameText(entry.className), region: t(`characterProfiles.regions.${entry.region}`), server: entry.serverName, score: entry.gearScore.toLocaleString(i18n.language), combatPower: entry.combatPower.toLocaleString(i18n.language) })}
    className={cn("group flex w-full min-w-0 cursor-pointer items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:gap-4 sm:px-4",
      !inPersonalSection && entry.rank === 1 && "bg-accent/8 hover:bg-accent/13",
      !inPersonalSection && entry.rank === 2 && "bg-slate-200/5 hover:bg-slate-200/10",
      !inPersonalSection && entry.rank === 3 && "bg-amber-700/8 hover:bg-amber-700/13")}
  >
    <span className={cn("flex w-9 shrink-0 items-center justify-center gap-0.5 text-[15px] font-semibold tabular-nums",
      entry.rank === 1 ? "text-[var(--gold-bright)]" : entry.rank === 2 ? "text-slate-200" : entry.rank === 3 ? "text-amber-400" : "text-subtle")}>
      {entry.rank === 1 ? <Crown size={13} aria-hidden="true" /> : podium ? <Medal size={12} aria-hidden="true" /> : null}
      {entry.rank}
    </span>
    <span className={cn("relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-border bg-elevated text-subtle",
      entry.rank === 1 && "border-accent/40", personal && "ring-1 ring-accent/30")}>
      <UserRound size={17} aria-hidden="true" />
      {portrait && <img src={portrait} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} className="absolute inset-0 size-full object-cover" />}
    </span>
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
      <span className="min-w-0 flex-1 basis-full sm:w-36 sm:flex-none sm:basis-auto lg:w-44">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-[13px] font-semibold text-white">{entry.name}</span>
          {personal && !inPersonalSection && <span className="rounded border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">{t("leaderboard.yourCharacter")}</span>}
        </span>
        <span className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-zinc-200"><LeaderboardClassBadge className={entry.className} />{gameText(entry.className)}</span>
      </span>
      <span className="inline-flex max-w-full min-w-0 border border-white/20 bg-black/15 text-center text-[11px] font-semibold text-zinc-200">
        <span className="min-w-0 truncate px-2 py-1" title={`${t("leaderboard.region")}: ${t(`characterProfiles.regions.${entry.region}`)}`}>{t(`characterProfiles.regions.${entry.region}`)}</span>
        <span className="min-w-0 truncate border-l border-white/20 px-2 py-1" title={`${t("leaderboard.server")}: ${entry.serverName}`}>{entry.serverName}</span>
      </span>
    </span>
    <span className="grid w-[170px] shrink-0 grid-cols-2 gap-2 text-right sm:w-[218px] sm:gap-4">
      <span className="min-w-0"><span className="block truncate text-[9px] font-medium uppercase tracking-wide text-subtle">{t("leaderboard.gearScore")}</span><span className="mt-0.5 block text-[16px] font-semibold tabular-nums text-white sm:text-[18px]">{entry.gearScore.toLocaleString(i18n.language)}</span></span>
      <span className="min-w-0"><span className="block truncate text-[9px] font-medium uppercase tracking-wide text-subtle">{t("characterProfiles.combatPower")}</span><span className="mt-0.5 block text-[14px] font-semibold tabular-nums text-zinc-200 sm:text-[16px]">{entry.combatPower.toLocaleString(i18n.language)}</span></span>
    </span>
    <ChevronRight size={15} className="hidden shrink-0 text-subtle transition-colors group-hover:text-accent sm:block" aria-hidden="true" />
  </button>;
};

export default LeaderboardEntryRow;
