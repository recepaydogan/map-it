import { Check, ChevronDown, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { contentUrl } from "../../lib/content-url";
import { useGameNames } from "../../i18n/use-game-names";
import type { MapCharacterProfile } from "./map-character-profiles";

interface MapPrimaryControlsProps {
  filtersOpen: boolean;
  filtersLocked?: boolean;
  activeFilterCount: number;
  onToggleFilters: () => void;
  characters: MapCharacterProfile[];
  selectedCharacterId: string | null;
  onSelectCharacter: (id: string | null) => void;
  onCreateCharacter: () => void;
  onEditCharacter: (character: MapCharacterProfile) => void;
  onRemoveCharacter: (id: string) => void;
}

/** Filters and character profiles share the map's top-left toolbar. */
const MapPrimaryControls = ({
  filtersOpen,
  filtersLocked = false,
  activeFilterCount,
  onToggleFilters,
  characters,
  selectedCharacterId,
  onSelectCharacter,
  onCreateCharacter,
  onEditCharacter,
  onRemoveCharacter,
}: MapPrimaryControlsProps) => {
  const { t } = useTranslation();
  const { raceName, className } = useGameNames();
  const [menuOpen, setMenuOpen] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
        setRemoveId(null);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [menuOpen]);
  const selectedCharacter = characters.find((character) => character.id === selectedCharacterId);
  const filterLabel = t(filtersLocked ? "map.filters.title" : filtersOpen ? "map.sidebar.collapse" : "map.filters.open");

  return (
    <div className="map-primary-controls" data-map-ui>
      <div className="map-filter-trigger-frame">
        <button
          type="button"
          data-tour="filters-trigger"
          onClick={onToggleFilters}
          disabled={filtersLocked}
          aria-expanded={filtersOpen}
          aria-label={filterLabel}
          title={filterLabel}
          className="map-filter-trigger"
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
          {activeFilterCount > 0 && <span className="map-filter-count">{activeFilterCount}</span>}
        </button>
      </div>
      {characters.length === 0 ? <button ref={triggerRef} type="button" onClick={onCreateCharacter}
        className="map-characters-trigger">
        {t("map.characters.manageTitle")}
      </button> : <div ref={menuRef} className="relative" onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        setRemoveId(null);
        setMenuOpen(false);
        triggerRef.current?.focus();
      }}>
        <button ref={triggerRef} type="button" onClick={() => { setMenuOpen((open) => !open); setRemoveId(null); }}
          aria-expanded={menuOpen} aria-controls={menuOpen ? "map-characters-menu" : undefined}
          className="map-characters-trigger">
          <span className="max-w-40 truncate">{selectedCharacter ? (selectedCharacter.name || t("gepSync.currentCharacter")) : t("map.characters.yourCharacters")}</span>
          <ChevronDown size={14} className={cn("transition-transform", menuOpen && "rotate-180")} aria-hidden="true" />
        </button>
        {menuOpen && <div id="map-characters-menu" className="map-characters-menu">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
            <strong className="text-xs font-semibold text-zinc-100">{t("map.characters.yourCharacters")}</strong>
            <button type="button" onClick={() => { setMenuOpen(false); onCreateCharacter(); }}
              aria-label={t("map.characters.addCharacter")} title={t("map.characters.addCharacter")}
              className="grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-md)] border border-border text-zinc-100 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent">
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="scroll-slim max-h-64 space-y-1.5 overflow-y-auto p-1.5">
            {characters.map((character) => <div key={character.id} className={cn("rounded-[var(--radius-md)] border",
              selectedCharacterId === character.id ? "border-accent/60" : "border-border hover:bg-surface-hover")}>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => { onSelectCharacter(character.id); setMenuOpen(false); }}
                  aria-current={selectedCharacterId === character.id ? "true" : undefined}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-accent">
                  {character.classId && <img src={contentUrl(`data/classes/icons/class_${character.classId}.jpg`)} alt=""
                    className="h-9 w-9 shrink-0 rounded-[var(--radius-sm)] border border-border object-cover" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-white">{character.name || t("gepSync.currentCharacter")}{character.realm && <span className="font-normal text-subtle"> · {character.realm}</span>}</span>
                    <span className="block truncate text-[11px] text-zinc-300">
                      {[character.level !== null ? t("map.characters.levelShort", { level: character.level }) : null, character.raceId ? raceName(character.raceId, t(`map.characters.raceNames.${character.raceId}`)) : null, character.classId ? className(character.classId, t(`map.characters.classNames.${character.classId}`)) : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
                {character.source ? <span className="mx-1 text-success-text" title={t("characterSync.syncedProfile")}><Check size={16} aria-label={t("characterSync.syncedProfile")} /></span> : <button type="button" onClick={() => { setMenuOpen(false); onEditCharacter(character); }}
                  aria-label={t("map.characters.editCharacter", { name: character.name })}
                  className="mr-1 grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-300 hover:bg-surface-hover hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
                  <Pencil size={14} aria-hidden="true" />
                </button>}
                <button type="button" onClick={() => setRemoveId(character.id)}
                  aria-label={`${t("map.characters.remove")}: ${character.name || t("gepSync.currentCharacter")}${character.realm ? ` · ${character.realm}` : ""}`}
                  title={t("map.characters.remove")} aria-expanded={removeId === character.id}
                  className="mr-1 grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-300 hover:bg-surface-hover hover:text-red-200 focus-visible:outline-2 focus-visible:outline-accent">
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
              {removeId === character.id && <div className="space-y-2 border-t border-border px-2 py-2">
                <p role="status" className="text-xs text-red-100">{t("map.characters.removeConfirm")}</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => setRemoveId(null)}
                    className="cursor-pointer rounded-[var(--radius-md)] px-2 py-1.5 text-xs text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent">{t("map.characters.keep")}</button>
                  <button type="button" onClick={() => {
                    onRemoveCharacter(character.id);
                    setRemoveId(null);
                    setMenuOpen(false);
                    window.requestAnimationFrame(() => triggerRef.current?.focus());
                  }} className="cursor-pointer rounded-[var(--radius-md)] border border-red-400/50 px-2 py-1.5 text-xs font-semibold text-red-200 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-accent">{t("map.characters.remove")}</button>
                </div>
              </div>}
            </div>)}
          </div>
        </div>}
      </div>}
    </div>
  );
};

export default MapPrimaryControls;
