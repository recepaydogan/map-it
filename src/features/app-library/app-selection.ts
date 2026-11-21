import apps from "./map-apps.json";
import libraryGameVariants from "../../../public/game-library-variants.json?raw";

type GameVariant = { id: string; name: string; gameIds: number[]; mode?: string };
const variants: Record<string, GameVariant[] | undefined> = JSON.parse(libraryGameVariants);
export const gameIconUrl = (id: string): string => `/game-cards/icons/${id}.png`;
export const MAP_APPS = apps.map(app => ({ ...app, name: variants[app.id]?.[0]?.name ?? app.name, icon: gameIconUrl(app.id) }));
type MapApp = (typeof MAP_APPS)[number];
export type MapGame = MapApp & { moduleId: string; mode?: string };
export const MAP_GAMES: MapGame[] = MAP_APPS.flatMap(app =>
  (variants[app.id] ?? [app]).map(game => ({ ...app, ...game, moduleId: app.id, icon: gameIconUrl(game.id) })));
const libraryPriority = ["wow-forever", "gta-6", "aion-2", "minecraft", "rob-run"];
const libraryRank = (id: string) => {
  const rank = libraryPriority.indexOf(id);
  return rank === -1 ? libraryPriority.length : rank;
};
export const ORDERED_LIBRARY_GAMES = [...MAP_GAMES].sort((left, right) => libraryRank(left.id) - libraryRank(right.id));
export const APP_SELECTION_KEY = "map-it:selected-app";
const CHANGE_EVENT = "map-it:app-selection";
export const findMapApp = (id: string | null | undefined): MapApp | undefined => MAP_APPS.find(app => app.id === id);
export const findMapGame = (id: string | null | undefined): MapGame | undefined => MAP_GAMES.find(game => game.id === id);

const params = new URLSearchParams(window.location.search);
const requested = params.get("game") ?? ((!params.has("surface") || params.get("surface") === "main") ? params.get("app") : null);
if (findMapGame(requested)) localStorage.setItem(APP_SELECTION_KEY, requested!);

export const getSelectedAppId = (): string | null => {
  const id = localStorage.getItem(APP_SELECTION_KEY);
  return findMapGame(id) ? id : null;
};
export function selectApp(id: string | null): void {
  if (id && !findMapGame(id)) return;
  if (id) localStorage.setItem(APP_SELECTION_KEY, id);
  else localStorage.removeItem(APP_SELECTION_KEY);

  const url = new URL(window.location.href);
  const surface = url.searchParams.get("surface") || "main";
  if (surface === "main" && (url.searchParams.has("game") || url.searchParams.has("app"))) {
    url.searchParams.delete("game");
    url.searchParams.delete("app");
    window.history.replaceState(window.history.state, "", url);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function subscribeToAppSelection(listener: () => void): () => void {
  const storage = (event: StorageEvent) => { if (event.key === APP_SELECTION_KEY || event.key === null) listener(); };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(CHANGE_EVENT, listener); window.removeEventListener("storage", storage); };
}
export function appFrameUrl(app: MapGame, surface: string, launch?: { source: string; parameter?: string }): string {
  const file = surface === "background" ? app.background : app.windowFiles[surface as keyof typeof app.windowFiles] || app.entry;
  const url = new URL(`/apps/${app.moduleId}/${file}`, window.location.href);
  url.searchParams.set("window", surface);
  if (app.mode && surface !== "background") url.searchParams.set("game", app.mode);
  if (launch) {
    url.searchParams.set("source", launch.source);
    if (launch.parameter) url.searchParams.set("parameter", launch.parameter);
  }
  return url.pathname + url.search;
}
