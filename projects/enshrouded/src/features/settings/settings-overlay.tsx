import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AppWindow,
  ArrowLeft,
  Compass,
  Gamepad2,
  Map as MapIcon,
  Settings,
  X,
} from "lucide-react";
import ToggleSwitch from "../../components/toggle-switch";
import LanguageSelect from "../../i18n/language-select";
import { APP_LANGUAGES } from "../../i18n/language-order";
import { GAME_CONFIG } from "../../game-config";
import { cn } from "../../lib/cn";
import { track } from "../../services/optional-usage";
import { IS_OVERWOLF } from "../../utils/platform";
import { startOnboarding } from "../onboarding/use-onboarding";
import { useMapDisplayPreferences } from "../map/use-map-display-preferences";
import { DEFAULT_MAP_SHORTCUTS, formatMapShortcut, resetMapShortcut, sameMapShortcut,
  setMapShortcut, shortcutFromEvent, useMapShortcuts, type MapShortcutAction } from "../map/map-shortcuts";
import {
  FONT_SCALE_MAX_PERCENT,
  FONT_SCALE_MIN_PERCENT,
  FONT_SCALE_STEP_PERCENT,
  setFontScalePercent,
  useFontScalePercent,
} from "./font-scale";
import { useLaunchPreferences } from "./use-launch-preferences";
import { useHotkeyRebind, type HotkeyName, type HotkeyRebind } from "./use-hotkey-rebind";

/**
 * In-app Settings page — one narrow column of real preferences. It occupies
 * the dashboard's non-ad content region.
 */
const SettingsPage = ({ onNavigateMap }: { onNavigateMap: () => void }) => {
  const { t } = useTranslation();
  const hotkeys = useHotkeyRebind();

  return (
    <div className="enshrouded-utility-page flex h-full min-h-0 flex-col animate-fade-in">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-border bg-background">
          <Settings size={18} className="text-accent" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold tracking-tight text-white">{t("settings.title")}</h1>
          <p className="mt-0.5 text-[12px] text-muted">{t("settings.subtitle")}</p>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onNavigateMap}
          aria-label={t("chrome.map")}
          className="grid h-8 w-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/8 hover:text-white"
        >
          <ArrowLeft size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="enshrouded-page-body min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-2xl">
          <AppearanceSection />
          <MapSection />
          {IS_OVERWOLF && <GameIntegrationSection />}
          <HotkeysSection hotkeys={hotkeys} />
          <HelpSection onNavigateMap={onNavigateMap} />
        </div>
      </div>
    </div>
  );
};

const AppearanceSection = () => {
  const { t } = useTranslation();
  const percent = useFontScalePercent();

  return (
    <>
      <SectionTitle>{t("settings.appearanceSection")}</SectionTitle>
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface/60">
        {APP_LANGUAGES.length > 1 && <div className="border-b border-border">
          <SettingRow title={t("settings.language")} description={t("settings.languageDesc")}>
            <LanguageSelect />
          </SettingRow>
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="min-w-0 flex-1">
            <label htmlFor="app-font-scale" className="block text-[13px] font-medium text-white">
              {t("settings.fontSize")}
            </label>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{t("settings.fontSizeDesc")}</p>
          </div>
          <div className="flex min-w-[180px] items-center gap-3">
            <input
              id="app-font-scale"
              type="range"
              min={FONT_SCALE_MIN_PERCENT}
              max={FONT_SCALE_MAX_PERCENT}
              step={FONT_SCALE_STEP_PERCENT}
              value={percent}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                setFontScalePercent(next);
                reportSettingChange("font_scale_percent", next);
              }}
              aria-valuetext={`${(percent / 100).toFixed(1)}×`}
              className="min-w-0 flex-1 cursor-pointer accent-accent"
            />
            <output htmlFor="app-font-scale" className="w-10 shrink-0 text-right text-[13px] font-semibold tabular-nums text-white">
              {(percent / 100).toFixed(1)}×
            </output>
          </div>
        </div>
      </div>
    </>
  );
};

/** One shape for every preference, so adding a toggle never needs a new event
 *  name — the breakdown is on `setting`. */
const reportSettingChange = (setting: string, value: unknown): void => {
  track("SETTING_CHANGED", { setting, value });
};

/** How the map draws itself — marker grouping and jump behaviour. */
const MapSection = () => {
  const { t } = useTranslation();
  const { preferences, update } = useMapDisplayPreferences();

  return (
    <>
      <SectionTitle>{t("settings.mapSection")}</SectionTitle>
      <div data-tour="settings-map" className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/60">
        <SettingRow title={t("settings.groupNearby")} description={t("settings.groupNearbyDesc")}>
          <ToggleSwitch
            checked={preferences.clusterMarkers}
            onChange={(next) => {
              update({ clusterMarkers: next });
              reportSettingChange("cluster_markers", next);
            }}
            label={t("settings.groupNearby")}
          />
        </SettingRow>

        <div className="border-t border-border">
          <SettingRow title={t("settings.selectionZoom")} description={t("settings.selectionZoomDesc")}>
            <ToggleSwitch
              checked={preferences.selectionZoomEnabled}
              onChange={(next) => {
                update({ selectionZoomEnabled: next });
                reportSettingChange("selection_zoom_enabled", next);
              }}
              label={t("settings.selectionZoom")}
            />
          </SettingRow>
        </div>
      </div>
    </>
  );
};

/** What the app does when the game launches. Overwolf-only — the plain web
 * build never sees a game launch. */
const GameIntegrationSection = () => {
  const { t } = useTranslation();
  const { preferences, update } = useLaunchPreferences();
  const game = GAME_CONFIG.gameName;

  return (
    <>
      <SectionTitle>{t("settings.gameSection")}</SectionTitle>
      <div data-tour="settings-game" className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/60">
        <IconSettingRow
          icon={<Gamepad2 size={15} className="text-accent" aria-hidden="true" />}
          title={t("settings.autoOpenApp")}
          description={t("settings.autoOpenAppDesc", { game })}
        >
          <ToggleSwitch
            checked={preferences.autoOpenAppWithGame}
            onChange={(next) => {
              update({ autoOpenAppWithGame: next });
              reportSettingChange("auto_open_app_with_game", next);
            }}
            label={t("settings.autoOpenApp")}
          />
        </IconSettingRow>
        <div className="border-t border-border">
          <IconSettingRow
            icon={<AppWindow size={15} className="text-accent" aria-hidden="true" />}
            title={t("settings.autoOpenInGame")}
            description={t("settings.autoOpenInGameDesc", { game })}
          >
            <ToggleSwitch
              checked={preferences.autoOpenInGameOverlay}
              onChange={(next) => {
                update({ autoOpenInGameOverlay: next });
                reportSettingChange("auto_open_in_game_overlay", next);
              }}
              label={t("settings.autoOpenInGame")}
            />
          </IconSettingRow>
        </div>
        <div className="border-t border-border">
          <IconSettingRow
            icon={<MapIcon size={15} className="text-accent" aria-hidden="true" />}
            title={t("settings.autoOpenMinimap")}
            description={t("settings.autoOpenMinimapDesc", { game })}
          >
            <ToggleSwitch
              checked={preferences.autoOpenMinimap}
              onChange={(next) => {
                update({ autoOpenMinimap: next });
                reportSettingChange("auto_open_minimap", next);
              }}
              label={t("settings.autoOpenMinimap")}
            />
          </IconSettingRow>
        </div>
      </div>
    </>
  );
};

/** Rebindable Overwolf window hotkeys and map-local keyboard shortcuts. */
const HotkeysSection = ({ hotkeys }: { hotkeys: HotkeyRebind }) => {
  const { t } = useTranslation();
  const mapBindings = useMapShortcuts();
  const [mapCapturing, setMapCapturing] = useState<MapShortcutAction | null>(null);
  const [mapPreview, setMapPreview] = useState("");
  const [mapError, setMapError] = useState<string | null>(null);
  const {
    bindings,
    capturing,
    capturePreview,
    supported,
    error,
    startCapture,
    cancelCapture,
  } = hotkeys;

  const rows: { name: HotkeyName; description: string; detail: string; fallback: string }[] = [
    { name: "toggle_desktop_app", description: t("settings.hotkeyDesktopApp"),
      detail: t("settings.hotkeyDesktopAppDesc"), fallback: "Ctrl + Shift + D" },
    { name: "toggle_app", description: t("settings.hotkeyApp"),
      detail: t("settings.hotkeyAppDesc"), fallback: "Ctrl + Shift + A" },
    { name: "toggle_overlay", description: t("settings.hotkeyMinimap"),
      detail: t("settings.hotkeyMinimapDesc"), fallback: "Ctrl + M" },
  ];
  const mapShortcuts: { action: MapShortcutAction; name: string; detail: string }[] = [
    { action: "search", name: t("settings.hotkeyMapSearch"), detail: t("settings.hotkeyMapSearchDesc") },
    { action: "zoomIn", name: t("settings.hotkeyMapZoomIn"), detail: t("settings.hotkeyMapZoomDesc") },
    { action: "zoomOut", name: t("settings.hotkeyMapZoomOut"), detail: t("settings.hotkeyMapZoomDesc") },
    { action: "close", name: t("settings.hotkeyMapClose"), detail: t("settings.hotkeyMapCloseDesc") },
  ];
  useEffect(() => {
    if (!mapCapturing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.key === "Escape") {
        setMapCapturing(null);
        setMapPreview("");
        return;
      }
      if (["Control", "Alt", "AltGraph", "Shift", "Meta"].includes(event.key)) {
        setMapPreview([event.ctrlKey && "Ctrl", event.altKey && "Alt",
          event.shiftKey && "Shift", event.metaKey && "Win"].filter(Boolean).join(" + "));
        return;
      }
      const next = shortcutFromEvent(event);
      const normalizedLabel = formatMapShortcut(next).replace(/\s+/g, "").toLocaleLowerCase("en");
      const appBindings = [bindings.toggle_desktop_app ?? "Ctrl+Shift+D",
        bindings.toggle_app ?? "Ctrl+Shift+A", bindings.toggle_overlay ?? "Ctrl+M"];
      if (Object.entries(mapBindings).some(([action, binding]) => action !== mapCapturing
        && sameMapShortcut(binding, next)) || IS_OVERWOLF && appBindings.some((binding) => binding
          && binding.replace(/\s+/g, "").toLocaleLowerCase("en") === normalizedLabel)) {
        setMapError(t("settings.hotkeyConflict"));
        return;
      }
      setMapShortcut(mapCapturing, next);
      setMapCapturing(null);
      setMapPreview("");
      setMapError(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [bindings, mapBindings, mapCapturing, t]);

  return (
    <>
      <SectionTitle>{t("settings.hotkeysSection")}</SectionTitle>
      {IS_OVERWOLF && <>
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{t("settings.hotkeysGlobal")}</p>
        <div data-tour="settings-hotkeys" className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/60">
          {rows.map((row) => (
            <HotkeyRow
              key={row.name}
              description={row.description}
              detail={row.detail}
              fallback={row.fallback}
              binding={bindings[row.name]}
              editable={supported}
              capturing={capturing === row.name}
              capturePreview={capturePreview}
              anyCapturing={capturing !== null || mapCapturing !== null}
              onStart={() => startCapture(row.name)}
              onCancel={cancelCapture}
            />
          ))}
        </div>
        {error && <p className="px-1 pt-2 text-[12px] text-danger-text">
          {t(error === "conflict" ? "settings.hotkeyExternalConflict" : "settings.hotkeyAssignFailed")}
        </p>}
      </>}
      <p className="mb-2 mt-5 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{t("settings.hotkeysMap")}</p>
      <div className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/60">
        {mapShortcuts.map((shortcut) => <HotkeyRow key={shortcut.action}
          description={shortcut.name} detail={shortcut.detail}
          fallback={formatMapShortcut(DEFAULT_MAP_SHORTCUTS[shortcut.action], shortcut.action)}
          binding={formatMapShortcut(mapBindings[shortcut.action], shortcut.action)}
          editable capturing={mapCapturing === shortcut.action} capturePreview={mapPreview}
          anyCapturing={capturing !== null || mapCapturing !== null}
          onStart={() => { setMapError(null); setMapPreview(""); setMapCapturing(shortcut.action); }}
          onCancel={() => { setMapCapturing(null); setMapPreview(""); setMapError(null); }}
          onReset={() => resetMapShortcut(shortcut.action)} />)}
      </div>
      {mapError && <p className="px-1 pt-2 text-[12px] text-danger-text">{mapError}</p>}
      <p className="px-1 pt-2 text-[12px] leading-relaxed text-muted">{t("settings.hotkeysNote")}</p>
    </>
  );
};

/** One rebindable shortcut row with live binding, capture and optional reset. */
const HotkeyRow = ({
  description,
  detail,
  fallback,
  binding,
  editable,
  capturing,
  capturePreview,
  anyCapturing,
  onStart,
  onCancel,
  onReset,
}: {
  description: string;
  detail: string;
  fallback: string;
  binding: string | undefined;
  editable: boolean;
  capturing: boolean;
  capturePreview: string;
  anyCapturing: boolean;
  onStart: () => void;
  onCancel: () => void;
  onReset?: () => void;
}) => {
  const { t } = useTranslation();
  // Before get() resolves, show the manifest default; "" means explicitly unassigned.
  const label =
    binding === undefined ? fallback : binding === "" ? t("settings.hotkeyUnassigned") : binding;

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-zinc-200">{description}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{detail}</p>
      </div>
      {capturing ? (
        <div className="flex shrink-0 items-center gap-2">
          <span
            aria-live="polite"
            className="animate-pulse rounded-[var(--radius-sm)] border border-accent bg-accent-soft px-2.5 py-1 font-mono text-[12px] text-accent"
          >
            {capturePreview || t("settings.hotkeyPressKeys")}
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="flex cursor-pointer items-center gap-1 rounded-[var(--radius-md)] border border-border bg-black/30 px-2.5 py-1 text-[12px] font-medium text-zinc-300 transition-colors hover:bg-white/8 hover:text-white"
          >
            <X size={12} aria-hidden="true" />
            {t("settings.hotkeyCancel")}
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <Keys>{label}</Keys>
          {editable && (
            <button
              type="button"
              onClick={onStart}
              disabled={anyCapturing}
              className="cursor-pointer rounded-[var(--radius-md)] border border-border bg-black/30 px-2.5 py-1 text-[12px] font-medium text-zinc-300 transition-colors hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("settings.hotkeyChange")}
            </button>
          )}
          {onReset && <button type="button" onClick={onReset} disabled={anyCapturing}
            className="cursor-pointer rounded-[var(--radius-md)] px-2 py-1 text-[12px] text-zinc-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
            {t("settings.hotkeyReset")}
          </button>}
        </div>
      )}
    </div>
  );
};

/** The way back into the guided tour — the tour's own last stop points here, so
 * everyone learns where the replay lives before the tour ends. */
const HelpSection = ({ onNavigateMap }: { onNavigateMap: () => void }) => {
  const { t } = useTranslation();

  return (
    <>
      <SectionTitle>{t("settings.helpSection")}</SectionTitle>
      <div data-tour="settings-tour" className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/60">
        <SettingRow title={t("settings.replayTour")} description={t("settings.replayTourDesc")}>
          <button
            type="button"
            onClick={() => {
              // Let the map commit before the tour snapshots its available
              // targets; otherwise the still-visible Settings DOM makes every
              // map step look unavailable for one render.
              onNavigateMap();
              window.requestAnimationFrame(startOnboarding);
            }}
            className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft px-3 py-2 text-[12.5px] font-semibold text-accent transition-colors hover:bg-accent/15"
          >
            <Compass size={14} aria-hidden="true" />
            {t("settings.startTour")}
          </button>
        </SettingRow>
      </div>
    </>
  );
};

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <p className="px-1 pb-2 pt-7 text-[12px] font-semibold uppercase tracking-[0.18em] text-muted first:pt-0">
    {children}
  </p>
);

const Keys = ({ children }: { children: ReactNode }) => (
  <kbd className="shrink-0 rounded-[var(--radius-sm)] border border-border bg-black/30 px-2 py-1 font-mono text-[12px] text-zinc-200">
    {children}
  </kbd>
);

/** A labelled settings row: title + description on the left, its control on the
 * right. Shared by every "label ↔ control" preference in the page. */
const SettingRow = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <div className="flex items-center justify-between gap-4 px-4 py-4">
    <div className="min-w-0">
      <p className="text-[13px] font-medium text-white">{title}</p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{description}</p>
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

/** A settings row that leads with a glyph — used where the preference changes
 * something outside this window (a game launch, another window). */
const IconSettingRow = ({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <div className={cn("flex items-center justify-between gap-4 px-4 py-4")}>
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-white">{title}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{description}</p>
      </div>
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

export default SettingsPage;
