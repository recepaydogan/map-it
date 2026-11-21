import { GAME_CONFIG } from "../../game-config";
import { ChevronDown, Pencil, Plus, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { contentUrl } from "../../lib/content-url";
import { useGameNames } from "../../i18n/use-game-names";
import type { MapCharacterProfile } from "./map-character-profiles";

interface MapPrimaryControlsProps {
  filtersOpen: boolean;
  activeFilterCount: number;
  onToggleFilters: () => void;
  characters: MapCharacterProfile[];
  selectedCharacterId: string | null;
  onSelectCharacter: (id: string | null) => void;
  onCreateCharacter: () => void;
  onEditCharacter: (character: MapCharacterProfile) => void;
}

/** Filters and character profiles share the map's top-left toolbar. */
const MapPrimaryControls = ({
  filtersOpen,
  activeFilterCount,
  onToggleFilters,
  characters,
  selectedCharacterId,
  onSelectCharacter,
  onCreateCharacter,
  onEditCharacter,
}: MapPrimaryControlsProps) => {
  const { t } = useTranslation();
  const { raceName, className } = useGameNames();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [menuOpen]);
  const filterLabel = t(filtersOpen ? "map.sidebar.collapse" : "map.filters.open");

  return (
    <div className="map-primary-controls" data-map-ui>
      <div className="map-filter-trigger-frame">
        <button
          type="button"
          data-tour="filters-trigger"
          onClick={onToggleFilters}
          aria-expanded={filtersOpen}
          aria-label={filterLabel}
          title={filterLabel}
          className="map-filter-trigger"
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
          {activeFilterCount > 0 && <span className="map-filter-count">{activeFilterCount}</span>}
        </button>
      </div>
      {GAME_CONFIG.features.characterProfiles && (characters.length === 0 ? <button type="button" onClick={onCreateCharacter}
        className="map-characters-trigger">
        {t("map.characters.createTop")}
      </button> : <div ref={menuRef} className="relative">
        <button type="button" onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen} aria-controls={menuOpen ? "map-characters-menu" : undefined}
          className={cn("map-characters-trigger", menuOpen && "map-characters-trigger-open")}>
          {t("map.characters.yourCharacters")}
          <span className="text-[#c9c0b2] text-[10px] tabular-nums">{characters.length}</span>
          <ChevronDown size={14} className={cn("transition-transform", menuOpen && "rotate-180")} aria-hidden="true" />
        </button>
        {menuOpen && <div id="map-characters-menu" className="map-characters-menu">
          <div className="flex items-center justify-between gap-2 border-b border-[#4b4842] px-3 py-2.5">
            <strong className="text-xs font-semibold text-white">{t("map.characters.yourCharacters")}</strong>
            <button type="button" onClick={() => { setMenuOpen(false); onCreateCharacter(); }}
              aria-label={t("map.characters.addCharacter")} title={t("map.characters.addCharacter")}
              className="grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-md)] border border-[#65533b] text-white hover:border-[#d1ac47] focus-visible:outline-2 focus-visible:outline-accent">
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="scroll-slim max-h-64 space-y-1.5 overflow-y-auto p-1.5">
            {characters.map((character) => <div key={character.id} className={cn("flex items-center gap-1 rounded-[var(--radius-md)] border",
              selectedCharacterId === character.id ? "border-[#d1ac47]" : "border-[#53483a] hover:border-[#9d8350]")}>
              <button type="button" onClick={() => { onSelectCharacter(character.id); setMenuOpen(false); }}
                aria-current={selectedCharacterId === character.id ? "true" : undefined}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-accent">
                <img src={contentUrl(`data/classes/icons/class_${character.classId}.jpg`)} alt=""
                  className="h-9 w-9 shrink-0 rounded-[var(--radius-sm)] border border-[#645538] object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-white">{character.name}</span>
                  <span className="block truncate text-[11px] text-[#c9c0b2]">
                    {t("map.characters.levelShort", { level: character.level })} · {raceName(character.raceId, t(`map.characters.raceNames.${character.raceId}`))} · {className(character.classId, t(`map.characters.classNames.${character.classId}`))}
                  </span>
                </span>
              </button>
              <button type="button" onClick={() => { setMenuOpen(false); onEditCharacter(character); }}
                aria-label={t("map.characters.editCharacter", { name: character.name })}
                className="mr-1 grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-[#c9c0b2] hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
                <Pencil size={14} aria-hidden="true" />
              </button>
            </div>)}
          </div>
        </div>}
      </div>)}
    </div>
  );
};

export default MapPrimaryControls;
