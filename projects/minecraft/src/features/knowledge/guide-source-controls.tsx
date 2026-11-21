import { Gamepad2, History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GAME_EDITIONS, GAME_GUIDE_GAMES, GAME_GUIDE_SOURCES } from "../../game-config";
import { cn } from "../../lib/cn";
import MapSelectDropdown from "../map/map-select-dropdown";

export interface GuideSource {
  gameId: string;
  edition: string;
  version: string;
  includePackagedInventory: boolean;
  itemIdentity?: Readonly<{ edition: string; version: string; revision: string }> | null;
}

export default function GuideSourceControls({ source, onSourceChange, sources = GAME_GUIDE_SOURCES }: {
  source: GuideSource;
  onSourceChange: (gameId: string, edition: string, version: string) => void;
  sources?: readonly GuideSource[];
}) {
  const { t } = useTranslation();
  const games = GAME_GUIDE_GAMES.map(game => {
    const available = sources.some(entry => entry.gameId === game.id);
    return { id: game.id, name: available ? t(game.labelKey) : `${t(game.labelKey)} · ${t("inspector.catalogPreparing")}`, disabled: !available };
  });
  const game = GAME_GUIDE_GAMES.find(entry => entry.id === source.gameId);
  const editions = sources.filter(entry => entry.gameId === source.gameId).filter((entry, index, values) =>
    values.findIndex(candidate => candidate.edition === entry.edition) === index);
  const versions = sources.filter(entry => entry.gameId === source.gameId && entry.edition === source.edition);

  return <div className="flex flex-wrap items-center gap-2">
    {games.length > 1 && <MapSelectDropdown
      options={games}
      value={source.gameId}
      onSelect={gameId => {
        const next = sources.find(entry => entry.gameId === gameId);
        if (next) onSourceChange(next.gameId, next.edition, next.version);
      }}
      placeholder={t("inspector.game")}
      ariaLabel={t("inspector.game")}
      searchPlaceholder={t("inspector.game")}
      noResultsLabel={t("worlds.noResults")}
      icon={Gamepad2}
      iconClassName="text-accent"
      triggerClassName="bg-surface px-3 py-2.5 text-[13px] hover:border-accent/40 focus-visible:border-accent/60"
      className="min-w-0"
    />}
    <div className={cn("grid gap-2", game?.hasEditions ? "grid-cols-[minmax(0,1fr)_minmax(6rem,0.8fr)]" : "grid-cols-1")}>
      {game?.hasEditions && <MapSelectDropdown
        options={editions.map(entry => ({
          id: entry.edition,
          name: t(GAME_EDITIONS.find(edition => edition.id === entry.edition)!.labelKey),
        }))}
        value={source.edition}
        onSelect={edition => {
          const next = sources.find(entry => entry.gameId === source.gameId && entry.edition === edition);
          if (next) onSourceChange(next.gameId, next.edition, next.version);
        }}
        placeholder={t("worlds.edition")}
        ariaLabel={t("worlds.edition")}
        searchPlaceholder={t("worlds.edition")}
        noResultsLabel={t("worlds.noResults")}
        icon={Gamepad2}
        iconClassName="text-accent"
        triggerClassName="bg-surface gap-1.5 px-2 py-2.5 text-[13px] hover:border-accent/40 focus-visible:border-accent/60"
        className="min-w-0"
      />}
      <MapSelectDropdown
        options={versions.map(entry => ({ id: entry.version, name: entry.version }))}
        value={source.version}
        onSelect={version => onSourceChange(source.gameId, source.edition, version)}
        placeholder={t("worlds.version")}
        ariaLabel={t("worlds.version")}
        searchPlaceholder={t("worlds.version")}
        noResultsLabel={t("worlds.noResults")}
        icon={History}
        iconClassName="text-accent"
        triggerClassName="bg-surface gap-1.5 px-2 py-2.5 text-[13px] hover:border-accent/40 focus-visible:border-accent/60"
        className="min-w-0"
      />
    </div>
  </div>;
}
