import { Link2, Plus, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { clearLeaderboardPageCache } from "../leaderboard/leaderboard-api";
import AddCharacterDialog from "./add-character-dialog";
import CharacterProfileDetail from "./character-profile-detail";
import { characterProfileImageUrl } from "./character-profile-image-url";
import UnlinkCharacterDialog from "./unlink-character-dialog";
import { loadCharacterProfile, readCachedCharacterProfile, type CharacterProfileData, type CharacterSearchResult } from "./character-profile-api";
import { LAST_CHARACTER_KEY } from "./character-profile-store";
import {
  addAccountCharacter, addGuestCharacter, characterKey, LINKED_CHARACTERS_CHANGE_EVENT,
  LINKED_CHARACTERS_KEY, loadAccountLinkedCharacters, readGuestLinkedCharacters,
  removeAccountCharacter, removeGuestCharacter, saveGuestCharacterProfile, type LinkedCharacter,
} from "./linked-characters";

const activeKeyStorage = (userId: string | null) => `character-profiles:active:${userId ?? "guest"}`;
const readActiveKey = (userId: string | null): string | null => {
  try { return localStorage.getItem(activeKeyStorage(userId)); }
  catch (error) { console.warn("Could not read the active character", error); return null; }
};

const MyCharactersView = ({ userId }: { userId: string | null }) => {
  const { t } = useTranslation();
  const [guest, setGuest] = useState<LinkedCharacter[]>(() => readGuestLinkedCharacters(!userId));
  const [account, setAccount] = useState<{ userId: string; characters: LinkedCharacter[]; error: boolean } | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const [activeKey, setActiveKey] = useState<string | null>(() => readActiveKey(userId));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmingCharacter, setConfirmingCharacter] = useState<CharacterSearchResult | null>(null);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState(false);
  const [profile, setProfile] = useState<{ key: string; revision: number; data: CharacterProfileData | null; error: boolean } | null>(null);
  const [portraits, setPortraits] = useState<Record<string, string>>({});
  const [profileRevision, setProfileRevision] = useState(0);
  const [updateFeedback, setUpdateFeedback] = useState<{ key: string; revision: number } | null>(null);
  const refreshRequested = useRef(false);

  useEffect(() => {
    if (!updateFeedback) return;
    const timeout = window.setTimeout(() => setUpdateFeedback((current) => current === updateFeedback ? null : current), 3000);
    return () => window.clearTimeout(timeout);
  }, [updateFeedback]);

  useEffect(() => {
    const reload = () => setGuest(readGuestLinkedCharacters(!userId));
    const onStorage = (event: StorageEvent) => {
      if (event.key === LINKED_CHARACTERS_KEY || event.key === LAST_CHARACTER_KEY) reload();
    };
    window.addEventListener(LINKED_CHARACTERS_CHANGE_EVENT, reload);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(LINKED_CHARACTERS_CHANGE_EVENT, reload);
      window.removeEventListener("storage", onStorage);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void loadAccountLinkedCharacters(userId).then((characters) => {
      if (!cancelled) setAccount({ userId, characters, error: false });
    }).catch((error: unknown) => {
      console.error("Failed to load linked characters", error);
      if (!cancelled) setAccount({ userId, characters: [], error: true });
    });
    return () => { cancelled = true; };
  }, [userId, loadRevision]);

  const accountReady = !userId || account?.userId === userId && !account.error;
  const characters = userId ? account?.userId === userId ? account.characters : [] : guest;
  const selected = characters.find((entry) => characterKey(entry.character) === activeKey) ?? characters[0] ?? null;
  const selectedKey = selected ? characterKey(selected.character) : null;
  const visibleProfile = (profile?.key === selectedKey ? profile.data : null)
    ?? (selected ? readCachedCharacterProfile(selected.character) ?? selected.profileSnapshot ?? null : null);
  const profileStatus = !selected ? "idle" : profile?.key === selectedKey && profile.revision !== profileRevision ? "loading"
    : profile?.key === selectedKey && profile.error ? "error" : visibleProfile ? "ready" : "loading";

  useEffect(() => {
    if (!selected) return;
    const key = characterKey(selected.character);
    const controller = new AbortController();
    const fresh = refreshRequested.current;
    refreshRequested.current = false;
    const needsApiFetch = fresh || !readCachedCharacterProfile(selected.character);
    void loadCharacterProfile(selected.character, controller.signal, needsApiFetch).then(async (data) => {
      if (!controller.signal.aborted) {
        const saveSnapshot = async () => {
          if (!userId) saveGuestCharacterProfile(selected.character, data);
        };
        if (fresh) {
          await saveSnapshot();
          clearLeaderboardPageCache();
        }
        if (controller.signal.aborted) return;
        setProfile({ key, revision: profileRevision, data, error: false });
        if (fresh) setUpdateFeedback({ key, revision: profileRevision });
        const portrait = data.profile.profileImage;
        if (portrait) setPortraits((current) => ({ ...current, [key]: portrait }));
        if (needsApiFetch && !fresh) void saveSnapshot()
          .catch((error: unknown) => console.error("Failed to save character profile snapshot", error));
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      console.error("Failed to load character profile", error);
      if (fresh) setUpdateFeedback(null);
      setProfile((current) => ({ key, revision: profileRevision, data: current?.key === key ? current.data : null, error: true }));
    });
    return () => controller.abort();
  }, [selected, profileRevision, userId]);

  const choose = (character: CharacterSearchResult) => {
    const key = characterKey(character);
    setActiveKey(key);
    try { localStorage.setItem(activeKeyStorage(userId), key); }
    catch (error) { console.warn("Could not remember the active character", error); }
  };

  const link = async (character: CharacterSearchResult) => {
    if (userId) {
      const linked = await addAccountCharacter(userId, character);
      setAccount((current) => current?.userId === userId ? {
        ...current,
        characters: current.characters.some((entry) => characterKey(entry.character) === characterKey(character))
          ? current.characters : [linked, ...current.characters],
      } : current);
    } else setGuest(addGuestCharacter(character));
    choose(character);
  };

  const unlink = async (character: CharacterSearchResult) => {
    const key = characterKey(character);
    setRemovingKey(key);
    setRemoveError(false);
    try {
      if (userId) {
        await removeAccountCharacter(userId, character);
        setAccount((current) => current?.userId === userId ? {
          ...current, characters: current.characters.filter((entry) => characterKey(entry.character) !== key),
        } : current);
      } else setGuest(removeGuestCharacter(character));
      if (selectedKey === key) {
        setActiveKey(null);
        try { localStorage.removeItem(activeKeyStorage(userId)); }
        catch (error) { console.warn("Could not clear the active character", error); }
      }
      setConfirmingCharacter(null);
    } catch (error) {
      console.error("Failed to unlink character", error);
      setRemoveError(true);
    } finally { setRemovingKey(null); }
  };

  const refreshProfile = () => {
    refreshRequested.current = true;
    setUpdateFeedback(null);
    setProfileRevision((value) => value + 1);
  };

  const refreshState = profileStatus === "loading" && visibleProfile ? "updating"
    : updateFeedback?.key === selectedKey && updateFeedback.revision === profileRevision && profileStatus === "ready" ? "updated" : "idle";

  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 lg:px-7">
      <div><h2 className="text-[16px] font-semibold text-white">{t("characterProfiles.myCharacters")}</h2>
        <p className="mt-0.5 text-[12px] text-subtle">{t("characterProfiles.myCharactersIntro")}</p></div>
      <button type="button" onClick={() => setDialogOpen(true)} disabled={!accountReady} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] bg-accent px-3.5 text-[12px] font-semibold text-on-accent hover:bg-[var(--gold-bright)] disabled:cursor-wait disabled:opacity-60"><Plus size={15} aria-hidden="true" />{t("characterProfiles.addCharacter")}</button>
    </div>
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:px-7">
      <div className="mx-auto max-w-6xl space-y-5">
        {userId && account?.userId !== userId && <p role="status" className="rounded-[var(--radius-md)] border border-border bg-surface px-4 py-6 text-center text-[12px] text-subtle">{t("characterProfiles.loadingLinked")}</p>}
        {userId && account?.userId === userId && account.error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-danger/30 bg-surface px-4 py-4 text-[12px] text-danger-text"><span>{t("characterProfiles.loadLinkedError")}</span><button type="button" onClick={() => setLoadRevision((value) => value + 1)} className="cursor-pointer rounded border border-border px-3 py-1.5 text-white hover:bg-surface-hover">{t("characterProfiles.retry")}</button></div>}
        {accountReady && characters.length === 0 && <div className="rounded-[var(--radius-lg)] border border-dashed border-accent/30 bg-surface/60 px-6 py-14 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full border border-accent/30 bg-accent-soft text-accent"><Link2 size={22} aria-hidden="true" /></div>
          <h3 className="mt-4 text-[17px] font-semibold text-white">{t("characterProfiles.emptyLinkedTitle")}</h3>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-5 text-subtle">{t("characterProfiles.emptyLinkedBody")}</p>
          <button type="button" onClick={() => setDialogOpen(true)} className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 py-2 text-[12px] font-semibold text-on-accent hover:bg-[var(--gold-bright)]"><Plus size={15} aria-hidden="true" />{t("characterProfiles.addCharacter")}</button>
        </div>}
        {characters.length > 0 && <section aria-label={t("characterProfiles.linkedList")} className="flex flex-wrap gap-2">{characters.map(({ character }) => {
          const key = characterKey(character);
          const portrait = characterProfileImageUrl(portraits[key] ?? character.profileImageUrl);
          return <div key={key} className={cn("flex h-12 w-[min(100%,228px)] min-w-0 items-center rounded-[var(--radius-md)] border bg-surface transition-colors", key === selectedKey ? "border-accent/60 bg-accent-soft" : "border-border hover:border-accent/35")}>
            <button type="button" onClick={() => choose(character)} aria-current={key === selectedKey ? "true" : undefined} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-accent">
              <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-border bg-background text-accent"><UserRound size={15} aria-hidden="true" />{portrait && <img key={portrait} src={portrait} alt="" onError={(event) => { event.currentTarget.hidden = true; }} className="absolute inset-0 size-full object-cover" />}</span>
              <span className="min-w-0"><span className="block truncate text-[12px] font-semibold text-white">{character.name}</span><span className="block truncate text-[10px] text-subtle">{character.serverName} · {t(`characterProfiles.regions.${character.region}`)}</span></span>
            </button>
            <button type="button" onClick={() => { setRemoveError(false); setConfirmingCharacter(character); }} disabled={removingKey === key} aria-label={t("characterProfiles.unlinkCharacter", { name: character.name })} title={t("characterProfiles.unlinkCharacter", { name: character.name })} className="mr-1.5 grid size-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-subtle hover:bg-danger/10 hover:text-danger-text focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50"><X size={14} aria-hidden="true" /></button>
          </div>;
        })}</section>}
        {selected && profileStatus === "loading" && !visibleProfile && <p role="status" className="rounded-[var(--radius-md)] border border-border bg-surface px-5 py-10 text-center text-[12px] text-subtle">{t("characterProfiles.loadingProfile")}</p>}
        {selected && profileStatus === "error" && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-danger/30 bg-surface px-4 py-4 text-[12px] text-danger-text"><span>{t(visibleProfile ? "characterProfiles.refreshError" : "characterProfiles.profileError")}</span><button type="button" onClick={refreshProfile} className="cursor-pointer rounded border border-border px-3 py-1.5 text-white hover:bg-surface-hover">{t("characterProfiles.retry")}</button></div>}
        {selected && visibleProfile && <CharacterProfileDetail key={selectedKey} data={visibleProfile} region={selected.character.region} refreshState={refreshState} onRefresh={refreshProfile} />}
      </div>
    </div>
    {dialogOpen && <AddCharacterDialog linkedKeys={new Set(characters.map(({ character }) => characterKey(character)))} onLink={link} onClose={() => setDialogOpen(false)} />}
    {confirmingCharacter && <UnlinkCharacterDialog name={confirmingCharacter.name} pending={removingKey === characterKey(confirmingCharacter)} error={removeError} onConfirm={() => void unlink(confirmingCharacter)} onClose={() => setConfirmingCharacter(null)} />}
  </div>;
};

export default MyCharactersView;
