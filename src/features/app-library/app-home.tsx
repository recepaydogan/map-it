import { ArrowRight, Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { MAP_GAMES, ORDERED_LIBRARY_GAMES, selectApp, type MapGame } from "./app-selection";
import { IS_OVERWOLF } from "../../utils/platform";
import AppHomeArtwork, { artworkFor, type LibraryArtwork } from "./app-home-artwork";
import { useLibraryScroll } from "./use-library-scroll";
import "./app-home.css";

const showcaseIntervalMs = 4 * 60 * 1000;
const cardPreviewDelayMs = 100;
const firstSlide = Math.max(0, MAP_GAMES.findIndex(app => app.id === "baldurs-gate-3"));
const slideByGame = new Map(MAP_GAMES.map((app, index) => [app.id, index] as const));

const catalogFeatures: Readonly<Record<string, readonly string[]>> = {
  "aion-2": ["items", "dungeons"],
  "baldurs-gate-3": ["items"],
  "elden-ring": ["items"],
  nightreign: ["items", "nightfarers"],
  enshrouded: ["items", "crafting"],
  "gta-6": ["weapons", "vehicles"],
  minecraft: ["guide", "seeds"],
  peak: ["journal", "items"],
  "phantom-blade": ["items"],
  "rob-run": ["items", "heists"],
  valheim: ["database", "planners"],
  "wow-forever": ["items", "dungeons"],
};

function showFallbackArtwork(event: SyntheticEvent<HTMLImageElement>, app: MapGame) {
  const image = event.currentTarget;
  if (image.dataset.fallback) {
    image.hidden = true;
    return;
  }
  image.dataset.fallback = "true";
  image.src = app.icon;
}

export default function AppHome({ busy, covered }: { busy: boolean; covered: boolean }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [requestedSlide, setRequestedSlide] = useState(firstSlide);
  const [artwork, setArtwork] = useState<LibraryArtwork>(() => ({ current: artworkFor(MAP_GAMES[firstSlide]) }));
  const home = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const showcase = useRef<HTMLElement>(null);
  const previewTimeout = useRef<number | undefined>(undefined);
  const term = query.trim().toLowerCase();
  const searching = term.length > 0;
  const visible = ORDERED_LIBRARY_GAMES.filter(app => app.name.toLowerCase().includes(term));
  const adInset = IS_OVERWOLF ? 440 : 0;
  const featured = artwork.current.app;
  const featuredDescription = t(`hub.showcaseDescriptions.${featured.id}`, { defaultValue: "" });
  const features = (app: MapGame) => ["map", ...(catalogFeatures[app.id] ?? [])].map(feature => t(`hub.cardFeatures.${feature}`));

  useLibraryScroll(home, !busy && !covered);

  useEffect(() => () => window.clearTimeout(previewTimeout.current), [busy, covered, searching]);

  useEffect(() => {
    if (covered || busy) return;
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [covered, busy]);

  useEffect(() => {
    const app = MAP_GAMES[requestedSlide];
    let cancelled = false;
    const updateScene = async () => {
      let scene = artworkFor(app);
      const image = new Image();
      image.src = scene.src;
      try {
        await image.decode();
      } catch {
        scene = { app, src: app.icon };
      }
      if (cancelled) return;
      setArtwork(existing => {
        if (existing.current.src === scene.src) return existing;
        return { current: scene, previous: existing.current.app === app ? undefined : existing.current };
      });
    };
    void updateScene();
    return () => { cancelled = true; };
  }, [requestedSlide]);

  useEffect(() => {
    if (busy || covered || searching || MAP_GAMES.length < 2) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timeout: number | undefined;

    const schedule = () => {
      window.clearTimeout(timeout);
      if (document.hidden || reducedMotion.matches) return;
      timeout = window.setTimeout(() => {
        if (document.hidden || showcase.current?.matches(":hover, :focus-within")) {
          schedule();
          return;
        }
        setRequestedSlide(index => (index + 1) % MAP_GAMES.length);
      }, showcaseIntervalMs);
    };

    schedule();
    document.addEventListener("visibilitychange", schedule);
    reducedMotion.addEventListener("change", schedule);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", schedule);
      reducedMotion.removeEventListener("change", schedule);
    };
  }, [busy, covered, searching, requestedSlide]);

  const clearSearch = () => {
    setQuery("");
    search.current?.focus();
  };

  const previewGame = (app: MapGame, delay: number) => {
    const slide = slideByGame.get(app.id);
    if (searching || slide === undefined) return;
    window.clearTimeout(previewTimeout.current);
    previewTimeout.current = window.setTimeout(() => setRequestedSlide(slide), delay);
  };

  return (
    <section ref={home} className="map-it-home scroll-none" style={{ marginRight: adInset }} aria-labelledby={busy ? undefined : "game-library-heading"} aria-hidden={covered || undefined} inert={covered}>
      {busy ? (
        <div className="map-it-home-loading" role="status">
          <Loader2 size={20} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <p>{t("hub.checkingGame")}</p>
        </div>
      ) : (
        <div className="map-it-home-layout">
          <header className="map-it-library-masthead">
            <h1 id="game-library-heading">
              <img className="map-it-masthead-mark" src="/icon.png" width={48} height={48} alt="" draggable={false} />
              {t("hub.brand")}
            </h1>
            <div className="map-it-library-search" role="search">
              <Search size={17} aria-hidden="true" />
              <input
                ref={search}
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => { if (event.key === "Escape" && query) clearSearch(); }}
                placeholder={t("hub.search")}
                aria-label={t("hub.search")}
                aria-controls="game-catalog"
                autoComplete="off"
                spellCheck={false}
              />
              {query ? (
                <button type="button" onClick={clearSearch} aria-label={t("hub.clearSearch")}><X size={15} aria-hidden="true" /></button>
              ) : (
                <kbd aria-hidden="true">{t("hub.searchShortcut")}</kbd>
              )}
            </div>
          </header>

          {!searching && (
            <section
              className="map-it-showcase"
              ref={showcase}
              aria-label={t("hub.gameShowcase")}
            >
              <div key={featured.id} className="map-it-showcase-content" data-entering={artwork.previous ? "" : undefined}>
                <img src={featured.icon} className="map-it-showcase-icon" width={34} height={34} alt="" draggable={false} />
                <div className="map-it-showcase-title">
                  <h2>{featured.name}</h2>
                  {featuredDescription && <p>{featuredDescription}</p>}
                </div>
                <button
                  type="button"
                  className="map-it-showcase-open"
                  onClick={() => selectApp(featured.id)}
                >
                  <span>{t("hub.exploreGame", { game: featured.name })}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="map-it-showcase-media" aria-hidden="true">
                <AppHomeArtwork {...artwork} />
              </div>
            </section>
          )}

          <section id="game-catalog" className="map-it-catalog" aria-labelledby="game-catalog-heading">
            <header className="map-it-catalog-heading">
              <h2 id="game-catalog-heading">{t(term ? "hub.searchResults" : "hub.featuredGames")}</h2>
              <span aria-live="polite">{term ? t("hub.gameCount", { count: visible.length }) : ""}</span>
            </header>
            {visible.length > 0 ? (
              <ul className="map-it-catalog-grid">
                {visible.map(app => (
                  <li key={app.id}>
                    <button
                      className="map-it-catalog-card"
                      type="button"
                      onPointerEnter={event => {
                        if (event.pointerType === "mouse") previewGame(app, cardPreviewDelayMs);
                      }}
                      onPointerLeave={() => window.clearTimeout(previewTimeout.current)}
                      onFocus={event => {
                        if (event.currentTarget.matches(":focus-visible")) previewGame(app, 0);
                      }}
                      onClick={() => selectApp(app.id)}
                    >
                      <img
                        className="map-it-catalog-art"
                        src={`/game-cards/catalog/${app.id}.webp`}
                        alt=""
                        width={480}
                        height={720}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        onError={event => showFallbackArtwork(event, app)}
                      />
                      <span className="map-it-catalog-card-caption">
                        <span className="map-it-catalog-card-name">{app.name}</span>
                        <span className="map-it-catalog-card-features">
                          {features(app).join(" | ")}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="map-it-list-empty" role="status">
                <Search size={24} aria-hidden="true" />
                <h3>{t("hub.noMatches")}</h3>
                <button type="button" className="map-it-button" onClick={clearSearch}>{t("hub.clearSearch")}</button>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
