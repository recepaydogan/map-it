import type { ReactNode } from "react";
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
import { GAME_CONFIG } from "../../game-config";
import { cn } from "../../lib/cn";
import { track } from "../../services/optional-usage";
import { IS_OVERWOLF } from "../../utils/platform";
import { startOnboarding } from "../onboarding/use-onboarding";
import { useMapDisplayPreferences } from "../map/use-map-display-preferences";
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
    <div className="flex h-full min-h-0 flex-col bg-background animate-fade-in">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
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

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-2xl">
          <AppearanceSection />
          <MapSection />
          {IS_OVERWOLF && <GameIntegrationSection />}
          {IS_OVERWOLF && <HotkeysSection hotkeys={hotkeys} />}
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

/** The global Overwolf hotkeys owned by the desktop window and in-game views.
 * All are rebindable in-app, per Overwolf's guidance. */
const HotkeysSection = ({ hotkeys }: { hotkeys: HotkeyRebind }) => {
  const { t } = useTranslation();
  const {
    bindings,
    capturing,
    capturePreview,
    supported,
    error,
    startCapture,
    cancelCapture,
  } = hotkeys;

  const rows: { name: HotkeyName; description: string; fallback: string }[] = [
    { name: "toggle_desktop_app", description: t("settings.hotkeyDesktopApp"), fallback: "Ctrl + Shift + D" },
    { name: "toggle_app", description: t("settings.hotkeyApp"), fallback: "Ctrl + Shift + A" },
    { name: "toggle_overlay", description: t("settings.hotkeyMinimap"), fallback: "Ctrl + M" },
  ];

  return (
    <>
      <SectionTitle>{t("settings.hotkeysSection")}</SectionTitle>
      <div data-tour="settings-hotkeys" className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/60">
        {rows.map((row) => (
          <HotkeyRow
            key={row.name}
            description={row.description}
            fallback={row.fallback}
            binding={bindings[row.name]}
            editable={supported}
            capturing={capturing === row.name}
            capturePreview={capturePreview}
            anyCapturing={capturing !== null}
            onStart={() => startCapture(row.name)}
            onCancel={cancelCapture}
          />
        ))}
      </div>
      {error && <p className="px-1 pt-2 text-[12px] text-danger-text">{error}</p>}
      <p className="px-1 pt-2 text-[12px] leading-relaxed text-muted">{t("settings.hotkeysNote")}</p>
    </>
  );
};

/** One rebindable hotkey row: description + current binding, with a Change button
 * that arms key capture ("Press keys…" + Cancel). Falls back to read-only when the
 * Overwolf hotkeys API isn't available. */
const HotkeyRow = ({
  description,
  fallback,
  binding,
  editable,
  capturing,
  capturePreview,
  anyCapturing,
  onStart,
  onCancel,
}: {
  description: string;
  fallback: string;
  binding: string | undefined;
  editable: boolean;
  capturing: boolean;
  capturePreview: string;
  anyCapturing: boolean;
  onStart: () => void;
  onCancel: () => void;
}) => {
  const { t } = useTranslation();
  // Before get() resolves, show the manifest default; "" means explicitly unassigned.
  const label =
    binding === undefined ? fallback : binding === "" ? t("settings.hotkeyUnassigned") : binding;

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <p className="text-[12.5px] text-zinc-300">{description}</p>
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
        <SettingRow title={t("settings.replayTour")} description={t("onboarding.baseApp.replayDescription")}>
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
