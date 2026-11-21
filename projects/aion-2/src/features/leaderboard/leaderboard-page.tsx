import { ArrowLeft, Search, Trophy, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { CHARACTER_PROFILE_CONFIG } from "../../game-config";
import { cn } from "../../lib/cn";
import { useAuth } from "../../state/use-auth";
import { loadCharacterServers, loadCharacterProfile, readCachedCharacterProfile, type CharacterProfileData, type CharacterServer } from "../character-profiles/character-profile-api";
import CharacterProfileDetail from "../character-profiles/character-profile-detail";
import { clearLeaderboardPageCache, LEADERBOARD_CACHE_INVALIDATED_EVENT, leaderboardCharacter, loadLeaderboardPage, loadMyLeaderboardEntries, type LeaderboardEntry, type LeaderboardRegion } from "./leaderboard-api";
import LeaderboardEntryRow from "./leaderboard-entry-row";
import LeaderboardJoinDialog from "./leaderboard-join-dialog";
import LeaderboardPodiumCard from "./leaderboard-podium-card";

const PAGE_SIZE = 25;
const SYNC_POLL_DELAY_MS = 10_000;
const MAX_SYNC_POLLS_PER_OPEN = 3;
type ServerOption = CharacterServer & { region: LeaderboardRegion };
const sameEntry = (left: LeaderboardEntry, right: LeaderboardEntry): boolean =>
  left.region === right.region && left.serverId === right.serverId && left.characterId === right.characterId;

const LeaderboardPage = ({ active, onOpenMyCharacters, onOpenSignIn }: {
  active: boolean;
  onOpenMyCharacters: () => void;
  onOpenSignIn: () => void;
}) => {
  const { t } = useTranslation();
  const { status, user } = useAuth();
  const userId = status === "signed-in" ? user?.id ?? null : null;
  const [region, setRegion] = useState<LeaderboardRegion | null>(null);
  const [server, setServer] = useState<ServerOption | null>(null);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [serverState, setServerState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [serverRevision, setServerRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null);
  const [profile, setProfile] = useState<CharacterProfileData | null>(null);
  const [profileState, setProfileState] = useState<"loading" | "ready" | "error">("loading");
  const [profileRevision, setProfileRevision] = useState(0);
  const [refreshState, setRefreshState] = useState<"idle" | "updating" | "updated">("idle");
  const [joinOpen, setJoinOpen] = useState(false);
  const [myEntryResult, setMyEntryResult] = useState<{ userId: string; filterKey: string; entries: LeaderboardEntry[] } | null>(null);
  const refreshRequested = useRef(false);
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const syncPolls = useRef(0);
  const filterKey = JSON.stringify([region, server?.serverId ?? null, query]);
  const personalEntries = myEntryResult?.userId === userId && myEntryResult.filterKey === filterKey ? myEntryResult.entries : [];
  const podiumEntries = entries.filter((entry) => entry.rank <= 3);
  const otherEntries = entries.filter((entry) => entry.rank > 3);
  const isPersonal = (entry: LeaderboardEntry) => personalEntries.some((mine) => sameEntry(mine, entry));

  useEffect(() => {
    if (active) {
      syncPolls.current = 0;
      const timer = window.setTimeout(() => {
        setPage(0);
        setListState("loading");
        setRevision((value) => value + 1);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    else {
      const timer = window.setTimeout(() => setJoinOpen(false), 0);
      return () => window.clearTimeout(timer);
    }
  }, [active]);

  useEffect(() => {
    const invalidate = () => {
      setPage(0);
      setEntries([]);
      setMyEntryResult(null);
      setListState("loading");
      setRevision((value) => value + 1);
    };
    window.addEventListener(LEADERBOARD_CACHE_INVALIDATED_EVENT, invalidate);
    return () => window.removeEventListener(LEADERBOARD_CACHE_INVALIDATED_EVENT, invalidate);
  }, []);

  useEffect(() => {
    if (!active || !region) return;
    const controller = new AbortController();
    void loadCharacterServers(region, controller.signal).then((found) => {
      if (controller.signal.aborted) return;
      setServers(found.map((item) => ({ ...item, region })));
      setServerState("ready");
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      console.error("Failed to load leaderboard servers", error);
      setServerState("error");
    });
    return () => controller.abort();
  }, [active, region, serverRevision]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = search.trim();
      if (next === query) return;
      setEntries([]);
      setListState("loading");
      setPage(0);
      setQuery(next);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, query]);

  useEffect(() => {
    if (refreshState !== "updated") return;
    const timer = window.setTimeout(() => setRefreshState("idle"), 3000);
    return () => window.clearTimeout(timer);
  }, [refreshState]);

  useEffect(() => {
    if (!active || listState !== "loading") return;
    const controller = new AbortController();
    void loadLeaderboardPage({ region, serverId: server?.serverId ?? null, query, offset: page * PAGE_SIZE }, controller.signal)
      .then(({ entries: next, total: nextTotal, syncing: nextSyncing }) => {
        if (controller.signal.aborted) return;
        setEntries((current) => page === 0 ? next : [...current, ...next]);
        setTotal(page > 0 && next.length === 0 ? entries.length : nextTotal);
        setSyncing(nextSyncing);
        setListState("ready");
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load leaderboard", error);
        setListState("error");
      });
    return () => controller.abort();
  }, [active, region, server, query, page, revision, listState, entries.length]);

  useEffect(() => {
    if (!active || !syncing || listState !== "ready" || page !== 0
      || syncPolls.current >= MAX_SYNC_POLLS_PER_OPEN) return;
    const timer = window.setTimeout(() => {
      syncPolls.current += 1;
      setListState("loading");
      setRevision((value) => value + 1);
    }, SYNC_POLL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [active, syncing, listState, page]);

  useEffect(() => {
    if (!active || !userId) return;
    const controller = new AbortController();
    void loadMyLeaderboardEntries({ region, serverId: server?.serverId ?? null, query }, userId, controller.signal)
      .then((entries) => {
        if (!controller.signal.aborted) setMyEntryResult({ userId, filterKey, entries });
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) console.error("Failed to load personal leaderboard entry", error);
      });
    return () => controller.abort();
  }, [active, userId, region, server, query, filterKey, revision]);

  useEffect(() => {
    if (!active || !selected) return;
    const controller = new AbortController();
    const character = leaderboardCharacter(selected);
    const fresh = refreshRequested.current;
    // Check the shared snapshot when opening a ranked character, even if another
    // screen has an older profile in its short-lived UI cache.
    void loadCharacterProfile(character, controller.signal, true).then((data) => {
      if (controller.signal.aborted) return;
      refreshRequested.current = false;
      setProfile(data);
      setProfileState("ready");
      if (fresh) {
        setRefreshState("updated");
        clearLeaderboardPageCache();
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      refreshRequested.current = false;
      console.error("Failed to load leaderboard character profile", error);
      setProfileState("error");
      setRefreshState("idle");
    });
    return () => controller.abort();
  }, [active, selected, profileRevision]);

  const openProfile = (entry: LeaderboardEntry, button: HTMLButtonElement) => {
    refreshRequested.current = false;
    selectedRef.current = button;
    setProfile(readCachedCharacterProfile(leaderboardCharacter(entry)));
    setProfileState("loading");
    setRefreshState("idle");
    setSelected(entry);
  };
  const closeProfile = () => {
    refreshRequested.current = false;
    setSelected(null);
    const button = selectedRef.current;
    window.requestAnimationFrame(() => {
      if (button?.isConnected) button.focus();
    });
  };
  const changeRegion = (value: string) => {
    setRegion(value ? value as LeaderboardRegion : null);
    setServer(null);
    setServers([]);
    setServerState(value ? "loading" : "idle");
    setPage(0);
    setEntries([]);
    setListState("loading");
  };
  const changeServer = (value: string) => {
    const next = servers.find((item) => `${item.region}:${item.serverId}` === value) ?? null;
    setServer(next);
    if (next) setRegion(next.region);
    setPage(0);
    setEntries([]);
    setListState("loading");
  };
  return <div className={cn("catalog-page-frame min-w-0", !active && "hidden")} aria-hidden={!active} inert={!active}>
    <div className={cn("flex h-full min-h-0 flex-col", selected && "hidden")} aria-hidden={selected !== null || joinOpen} inert={selected !== null || joinOpen}>
      <header className="catalog-page-header shrink-0 border-b border-border px-5 py-5 lg:px-7">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] border border-border bg-background text-accent"><Trophy size={17} aria-hidden="true" /></span>
            <div className="min-w-0"><h1 className="text-[18px] font-semibold tracking-tight text-white">{t("leaderboard.title")}</h1>
              <p className="mt-1 max-w-2xl text-[12px] leading-5 text-subtle">{t("leaderboard.intro")}</p></div>
          </div>
          <button type="button" onClick={() => setJoinOpen(true)}
            className="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-border bg-background px-3.5 text-[12px] font-semibold text-accent hover:border-accent hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent">
            <UserPlus size={15} aria-hidden="true" />{t("leaderboard.joinCta")}
          </button>
        </div>
      </header>
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:px-7">
        <div className="mx-auto max-w-5xl space-y-5">
          <div className="grid gap-2 min-[520px]:grid-cols-2 lg:grid-cols-[minmax(0,180px)_minmax(0,220px)_minmax(180px,1fr)]">
            <CategoryDropdown value={region ?? ""} onChange={changeRegion} ariaLabel={t("leaderboard.region")}
              options={[{ key: "", label: t("leaderboard.allRegions") }, ...CHARACTER_PROFILE_CONFIG.regions.map((value) => ({ key: value, label: t(`characterProfiles.regions.${value}`) }))]} />
            <CategoryDropdown value={server ? `${server.region}:${server.serverId}` : ""} onChange={changeServer} ariaLabel={t("leaderboard.server")}
              disabled={serverState !== "ready"}
              options={[{ key: "", label: t(serverState === "idle" ? "leaderboard.chooseRegion" : serverState === "loading" ? "characterProfiles.loadingServers" : serverState === "error" ? "leaderboard.serverUnavailable" : "leaderboard.allServers") }, ...servers.map((item) => ({ key: `${item.region}:${item.serverId}`, label: item.serverName }))]} />
            <label className="flex h-10 min-w-0 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-background px-3 focus-within:border-accent min-[520px]:col-span-2 lg:col-span-1">
              <Search size={15} className="shrink-0 text-subtle" aria-hidden="true" />
              <span className="sr-only">{t("leaderboard.searchLabel")}</span>
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value.slice(0, 80))} placeholder={t("leaderboard.searchPlaceholder")}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-subtle" />
              {search && <button type="button" onClick={() => setSearch("")} aria-label={t("leaderboard.clearSearch")} className="grid size-6 shrink-0 cursor-pointer place-items-center text-subtle hover:text-white"><X size={13} /></button>}
            </label>
          </div>
          {serverState === "error" && <p className="text-[12px] text-subtle">{t("leaderboard.serverError")} <button type="button" onClick={() => { setServerState("loading"); setServerRevision((value) => value + 1); }} className="cursor-pointer text-accent underline">{t("characterProfiles.retry")}</button></p>}
          {listState === "loading" && entries.length === 0 && <div aria-label={t("leaderboard.loading")} role="status" className="space-y-2">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-[68px] animate-pulse rounded-[var(--radius-md)] border border-border bg-surface motion-reduce:animate-none" />)}</div>}
          {listState === "error" && <div role="alert" className="rounded-[var(--radius-md)] border border-border bg-surface px-4 py-6 text-[12px] text-subtle">{t("leaderboard.loadError")} <button type="button" onClick={() => { setListState("loading"); setRevision((value) => value + 1); }} className="ml-1 cursor-pointer text-accent underline">{t("characterProfiles.retry")}</button></div>}
          {listState === "ready" && syncing && entries.length === 0 && <p role="status" className="text-[11px] text-subtle">{t("leaderboard.syncing")}</p>}
          {listState === "ready" && entries.length === 0 && !syncing && <div className="rounded-[var(--radius-md)] border border-border bg-surface px-5 py-10 text-center"><p className="text-[13px] font-medium text-white">{t(query ? "leaderboard.noSearchResults" : "leaderboard.empty")}</p><p className="mt-1 text-[12px] text-subtle">{t(query ? "leaderboard.refineSearch" : "leaderboard.emptyHint")}</p></div>}
          {personalEntries.length > 0 && <section aria-label={t("leaderboard.yourCharacters")}
            className="overflow-hidden rounded-[var(--radius-md)] border border-border">
            <h2 className="border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-accent">{t("leaderboard.yourCharacters")}</h2>
            <div>{personalEntries.map((entry) =>
              <div key={`${entry.region}:${entry.serverId}:${entry.characterId}`} className="border-b border-border last:border-b-0">
                <LeaderboardEntryRow entry={entry} personal inPersonalSection onOpen={openProfile} />
              </div>)}</div>
          </section>}
          {personalEntries.length > 0 && entries.length > 0 && <div aria-hidden="true" className="h-px bg-border" />}
          {podiumEntries.length > 0 && <ol className={cn("grid gap-2.5", podiumEntries.length === 3 ? "min-[520px]:grid-cols-3 min-[520px]:items-stretch" : podiumEntries.length === 2 ? "min-[520px]:grid-cols-2" : "min-[520px]:mx-auto min-[520px]:max-w-[320px]")}>{podiumEntries.map((entry) =>
            <li key={`${entry.region}:${entry.serverId}:${entry.characterId}`} value={entry.rank} className={cn("flex min-w-0", podiumEntries.length === 3 && (entry.rank === 1 ? "min-[520px]:col-start-2 min-[520px]:row-start-1" : entry.rank === 2 ? "min-[520px]:col-start-1 min-[520px]:row-start-1 min-[520px]:mt-7" : "min-[520px]:col-start-3 min-[520px]:row-start-1 min-[520px]:mt-7"))}>
              <LeaderboardPodiumCard entry={entry} personal={isPersonal(entry)} onOpen={openProfile} />
            </li>)}</ol>}
          {otherEntries.length > 0 && <ol className="overflow-hidden rounded-[var(--radius-md)] border border-border" start={otherEntries[0].rank}>{otherEntries.map((entry) =>
            <li key={`${entry.region}:${entry.serverId}:${entry.characterId}`} value={entry.rank} className="border-b border-border last:border-b-0">
              <LeaderboardEntryRow entry={entry} personal={isPersonal(entry)} onOpen={openProfile} />
            </li>)}</ol>}
          {entries.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 pb-3 text-[11px] text-subtle"><span>{t("leaderboard.showing", { shown: entries.length, total })}</span>{entries.length < total && <button type="button" onClick={() => { setListState("loading"); setPage((value) => value + 1); }} disabled={listState === "loading"} className="min-h-9 cursor-pointer rounded-[var(--radius-md)] border border-border px-4 text-[12px] font-medium text-white hover:bg-surface-hover disabled:cursor-wait disabled:opacity-70">{t(listState === "loading" ? "leaderboard.loadingMore" : "leaderboard.loadMore")}</button>}</div>}
        </div>
      </div>
    </div>
    {selected && <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-5 py-3 lg:px-7"><div className="mx-auto max-w-5xl"><button type="button" onClick={closeProfile} className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-[12px] font-medium text-subtle hover:text-white focus-visible:outline-2 focus-visible:outline-accent"><ArrowLeft size={15} aria-hidden="true" />{t("leaderboard.back")}</button></div></div>
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:px-7"><div className="mx-auto max-w-5xl space-y-3">
        {profileState === "loading" && !profile && <p role="status" className="rounded-[var(--radius-md)] border border-border bg-surface px-5 py-10 text-center text-[12px] text-subtle">{t("characterProfiles.loadingProfile")}</p>}
        {profileState === "error" && <div role="alert" className="rounded-[var(--radius-md)] border border-border bg-surface p-4 text-[12px] text-subtle">{t(profile ? "characterProfiles.refreshError" : "characterProfiles.profileError")} <button type="button" onClick={() => { refreshRequested.current = true; setProfileState("loading"); setRefreshState("updating"); setProfileRevision((value) => value + 1); }} className="ml-1 cursor-pointer text-accent underline">{t("characterProfiles.retry")}</button></div>}
        {profile && <CharacterProfileDetail data={profile} region={selected.region} primaryMetric="gearScore" refreshLabel={t("leaderboard.checkProfile")} refreshState={refreshState} onRefresh={() => { refreshRequested.current = true; setRefreshState("updating"); setProfileState("loading"); setProfileRevision((value) => value + 1); }} />}
      </div></div>
    </div>}
    {joinOpen && active && <LeaderboardJoinDialog onClose={() => setJoinOpen(false)}
      onOpenSignIn={() => { setJoinOpen(false); onOpenSignIn(); }}
      onOpenMyCharacters={() => { setJoinOpen(false); onOpenMyCharacters(); }} />}
  </div>;
};

export default LeaderboardPage;
