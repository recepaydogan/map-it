import { BookOpen, ChevronDown, Crown, Database, Gem, Moon, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import Dropdown, { type DropdownOption, type DropdownSection } from "../dropdown";
import { cn } from "../../lib/cn";
import { type OverlayKey, useUiStore } from "../../store/ui-store";

/** Rows that just open a full-window surface. The two item catalogs are special —
 *  they share the `codex` surface and pick a side via `openDatabase`. */
const OVERLAY_ROWS: Record<string, OverlayKey> = {
  relics: "relics",
  nightlords: "nightlords",
  nightfarers: "nightfarers",
};

/**
 * The title bar's single reference menu: everything that isn't the map.
 *
 * Grouped rather than flat, because the rows answer two different questions —
 * "what can I find?" (the item catalogs) and "who am I up against / playing?"
 * (Nightreign's bosses, heroes and relics). The Nightreign group carries
 * `data-game`, so its rows wear the spectral-cyan accent exactly as the tabs
 * these rows replaced used to.
 *
 * Collapsing five destinations into one trigger is also what keeps the strip
 * from overflowing between ~1024px and ~1200px, where the tab row used to run
 * into the control cluster.
 */
const HeaderDatabaseMenu = () => {
  const { t } = useTranslation();
  const activeOverlay = useUiStore((state) => state.activeOverlay);
  const databaseGame = useUiStore((state) => state.databaseGame);
  const openDatabase = useUiStore((state) => state.openDatabase);
  const openOverlay = useUiStore((state) => state.openOverlay);

  const active =
    activeOverlay === "codex" ||
    activeOverlay === "relics" ||
    activeOverlay === "nightlords" ||
    activeOverlay === "nightfarers";

  // These rows are destinations, not a setting: the tick means "this is what you
  // are looking at right now". So while the app is anywhere else — the map, or
  // any surface this menu doesn't own — nothing is ticked. `databaseGame` is only
  // the side the catalog will open on next, which is not the same as being there.
  const value = !active
    ? null
    : activeOverlay && activeOverlay in OVERLAY_ROWS
      ? activeOverlay
      : databaseGame === "nightreign"
        ? "nightreign-items"
        : "elden-ring-items";

  const sections: DropdownSection[] = [
    { key: "items", label: t("category.item") },
    { key: "nightreign", label: t("game.nightreign"), game: "nightreign" },
  ];

  const options: DropdownOption[] = [
    {
      value: "elden-ring-items",
      label: t("nav.eldenRingItems"),
      icon: <BookOpen size={14} aria-hidden="true" />,
      section: "items",
    },
    {
      value: "nightreign-items",
      label: t("nav.nightreignItems"),
      icon: <Moon size={14} aria-hidden="true" />,
      section: "items",
    },
    {
      value: "relics",
      label: t("nav.relics"),
      icon: <Gem size={14} aria-hidden="true" />,
      section: "nightreign",
    },
    {
      value: "nightlords",
      label: t("nav.nightlords"),
      icon: <Crown size={14} aria-hidden="true" />,
      section: "nightreign",
    },
    {
      value: "nightfarers",
      label: t("nav.nightfarers"),
      icon: <Users size={14} aria-hidden="true" />,
      section: "nightreign",
    },
  ];

  const selectDatabase = (nextValue: string) => {
    const overlay = OVERLAY_ROWS[nextValue];
    if (overlay) {
      openOverlay(overlay);
      return;
    }
    openDatabase(nextValue === "nightreign-items" ? "nightreign" : "elden-ring");
  };

  return (
    <Dropdown
      value={value}
      options={options}
      sections={sections}
      onChange={selectDatabase}
      align="start"
      trigger={
        <button
          type="button"
          aria-current={active ? "page" : undefined}
          aria-label={t("nav.database")}
          className={cn(
            "group flex h-full items-center gap-1.5 px-3 text-[12.5px] font-medium outline-none transition-colors cursor-pointer",
            active
              ? "bg-accent-soft text-white"
              : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
          )}
        >
          <Database
            size={15}
            className={active ? "text-accent" : "text-zinc-500 group-hover:text-accent"}
            aria-hidden="true"
          />
          <span>{t("nav.database")}</span>
          <ChevronDown size={13} className="text-zinc-500" aria-hidden="true" />
        </button>
      }
    />
  );
};

export default HeaderDatabaseMenu;
