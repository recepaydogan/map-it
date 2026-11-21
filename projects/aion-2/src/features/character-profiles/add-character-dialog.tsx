import { Link2, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { CHARACTER_PROFILE_CONFIG, characterClassKeyForPcId } from "../../game-config";
import { loadCharacterServers, searchCharacters, type CharacterRegion, type CharacterSearchResult, type CharacterServer } from "./character-profile-api";
import { characterProfileImageUrl } from "./character-profile-image-url";
import { characterKey } from "./linked-characters";

const AddCharacterDialog = ({ linkedKeys, onLink, onClose }: {
  linkedKeys: Set<string>;
  onLink: (character: CharacterSearchResult) => Promise<void>;
  onClose: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDialogElement | null>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const [region, setRegion] = useState<CharacterRegion>("eu");
  const [serverId, setServerId] = useState<number | null>(null);
  const [servers, setServers] = useState<CharacterServer[]>([]);
  const [serverStatus, setServerStatus] = useState<"loading" | "ready" | "error">("loading");
  const [serverRetry, setServerRetry] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<CharacterSearchResult[]>([]);
  const [resultTotal, setResultTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [linkingKey, setLinkingKey] = useState<string | null>(null);
  const [linkError, setLinkError] = useState(false);

  const resetResults = () => {
    searchAbort.current?.abort();
    setResults([]);
    setResultTotal(0);
    setPage(1);
    setHasMore(false);
    setLoadingMore(false);
    setLoadMoreError(false);
    setSearchStatus("idle");
    setLinkError(false);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    setPortalContainer(dialog);
    return () => { searchAbort.current?.abort(); dialog?.close(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadCharacterServers(region, controller.signal).then((found) => {
      if (controller.signal.aborted) return;
      setServers(found);
      setServerStatus("ready");
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      console.error("Failed to load character servers", error);
      setServerStatus("error");
    });
    return () => controller.abort();
  }, [region, serverRetry]);

  const runSearch = (nextRegion: CharacterRegion, nextServerId: number | null) => {
    const searchKeyword = keyword.trim();
    if (searchKeyword.length < 2) { resetResults(); return; }
    resetResults();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearchStatus("loading");
    void searchCharacters(searchKeyword, nextRegion, controller.signal, 1, nextServerId).then(({ results: found, total, hasMore: more }) => {
      if (controller.signal.aborted) return;
      setResults(found);
      setResultTotal(total);
      setHasMore(more);
      setSearchStatus("ready");
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      console.error("Failed to search characters", error);
      setSearchStatus("error");
    });
  };

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runSearch(region, serverId);
  };

  const onLoadMore = () => {
    if (!hasMore || loadingMore) return;
    const controller = new AbortController();
    searchAbort.current = controller;
    setLoadingMore(true);
    setLoadMoreError(false);
    const nextPage = page + 1;
    void searchCharacters(keyword.trim(), region, controller.signal, nextPage, serverId).then(({ results: found, total, hasMore: more }) => {
      if (controller.signal.aborted) return;
      setResults((current) => {
        const seen = new Set(current.map(characterKey));
        return [...current, ...found.filter((character) => {
          const key = characterKey(character);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })];
      });
      setResultTotal(total);
      setPage(nextPage);
      setHasMore(more && found.length > 0);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      console.error("Failed to load more characters", error);
      setLoadMoreError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingMore(false);
    });
  };

  const link = async (character: CharacterSearchResult) => {
    setLinkingKey(characterKey(character));
    setLinkError(false);
    try {
      await onLink(character);
      onClose();
    } catch (error) {
      console.error("Failed to link character", error);
      setLinkError(true);
      setLinkingKey(null);
    }
  };

  return <dialog ref={dialogRef} aria-labelledby="add-character-title" onCancel={(event) => { event.preventDefault(); onClose(); }}
    className="m-auto max-h-[min(80vh,720px)] w-[min(620px,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface p-0 text-white shadow-2xl backdrop:bg-black/75">
    <div className="flex max-h-[min(80vh,720px)] flex-col">
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div><h2 id="add-character-title" className="text-[17px] font-semibold text-white">{t("characterProfiles.linkTitle")}</h2>
          <p className="mt-1 text-[12px] leading-5 text-subtle">{t("characterProfiles.linkIntro")}</p></div>
        <button type="button" onClick={onClose} aria-label={t("characterProfiles.closeDialog")} className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-subtle hover:bg-white/8 hover:text-white"><X size={17} aria-hidden="true" /></button>
      </header>
      <div className="scroll-slim min-h-0 overflow-y-auto p-5">
        <form onSubmit={onSearch} className="space-y-2" role="search">
          <div className="grid gap-2 sm:grid-cols-2">
            <CategoryDropdown ariaLabel={t("characterProfiles.region")} value={region} onChange={(value) => { const nextRegion = value as CharacterRegion; setServers([]); setServerStatus("loading"); setRegion(nextRegion); setServerId(null); runSearch(nextRegion, null); }} options={CHARACTER_PROFILE_CONFIG.regions.map((value) => ({ key: value, label: t(`characterProfiles.regions.${value}`) }))} triggerClassName="h-10 bg-elevated" portalContainer={portalContainer} />
            <CategoryDropdown ariaLabel={t("characterProfiles.server")} value={serverId === null ? "" : String(serverId)} onChange={(value) => { const nextServerId = value ? Number(value) : null; setServerId(nextServerId); runSearch(region, nextServerId); }} options={[{ key: "", label: t(serverStatus === "loading" ? "characterProfiles.loadingServers" : "characterProfiles.allServers") }, ...servers.map((server) => ({ key: String(server.serverId), label: server.serverName }))]} triggerClassName="h-10 bg-elevated" portalContainer={portalContainer} />
          </div>
          {serverStatus === "error" && <p role="alert" className="text-[12px] text-danger-text">{t("characterProfiles.serverLoadError")} <button type="button" onClick={() => { setServerStatus("loading"); setServerRetry((value) => value + 1); }} className="cursor-pointer text-accent underline">{t("characterProfiles.retry")}</button></p>}
          <div className="flex min-w-0 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-background px-3 focus-within:border-accent">
            <Search size={16} className="shrink-0 text-subtle" aria-hidden="true" />
            <input autoFocus type="search" value={keyword} onChange={(event) => { setKeyword(event.target.value); resetResults(); }} aria-label={t("characterProfiles.searchLabel")} placeholder={t("characterProfiles.searchPlaceholder")} className="h-10 min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-subtle" />
            {keyword && <button type="button" onClick={() => { setKeyword(""); resetResults(); }} aria-label={t("characterProfiles.clearSearch")} className="grid size-6 cursor-pointer place-items-center text-subtle hover:text-white"><X size={14} /></button>}
          </div>
          <button type="submit" disabled={keyword.trim().length < 2 || searchStatus === "loading"} className="h-10 w-full cursor-pointer rounded-[var(--radius-md)] bg-accent px-5 text-[13px] font-semibold text-on-accent hover:bg-[var(--gold-bright)] disabled:cursor-not-allowed disabled:opacity-60">{t(searchStatus === "loading" ? "characterProfiles.searching" : "characterProfiles.search")}</button>
        </form>
        {searchStatus === "idle" && <p className="py-7 text-center text-[12px] text-subtle">{t("characterProfiles.searchHint")}</p>}
        {searchStatus === "loading" && <p role="status" className="py-7 text-center text-[12px] text-subtle">{t("characterProfiles.searching")}</p>}
        {searchStatus === "error" && <p role="alert" className="py-7 text-center text-[12px] text-danger-text">{t("characterProfiles.searchError")}</p>}
        {searchStatus === "ready" && <div className="mt-5 space-y-2">
          <h3 className="text-[12px] font-semibold text-white">{t("characterProfiles.results")}</h3>
          {results.length === 0 && <p className="py-4 text-[12px] text-subtle">{t("characterProfiles.noResults")}</p>}
          {results.map((character) => {
            const key = characterKey(character);
            const linked = linkedKeys.has(key);
            const portrait = characterProfileImageUrl(character.profileImageUrl);
            const classKey = characterClassKeyForPcId(character.pcId);
            return <button key={key} type="button" onClick={() => void link(character)} disabled={linked || linkingKey !== null} className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border bg-background/60 px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft disabled:cursor-default disabled:opacity-65">
              <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-border bg-elevated text-accent">{character.name.charAt(0)}{portrait && <img src={portrait} alt="" onError={(event) => { event.currentTarget.hidden = true; }} className="absolute inset-0 size-full object-cover" />}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-white">{character.name}</span><span className="block truncate text-[11px] text-subtle">{character.serverName}{classKey && <> · {t(`characterProfiles.classes.${classKey}`)}</>} · {t("characterProfiles.level", { level: character.level })}</span></span>
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-accent"><Link2 size={13} aria-hidden="true" />{t(linked ? "characterProfiles.linked" : linkingKey === key ? "characterProfiles.linking" : "characterProfiles.link")}</span>
            </button>;
          })}
          {hasMore && <p className="text-[11px] text-subtle">{t("characterProfiles.refineSearch", { count: resultTotal.toLocaleString(i18n.language) })}</p>}
          {hasMore && <button type="button" onClick={onLoadMore} disabled={loadingMore} className="w-full cursor-pointer rounded-[var(--radius-md)] border border-border px-3 py-2.5 text-[12px] font-semibold text-accent hover:border-accent/50 disabled:cursor-wait disabled:opacity-60">{t(loadingMore ? "characterProfiles.searching" : "characterProfiles.loadMore")}</button>}
          {loadMoreError && <p role="alert" className="text-[12px] text-danger-text">{t("characterProfiles.searchError")}</p>}
        </div>}
        {linkError && <p role="alert" className="mt-3 text-[12px] text-danger-text">{t("characterProfiles.linkError")}</p>}
      </div>
    </div>
  </dialog>;
};

export default AddCharacterDialog;
