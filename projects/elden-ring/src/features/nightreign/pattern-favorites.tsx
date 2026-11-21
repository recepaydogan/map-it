import * as RD from "@radix-ui/react-dropdown-menu";
import { Star } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import MapActionButton from "../../components/map-action-button";
import { getPortalRoot } from "../../lib/portal";
import { useMapStore } from "../../store/map-store";
import { useMapExperience } from "../map-experience/map-experience";

const keyOf = (nl: string, se: string, layout: number) => `${nl}|${se}|${layout}`;

/**
 * Save / restore Nightreign runs — the Nightreign twin of the Elden Ring bookmarks menu,
 * styled identically: a compact square header button (star + saved-count badge) that opens
 * a dropdown. The dropdown's top action stars/unstars the CURRENT run (Nightlord + Shifting
 * Earth + layout); the list below jumps the seed and map back to any saved one.
 */
const PatternFavorites = () => {
  const { t } = useTranslation();
  const { nightlord, shiftingEarth, currentPattern, gotoPattern } = useMapExperience();
  const favorites = useMapStore((s) => s.favoritePatterns);
  const toggleFavoritePattern = useMapStore((s) => s.toggleFavoritePattern);
  const earthLabel = (e: string) => (e === "Default" ? t("nightreign.noShiftingEarth") : e);

  const currentKey = currentPattern ? keyOf(nightlord, shiftingEarth, currentPattern.layout) : null;
  const isFav = currentKey != null && favorites.has(currentKey);
  const saved = [...favorites].map((k) => {
    const [nl, se, layout] = k.split("|");
    return { key: k, nl, se, layout: Number(layout) };
  });

  return (
    <RD.Root>
      <RD.Trigger asChild>
        {/* MapActionButton, not a hand-rolled square: this sits in the same row as
            the map's other action buttons and had drifted into a private copy of
            their chrome — which meant it kept the desktop 36px size when they
            grew for touch. Sharing the component keeps the row one height. */}
        <MapActionButton
          data-tour="patterns"
          title={t("nightreign.savedRuns")}
          aria-label={t("nightreign.savedRuns")}
        >
          <Star
            size={16}
            fill={saved.length ? "#fbbf24" : "none"}
            className={saved.length ? "text-amber-400" : ""}
            aria-hidden="true"
          />
          {saved.length > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-[var(--radius-full)] bg-amber-400 px-1 text-[10px] font-bold tabular-nums text-black">
              {saved.length}
            </span>
          )}
        </MapActionButton>
      </RD.Trigger>

      <RD.Portal container={getPortalRoot()}>
        <RD.Content
          align="end"
          sideOffset={6}
          className="z-[1400] w-[min(17.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-2xl shadow-black/60 animate-fade-in"
        >
          <div className="border-b border-border px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{t("nightreign.savedRuns")}</p>
          </div>

          {/* Star / unstar the CURRENT run (the action that used to be the inline star). */}
          <button
            onClick={() => currentKey && toggleFavoritePattern(currentKey)}
            disabled={!currentKey}
            aria-pressed={isFav}
            className="flex w-full items-center gap-2 border-b border-border px-3.5 py-2.5 text-left text-[12px] font-medium text-zinc-200 transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            <Star
              size={14}
              className={isFav ? "text-amber-400" : "text-zinc-400"}
              fill={isFav ? "currentColor" : "none"}
              aria-hidden="true"
            />
            {isFav ? t("nightreign.savedRunTapToRemove") : t("nightreign.saveThisRun")}
          </button>

          {saved.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] leading-relaxed text-zinc-500">
              <Trans
                i18nKey="nightreign.noSavedRuns"
                components={{ star: <Star size={11} className="-mt-0.5 inline text-amber-400" aria-hidden="true" /> }}
              />
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto p-1.5">
              {saved.map((s) => (
                <RD.Item
                  key={s.key}
                  onSelect={() => gotoPattern(s.nl, s.se, s.layout)}
                  className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 outline-none transition-colors data-[highlighted]:bg-surface-hover"
                >
                  <Star size={13} className="shrink-0 text-amber-300" fill="currentColor" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-zinc-100">
                      {s.nl} · {t("nightreign.patternLabel", { layout: s.layout })}
                    </span>
                    <span className="block truncate text-[11px] text-muted">{earthLabel(s.se)}</span>
                  </span>
                </RD.Item>
              ))}
            </div>
          )}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
};

export default PatternFavorites;
