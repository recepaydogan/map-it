import { Check, ChevronLeft, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useGameNames } from "../../i18n/use-game-names";
import { cn } from "../../lib/cn";
import { contentUrl } from "../../lib/content-url";
import type { MapCharacterDraft, MapCharacterProfile, MapCharacterProfession } from "./map-character-profiles";

interface RaceOption {
  id: string; name: string; faction: "alliance" | "horde" | "both"; icon: string;
  classes: { id: string; name: string; icon: string }[];
}
interface ProfessionOption { id: string; name: string; kind: "primary" | "secondary"; icon: string }
interface CharacterOptions { races: RaceOption[]; professions: ProfessionOption[] }

interface MapCharacterModalProps {
  character?: MapCharacterProfile | null;
  onClose: () => void;
  onSave: (draft: MapCharacterDraft, existingId?: string) => void;
  onRemove: (id: string) => void;
}

const buttonBase = "cursor-pointer rounded-[var(--radius-md)] border text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent";
const iconUrl = (path: string) => contentUrl(path);

export default function MapCharacterModal({ character, onClose, onSave, onRemove }: MapCharacterModalProps) {
  const { t } = useTranslation();
  const { raceName, className, professionName } = useGameNames();
  const [options, setOptions] = useState<CharacterOptions>();
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState(character?.name ?? "");
  const [raceId, setRaceId] = useState(character?.raceId ?? "");
  const [classId, setClassId] = useState(character?.classId ?? "");
  const [faction, setFaction] = useState<"alliance" | "horde">(character?.faction ?? "alliance");
  const [level, setLevel] = useState(character?.level ?? 1);
  const [professions, setProfessions] = useState<MapCharacterProfession[]>(character?.professions ?? []);
  const [formError, setFormError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(contentUrl("data/races/catalog.json")).then((response) => {
        if (!response.ok) throw new Error(`Races: ${response.status}`);
        return response.json() as Promise<{ races: RaceOption[] }>;
      }),
      fetch(contentUrl("data/professions/catalog.json")).then((response) => {
        if (!response.ok) throw new Error(`Professions: ${response.status}`);
        return response.json() as Promise<{ professions: ProfessionOption[] }>;
      }),
    ]).then(([races, professionCatalog]) => {
      if (active) setOptions({ races: races.races, professions: professionCatalog.professions });
    }).catch(() => { if (active) setLoadError(true); });
    const frame = window.requestAnimationFrame(() => nameRef.current?.focus());
    return () => { active = false; window.cancelAnimationFrame(frame); };
  }, []);

  const race = options?.races.find((entry) => entry.id === raceId);
  const availableClasses = race?.classes ?? [];
  const primaryCount = professions.filter((entry) => options?.professions.some((option) => option.id === entry.id && option.kind === "primary")).length;
  const selectedProfessionIds = useMemo(() => new Set(professions.map((entry) => entry.id)), [professions]);
  const selectRace = (option: RaceOption) => {
    setRaceId(option.id);
    if (!option.classes.some((entry) => entry.id === classId)) setClassId("");
    if (option.faction !== "both") setFaction(option.faction);
    setFormError("");
  };
  const toggleProfession = (option: ProfessionOption) => {
    setProfessions((current) => current.some((entry) => entry.id === option.id)
      ? current.filter((entry) => entry.id !== option.id)
      : option.kind === "primary" && primaryCount >= 2 ? current : [...current, { id: option.id, skill: null }]);
  };
  const setSkill = (id: string, value: string) => {
    const number = value === "" ? null : Number(value);
    setProfessions((current) => current.map((entry) => entry.id === id
      ? { ...entry, skill: number !== null && Number.isFinite(number) ? number : null } : entry));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!options || !race || !name.trim() || !availableClasses.some((entry) => entry.id === classId)
      || !Number.isInteger(level) || level < 1 || level > 60
      || professions.some((entry) => entry.skill !== null && (!Number.isInteger(entry.skill) || entry.skill < 1 || entry.skill > 300))) {
      setFormError(t("map.characters.formError"));
      return;
    }
    onSave({ name: name.trim().slice(0, 24), raceId, classId,
      faction: race.faction === "both" ? faction : race.faction, level, professions }, character?.id);
    onClose();
  };
  const trapKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); return; }
    if (event.key !== "Tab") return;
    const elements = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled])') ?? [])];
    if (!elements.length) return;
    const first = elements[0]!;
    const last = elements[elements.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return <div className="pointer-events-auto absolute inset-0 z-[70] grid place-items-center bg-black/75 p-3 backdrop-blur-[5px] sm:p-6"
    data-map-ui onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="map-character-modal-title"
      onKeyDown={trapKeyboard}
      className="flex max-h-full w-full max-w-[720px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[#4b4842] bg-[#1c1c1c] text-[#eee8dd] shadow-[0_24px_80px_rgba(0,0,0,.65)]">
      <header className="flex shrink-0 items-start gap-3 border-b border-[#4b4842] px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[.17em] text-[#d1ac47]">{t("map.characters.eyebrow")}</p>
          <h2 id="map-character-modal-title" className="mt-0.5 text-lg font-semibold text-white">
            {t(character ? "map.characters.editTitle" : "map.characters.createTitle")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[#c9c0b2]">{t("map.characters.modalDescription")}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t("map.characters.close")}
          className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-[#c9c0b2] hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="scroll-slim min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {loadError && <p role="alert" className="rounded-[var(--radius-md)] border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">{t("map.characters.loadError")}</p>}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
            <label className="block text-xs font-semibold text-[#e7dcc8]">
              {t("map.characters.name")}
              <input ref={nameRef} value={name} maxLength={24} required onChange={(event) => setName(event.target.value)}
                placeholder={t("map.characters.namePlaceholder")}
                className="mt-1.5 h-10 w-full rounded-[var(--radius-md)] border border-[#65533b] bg-transparent px-3 text-sm text-white outline-none placeholder:text-[#9f9585] focus:border-[#d1ac47]" />
            </label>
            <label className="block text-xs font-semibold text-[#e7dcc8]">
              {t("map.characters.level")}
              <input type="number" min={1} max={60} value={level} required onChange={(event) => setLevel(Number(event.target.value))}
                className="mt-1.5 h-10 w-full rounded-[var(--radius-md)] border border-[#65533b] bg-transparent px-3 text-sm text-white outline-none focus:border-[#d1ac47]" />
            </label>
          </div>

          <section aria-labelledby="map-character-race-title">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 id="map-character-race-title" className="text-sm font-semibold text-white">{t("map.characters.race")}</h3>
              <span className="text-xs text-[#baaf9f]">{t("map.characters.chooseRace")}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {options?.races.map((option) => <button key={option.id} type="button" onClick={() => selectRace(option)}
                aria-pressed={raceId === option.id}
                className={cn(buttonBase, "flex min-h-14 items-center gap-2.5 p-2",
                  raceId === option.id ? "border-[#d1ac47]" : "border-[#53483a] hover:border-[#9d8350]")}
              >
                <img src={iconUrl(option.icon)} alt="" className="h-10 w-10 shrink-0 rounded-[var(--radius-sm)] object-cover" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">{raceName(option.id, option.name)}</span>
                {raceId === option.id && <Check size={15} className="shrink-0 text-[#e6c76e]" aria-hidden="true" />}
              </button>)}
            </div>
            {race?.faction === "both" && <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="mr-1 font-semibold text-[#e7dcc8]">{t("map.characters.faction")}</span>
              {(["alliance", "horde"] as const).map((side) => <button key={side} type="button" onClick={() => setFaction(side)}
                aria-pressed={faction === side}
                className={cn(buttonBase, "px-3 py-1.5 font-semibold", faction === side
                  ? "border-[#d1ac47] text-white" : "border-[#53483a] text-[#d0c7b8] hover:border-[#9d8350]")}
              >{t(`map.characters.factions.${side}`)}</button>)}
            </div>}
          </section>

          <section aria-labelledby="map-character-class-title">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 id="map-character-class-title" className="text-sm font-semibold text-white">{t("map.characters.class")}</h3>
              <span className="text-xs text-[#baaf9f]">{t("map.characters.chooseClass")}</span>
            </div>
            {!race && <p className="mt-2 text-xs text-[#c9c0b2]">{t("map.characters.selectRaceFirst")}</p>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {availableClasses.map((option) => <button key={option.id} type="button" onClick={() => setClassId(option.id)}
                aria-pressed={classId === option.id}
                className={cn(buttonBase, "flex min-h-12 items-center gap-2 p-2",
                  classId === option.id ? "border-[#d1ac47]" : "border-[#53483a] hover:border-[#9d8350]")}
              >
                <img src={iconUrl(option.icon)} alt="" className="h-8 w-8 shrink-0 rounded-[var(--radius-sm)] object-cover" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">{className(option.id, option.name)}</span>
                {classId === option.id && <Check size={15} className="shrink-0 text-[#e6c76e]" aria-hidden="true" />}
              </button>)}
            </div>
          </section>

          <section aria-labelledby="map-character-professions-title">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 id="map-character-professions-title" className="text-sm font-semibold text-white">{t("map.characters.professions")}</h3>
                <p className="mt-0.5 text-xs text-[#baaf9f]">{t("map.characters.professionHint")}</p>
              </div>
            </div>
            {(["primary", "secondary"] as const).map((kind) => <div key={kind} className="mb-4 last:mb-0">
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[.12em] text-[#d2b96f]">
                {t(kind === "primary" ? "map.characters.primaryProfessions" : "map.characters.secondaryProfessions")}
                {kind === "primary" && <span className="ml-2 font-medium normal-case tracking-normal text-[#baaf9f]">{primaryCount}/2</span>}
              </h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {options?.professions.filter((option) => option.kind === kind).map((option) => {
                  const selected = selectedProfessionIds.has(option.id);
                  const disabled = !selected && kind === "primary" && primaryCount >= 2;
                  return <button key={option.id} type="button" disabled={disabled} onClick={() => toggleProfession(option)}
                    aria-pressed={selected}
                    className={cn(buttonBase, "flex min-h-11 items-center gap-2 p-2 disabled:cursor-not-allowed disabled:opacity-45",
                      selected ? "border-[#d1ac47]" : "border-[#53483a] hover:border-[#9d8350]")}
                  >
                    <img src={iconUrl(option.icon)} alt="" className="h-7 w-7 shrink-0 rounded-[var(--radius-sm)] object-cover" />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">{professionName(option.id, option.name)}</span>
                    {selected && <Check size={14} className="shrink-0 text-[#e6c76e]" aria-hidden="true" />}
                  </button>;
                })}
              </div>
            </div>)}
            {professions.length > 0 && <div className="mt-3 rounded-[var(--radius-md)] border border-[#53483a] p-3">
              <p className="mb-2 text-xs font-semibold text-[#e7dcc8]">{t("map.characters.skillLevels")}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {professions.map((entry) => {
                  const option = options?.professions.find((item) => item.id === entry.id);
                  return option && <label key={entry.id} className="block text-xs text-[#c9c0b2]">
                    {professionName(option.id, option.name)}
                    <input type="number" min={1} max={300} value={entry.skill ?? ""} placeholder={t("map.characters.skillOptional")}
                      onChange={(event) => setSkill(entry.id, event.target.value)}
                      className="mt-1 h-9 w-full rounded-[var(--radius-sm)] border border-[#65533b] bg-transparent px-2.5 text-sm text-white outline-none placeholder:text-[#9f9585] focus:border-[#d1ac47]" />
                  </label>;
                })}
              </div>
            </div>}
          </section>
          {formError && <p role="alert" className="text-xs text-red-200">{formError}</p>}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#4b4842] px-5 py-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-xs font-semibold text-[#d0c7b8] hover:bg-white/5 hover:text-white">
              <ChevronLeft size={15} aria-hidden="true" />{t("map.characters.cancel")}
            </button>
            {character && !confirmRemove && <button type="button" onClick={() => setConfirmRemove(true)}
              className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/10">
              <Trash2 size={14} aria-hidden="true" />{t("map.characters.remove")}
            </button>}
          </div>
          {character && confirmRemove ? <div className="flex items-center gap-2">
            <span className="text-xs text-red-100">{t("map.characters.removeConfirm")}</span>
            <button type="button" onClick={() => setConfirmRemove(false)} className="cursor-pointer rounded-[var(--radius-md)] px-2 py-2 text-xs text-white hover:bg-white/10">{t("map.characters.keep")}</button>
            <button type="button" onClick={() => { onRemove(character.id); onClose(); }} className="cursor-pointer rounded-[var(--radius-md)] bg-red-700 px-3 py-2 text-xs font-bold text-white hover:bg-red-600">{t("map.characters.remove")}</button>
          </div> : <button type="submit" disabled={!options || !name.trim() || !raceId || !classId}
            className="min-h-10 cursor-pointer rounded-[var(--radius-md)] border border-[#65533b] px-5 text-xs font-bold text-white transition-colors hover:border-[#d1ac47] disabled:cursor-not-allowed disabled:opacity-50">
            {t(character ? "map.characters.saveChanges" : "map.characters.createAction")}
          </button>}
        </footer>
      </form>
    </div>
  </div>;
}
