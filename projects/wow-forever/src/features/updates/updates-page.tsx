import { ArrowLeft, Bell } from "lucide-react";
import { Fragment, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { openReference } from "../reference/reference-navigation";
import type { ReferenceTarget } from "../reference/reference-types";
import { contentUrl } from "../../lib/content-url";
import PositionTrackerReleaseNote from "./position-tracker-release-note";
import { UPDATES_VERSION } from "./updates-release";

type LinkedNote = { target: "dalaran" | "appearance" | "profession-leveling"; before: string; link: string; after: string };
type MapFilterCategoryId = "book" | "rare" | "npc";
type MapFiltersNote = { target: "map-filters"; before: string; links: { categoryId: MapFilterCategoryId; link: string; after: string }[] };
type DetailedNote = { parts: { text: string; target?: string }[] };
type PositionTrackerNote = { target: "position-tracker"; title: string };
type ReleaseNote = string | LinkedNote | MapFiltersNote | DetailedNote | PositionTrackerNote;
type Release = { version: string; items: ReleaseNote[] };
const linkedNoteClassName = "cursor-pointer font-medium text-zinc-100 underline decoration-zinc-500 underline-offset-4 transition-colors hover:text-white hover:decoration-zinc-200 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent";

const dalaranTarget: ReferenceTarget = { category: "dungeons", id: "mapgenie-instance-949849" };
const professionLevelingTarget: ReferenceTarget = { category: "professions", id: "alchemy", group: "leveling" };
type NoteDestination =
  | { kind: "reference"; target: ReferenceTarget }
  | { kind: "map-point"; markerId: string }
  | { kind: "map-filter"; categoryId: string }
  | { kind: "map-picker" }
  | { kind: "page"; page: "crafting" | "support" }
  | { kind: "talent-calculator"; classId: string };
const noteDestinations: Record<string, NoteDestination & { icon?: string }> = {
  crafting: { kind: "page", page: "crafting" },
  dungeons: { kind: "reference", target: { category: "dungeons", id: "" } },
  "dungeon-map-picker": { kind: "map-picker" },
  "help-feedback": { kind: "page", page: "support" },
  "hunter-pets-filter": { kind: "map-filter", categoryId: "hunter-pet-boar", icon: "data/items/site-icons/ability_hunter_pet_bear.jpg" },
  "winters-chill": { kind: "reference", target: { category: "spells", id: "11180", name: "Winter's Chill" }, icon: "data/spells/icons/135836.webp" },
  "a-dynamite-plan": { kind: "reference", target: { category: "quests", id: "92749", name: "A Dynamite Plan" }, icon: "data/items/site-icons/inv_misc_bomb_06.jpg" },
  "fish-bowl": { kind: "reference", target: { category: "items", id: "279967", name: "Fish Bowl" }, icon: "data/items/site-icons/inv_magicalfishpet.jpg" },
  "battlemaster-filter": { kind: "map-filter", categoryId: "battlemaster", icon: "maps/client-icons/tracking/battle-master.png" },
  "herb-filter": { kind: "map-filter", categoryId: "gatherable-herb-peacebloom", icon: "data/items/site-icons/inv_misc_flower_02.jpg" },
  "mining-filter": { kind: "map-filter", categoryId: "gatherable-ore-copper-vein", icon: "data/items/site-icons/inv_ore_copper_01.jpg" },
  "ley-line-filter": { kind: "map-filter", categoryId: "ley-line", icon: "data/spells/icons/236219.webp" },
  "elemental-convergence-filter": { kind: "map-filter", categoryId: "elemental-convergence", icon: "data/spells/icons/1029587.webp" },
  "reginald-marker": { kind: "map-point", markerId: "forever-all-rare-256410-1" },
  "rogvar-marker": { kind: "map-point", markerId: "forever-all-profession-trainer-1386-1" },
  "berdun-marker": { kind: "map-point", markerId: "forever-all-innkeeper-240482-1" },
  "scarlet-monastery-marker": { kind: "map-point", markerId: "forever-all-dungeon-scarlet-monastery" },
  "raid-filter": { kind: "map-filter", categoryId: "raid" },
  "ancient-cleaver": { kind: "reference", target: { category: "items", id: "286983", name: "Ancient Cleaver" } },
  "wind-bridge": { kind: "reference", target: { category: "spells", id: "1326608", name: "Wind Bridge" } },
  "mind-blast-npc": { kind: "reference", target: { category: "spells", id: "1326990", name: "Mind Blast" } },
  "frigid-power": { kind: "reference", target: { category: "spells", id: "1326891", name: "Frigid Power" } },
  "notes-on-draenethyst": { kind: "reference", target: { category: "quests", id: "93465", name: "Notes on Draenethyst" } },
  "friend-of-the-kirin-tor": { kind: "reference", target: { category: "quests", id: "93689", name: "Friend of the Kirin Tor" } },
  "the-demon-tower": { kind: "reference", target: { category: "quests", id: "92521", name: "The Demon Tower" } },
  "prate-storm-earth-fire": { kind: "reference", target: { category: "quests", id: "79361", name: "Storm, Earth, and Fire" } },
  "fishing-filter": { kind: "map-filter", categoryId: "gatherable-fish-raw-nightfin-snapper", icon: "data/items/site-icons/inv_misc_fish_23.jpg" },
  "nightfin-marker": { kind: "map-point", markerId: "forever-all-fish-raw-nightfin-snapper-1", icon: "data/items/site-icons/inv_misc_fish_23.jpg" },
  "cloth-filter": { kind: "map-filter", categoryId: "gatherable-cloth-silk-cloth", icon: "data/items/site-icons/inv_fabric_silk_01.jpg" },
  "silk-marker": { kind: "map-point", markerId: "forever-all-cloth-silk-cloth-1", icon: "data/items/site-icons/inv_fabric_silk_01.jpg" },
  "silk-item": { kind: "reference", target: { category: "items", id: "4306", name: "Silk Cloth" }, icon: "data/items/site-icons/inv_fabric_silk_01.jpg" },
  "leather-filter": { kind: "map-filter", categoryId: "gatherable-leather-thick-leather", icon: "data/items/site-icons/inv_misc_leatherscrap_08.jpg" },
  "thick-marker": { kind: "map-point", markerId: "forever-all-leather-thick-leather-1", icon: "data/items/site-icons/inv_misc_leatherscrap_08.jpg" },
  "thick-item": { kind: "reference", target: { category: "items", id: "4304", name: "Thick Leather" }, icon: "data/items/site-icons/inv_misc_leatherscrap_08.jpg" },
  "profession-trainer-filter": { kind: "map-filter", categoryId: "profession-trainer", icon: "maps/client-icons/mapgenie-profession-trainer.svg" },
  "class-trainer-filter": { kind: "map-filter", categoryId: "class-trainer" },
  "chaw-marker": { kind: "map-point", markerId: "forever-all-profession-trainer-3069-1", icon: "maps/client-icons/mapgenie-profession-trainer.svg" },
  "karana-marker": { kind: "map-point", markerId: "forever-all-quest-giver-254775-1", icon: "maps/client-icons/quest-npc.png" },
  "rugged-marker": { kind: "map-point", markerId: "forever-all-leather-rugged-leather-1", icon: "data/items/site-icons/inv_misc_leatherscrap_02.jpg" },
  "frost-blast": { kind: "reference", target: { category: "spells", id: "1326053", name: "Frost Blast" } },
  "arcane-wrath": { kind: "reference", target: { category: "spells", id: "1326079", name: "Arcane Wrath" } },
  "mage-talents": { kind: "talent-calculator", classId: "mage" },
  revoke: { kind: "reference", target: { category: "spells", id: "1325499", name: "Revoke" } },
  salvation: { kind: "reference", target: { category: "spells", id: "1038", name: "Salvation" } },
  "mass-salvation": { kind: "reference", target: { category: "spells", id: "25895", name: "Mass Salvation" } },
  "priest-talents": { kind: "talent-calculator", classId: "priest" },
  human: { kind: "reference", target: { category: "races", id: "human", name: "Human" }, icon: "data/classes/icons/race_human_male.jpg" },
  dwarf: { kind: "reference", target: { category: "races", id: "dwarf", name: "Dwarf" }, icon: "data/classes/icons/race_dwarf_male.jpg" },
  orc: { kind: "reference", target: { category: "races", id: "orc", name: "Orc" }, icon: "data/classes/icons/race_orc_male.jpg" },
  tauren: { kind: "reference", target: { category: "races", id: "tauren", name: "Tauren" }, icon: "data/classes/icons/race_tauren_male.jpg" },
  skyborne: { kind: "reference", target: { category: "races", id: "skyborne", name: "Skyborne" }, icon: "data/classes/icons/skyborne.jpg" },
  "band-of-the-fist": { kind: "reference", target: { category: "items", id: "17694", name: "Band of the Fist" } },
  "violet-sorcerer": { kind: "reference", target: { category: "items", id: "273044", name: "Violet Sorcerer's Robes" } },
  "the-attack": { kind: "map-point", markerId: "forever-all-quest-giver-7766-1" },
  "body-and-heart": { kind: "map-point", markerId: "forever-all-quest-giver-4217-1" },
  "sparring-match": { kind: "map-point", markerId: "forever-all-quest-giver-3063-1" },
  "how-big-a-threat": { kind: "map-point", markerId: "forever-all-quest-giver-3693-1" },
  "raenes-cleansing": { kind: "map-point", markerId: "forever-all-quest-giver-3897-1" },
  dalaran: { kind: "reference", target: dalaranTarget },
};

const isReleaseNote = (entry: unknown): entry is ReleaseNote => {
  if (typeof entry === "string") return true;
  if (typeof entry !== "object" || entry === null) return false;
  if ("target" in entry && entry.target === "position-tracker") {
    return "title" in entry && typeof entry.title === "string";
  }
  if ("parts" in entry) return Array.isArray(entry.parts) && entry.parts.length > 0
    && entry.parts.every((part: unknown) => typeof part === "object" && part !== null
      && "text" in part && typeof part.text === "string"
      && (!("target" in part) || typeof part.target === "string" && part.target in noteDestinations));
  if (!("target" in entry)
    || !("before" in entry) || typeof entry.before !== "string") return false;
  if (entry.target === "map-filters") return "links" in entry && Array.isArray(entry.links)
    && entry.links.length > 0 && entry.links.every((link: unknown) =>
      typeof link === "object" && link !== null && "categoryId" in link
      && (link.categoryId === "book" || link.categoryId === "rare" || link.categoryId === "npc")
      && "link" in link && typeof link.link === "string"
      && "after" in link && typeof link.after === "string");
  return (entry.target === "dalaran" || entry.target === "appearance" || entry.target === "profession-leveling")
    && "link" in entry && typeof entry.link === "string"
    && "after" in entry && typeof entry.after === "string";
};

const isRelease = (entry: unknown): entry is Release =>
  typeof entry === "object" && entry !== null &&
  "version" in entry && typeof entry.version === "string" &&
  "items" in entry && Array.isArray(entry.items) && entry.items.every(isReleaseNote);

const UpdatesPage = ({ onNavigateMap, onNavigateMapFilter, onNavigateMapPicker, onNavigateSettingsAppearance,
  onNavigateMapPoint, onNavigateTalentCalculator, onNavigateCrafting, onNavigateSupport }: {
  onNavigateMap: () => void;
  onNavigateMapFilter: (categoryId: string) => void;
  onNavigateMapPicker: () => void;
  onNavigateSettingsAppearance: () => void;
  onNavigateMapPoint: (markerId: string) => void;
  onNavigateTalentCalculator: (classId: string) => void;
  onNavigateCrafting: () => void;
  onNavigateSupport: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, []);

  const result = t("updates.releases", { returnObjects: true });
  const english = i18n.getResource("en", "translation", "updates.releases") as unknown;
  const sourceReleases = typeof english === "object" && english !== null && !Array.isArray(english) ? english : {};
  const translatedReleases = typeof result === "object" && result !== null && !Array.isArray(result) ? result : {};
  const releases = Object.values({ ...sourceReleases, ...translatedReleases }).filter(isRelease)
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  if (!releases.some((release) => release.version === UPDATES_VERSION)) releases.unshift({ version: UPDATES_VERSION, items: [] });
  const navigateNote = (key: string) => {
    const destination = noteDestinations[key];
    if (!destination) return;
    if (destination.kind === "reference") openReference(destination.target);
    else if (destination.kind === "map-point") onNavigateMapPoint(destination.markerId);
    else if (destination.kind === "map-filter") onNavigateMapFilter(destination.categoryId);
    else if (destination.kind === "map-picker") onNavigateMapPicker();
    else if (destination.kind === "talent-calculator") onNavigateTalentCalculator(destination.classId);
    else if (destination.page === "crafting") onNavigateCrafting();
    else onNavigateSupport();
  };
  const linkedPart = (text: string, target: string, key: number) => {
    const icon = noteDestinations[target]?.icon;
    return <button key={key} type="button" onClick={() => navigateNote(target)}
      className={`${linkedNoteClassName} inline-flex items-center gap-1 align-middle`}>
      {icon && <img src={contentUrl(icon)} alt="" aria-hidden="true" width={18} height={18}
        className="inline-block h-[18px] w-[18px] shrink-0 rounded-[3px] object-contain" />}
      <span>{text}</span>
    </button>;
  };

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
    <div className="scroll-slim min-h-0 flex-1 space-y-10 overflow-y-auto px-5 py-8 sm:px-8 sm:py-10">
      {releases.map((release) => <article key={release.version} className="max-w-3xl" aria-labelledby={`updates-version-${release.version}`}>
        <h2 id={`updates-version-${release.version}`} className="mb-6 inline-flex rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-1.5 font-mono text-sm font-semibold text-white">
          {t("updates.version", { version: release.version })}
        </h2>
        {release.items.length ? <ul className="space-y-4 pl-4">
          {release.items.map((note, index) => typeof note !== "string" && "target" in note && note.target === "position-tracker"
            ? <li key={`${release.version}-${index}`}><PositionTrackerReleaseNote title={note.title} /></li>
            : <li key={`${release.version}-${index}`} className="flex gap-3 text-[15px] leading-7 text-zinc-200">
            <span aria-hidden="true" className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-zinc-500" />
            <span>{typeof note === "string" ? note : "parts" in note ? note.parts.map((part, partIndex) => part.target
              ? linkedPart(part.text, part.target, partIndex)
              : <Fragment key={partIndex}>{part.text}</Fragment>) : note.target === "map-filters" ? <>{note.before}{note.links.map(({ categoryId, link, after }) => <Fragment key={categoryId}>
              <button type="button" onClick={() => onNavigateMapFilter(categoryId)} className={linkedNoteClassName}>{link}</button>{after}
            </Fragment>)}</> : <>{note.before}<button type="button"
              onClick={() => note.target === "appearance" ? onNavigateSettingsAppearance() : openReference(note.target === "profession-leveling" ? professionLevelingTarget : dalaranTarget)}
              className={linkedNoteClassName}
            >{note.link}</button>{note.after}</>}</span>
          </li>)}
        </ul> : <p className="text-[15px] leading-7 text-zinc-200">{t("updates.noNotes")}</p>}
      </article>)}
    </div>
  </div>;
};

export default UpdatesPage;
