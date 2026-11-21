import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AppWindow,
  ArrowLeft,
  Check,
  ChevronDown,
  Compass,
  Gamepad2,
  MonitorPlay,
  Move,
  Ruler,
  Settings,
  X,
} from "lucide-react";
import ToggleSwitch from "../../components/toggle-switch";
import { cn } from "../../lib/cn";
import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import { IS_OVERWOLF } from "../../utils/platform";
import { startOnboarding } from "../onboarding/use-onboarding";
import { useDismissable } from "../map/use-dismissable";
import { useMapDisplayPreferences } from "../map/use-map-display-preferences";
import { useLaunchPreferences } from "./use-launch-preferences";
import { useOverlayKeyboardMovement } from "../overlay/use-overlay-keyboard-movement";
import { useHotkeyRebind, type HotkeyName, type HotkeyRebind } from "./use-hotkey-rebind";
import LegalNotice from "./legal-notice";
import MarkerSizeSetting from "./marker-size-setting";
import BridgeModReinstallSetting from "./bridge-mod-reinstall-setting";

/**
 * In-app Settings page — one narrow column of real preferences, no padded grid
 * of half-empty cards. It occupies the dashboard's non-ad content region.
 */
const SettingsPage = ({
  onNavigateMap,
  focusBridgeReinstall = false,
  focusHotkeys = false,
}: {
  onNavigateMap: () => void;
  focusBridgeReinstall?: boolean;
  focusHotkeys?: boolean;
}) => {
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
          <MapSection />
          {IS_OVERWOLF && <GameIntegrationSection focusBridgeReinstall={focusBridgeReinstall} />}
          {IS_OVERWOLF && <HotkeysSection hotkeys={hotkeys} focusOnMount={focusHotkeys} />}
          <HelpSection onNavigateMap={onNavigateMap} />
          <SectionTitle>{t("settings.legalSection")}</SectionTitle>
          <LegalNotice />
        </div>
      </div>
    </div>
  );
};

/** One shape for every preference, so adding a toggle never needs a new event
 *  name — the breakdown is on `setting`. */
const reportSettingChange = (setting: string, value: unknown): void => {
  track(EVENTS.SETTING_CHANGED, { setting, value });
};

/** How the map draws itself — marker grouping, jump behaviour and route units. */
const MapSection = () => {
  const { t } = useTranslation();
  const { preferences, update } = useMapDisplayPreferences();

  return (
    <>
      <SectionTitle>{t("settings.mapSection")}</SectionTitle>
      {/* No overflow-hidden: the distance dropdown's menu has to escape the card. */}
      <div data-tour="settings-map" className="rounded-[var(--radius-lg)] border border-border bg-surface/60">
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
          <MarkerSizeSetting
            value={preferences.markerSizePercent}
            onChange={(markerSizePercent) => update({ markerSizePercent })}
            onCommit={(markerSizePercent) => reportSettingChange("marker_size_percent", markerSizePercent)}
          />
        </div>

        <div className="border-t border-border">
          <SelectRow
            title={t("settings.distanceUnit")}
            description={t("settings.distanceUnitDesc")}
            icon={<Ruler size={13} className="shrink-0 text-zinc-400" aria-hidden="true" />}
            value={preferences.distanceUnit}
            options={[
              { value: "metric", label: t("settings.distanceMetric") },
              { value: "imperial", label: t("settings.distanceImperial") },
              { value: "tiles", label: t("settings.distanceTiles") },
            ]}
            onChange={(distanceUnit) => {
              update({ distanceUnit });
              reportSettingChange("distance_unit", distanceUnit);
            }}
          />
        </div>
      </div>
    </>
  );
};

/** What the app does when Project Zomboid launches. Overwolf-only — the plain
 * web build never sees a game launch. */
const GameIntegrationSection = ({ focusBridgeReinstall }: { focusBridgeReinstall: boolean }) => {
  const { t } = useTranslation();
  const { preferences, update } = useLaunchPreferences();
  const { enabled: keyboardMovementEnabled, setEnabled: setKeyboardMovementEnabled } =
    useOverlayKeyboardMovement();

  return (
    <>
      <SectionTitle>{t("settings.gameSection")}</SectionTitle>
      <div data-tour="settings-game" className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/60">
        <IconSettingRow
          icon={<Gamepad2 size={15} className="text-accent" aria-hidden="true" />}
          title={t("settings.autoOpenApp")}
          description={t("settings.autoOpenAppDesc")}
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
            icon={<Move size={15} className="text-accent" aria-hidden="true" />}
            title={t("settings.keyboardMoveOverlay")}
            description={t("settings.keyboardMoveOverlayDesc")}
          >
            <ToggleSwitch
              checked={keyboardMovementEnabled}
              onChange={(next) => {
                setKeyboardMovementEnabled(next);
                reportSettingChange("keyboard_move_overlay", next);
              }}
              label={t("settings.keyboardMoveOverlay")}
            />
          </IconSettingRow>
        </div>

        <div className="border-t border-border">
          <IconSettingRow
            icon={<MonitorPlay size={15} className="text-accent" aria-hidden="true" />}
            title={t("settings.showOverlayWidget")}
            description={t("settings.showOverlayWidgetDesc")}
          >
            <ToggleSwitch
              checked={preferences.showOverlayWidgetWithGame}
              onChange={(next) => {
                update({ showOverlayWidgetWithGame: next });
                reportSettingChange("show_overlay_widget_with_game", next);
              }}
              label={t("settings.showOverlayWidget")}
            />
          </IconSettingRow>
        </div>

        <div className="border-t border-border">
          <IconSettingRow
            icon={<AppWindow size={15} className="text-accent" aria-hidden="true" />}
            title={t("settings.autoOpenInGame")}
            description={t("settings.autoOpenInGameDesc")}
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
          <BridgeModReinstallSetting focusOnMount={focusBridgeReinstall} />
        </div>
      </div>
    </>
  );
};

/** The global Overwolf hotkeys owned by the desktop window and in-game views.
 * All are rebindable in-app, per Overwolf's guidance. */
const HotkeysSection = ({ hotkeys, focusOnMount }: { hotkeys: HotkeyRebind; focusOnMount: boolean }) => {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
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
    { name: "toggle_overlay", description: t("settings.hotkeyOverlay"), fallback: "Ctrl + M" },
  ];

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !focusOnMount) return;
    node.scrollIntoView({ block: "center" });
    node.focus({ preventScroll: true });
  }, [focusOnMount]);

  return (
    <div
      id="settings-hotkeys"
      ref={rootRef}
      tabIndex={-1}
      className="scroll-m-6 rounded-[var(--radius-lg)] outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
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
    </div>
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
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/60">
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

/** A settings row whose control is a pick-one list. Built as a button + floating
 * listbox — the same control the map's own dropdowns use — because a native
 * <select> drops an OS-drawn white popup into the middle of a dark app. */
const SelectRow = <Value extends string,>({
  title,
  description,
  icon,
  value,
  options,
  onChange,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  value: Value;
  options: { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, rootRef, close);

  const current = options.find((option) => option.value === value);

  return (
    <SettingRow title={title} description={description}>
      <div ref={rootRef} className="relative w-44">
        <button
          type="button"
          onClick={() => setOpen((isOpen) => !isOpen)}
          aria-label={title}
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(
            "flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none transition-colors focus-visible:border-accent",
            open ? "border-accent bg-surface-hover" : "border-border bg-surface/80 hover:bg-surface-hover",
          )}
        >
          {icon}
          <span className="min-w-0 flex-1 truncate text-left font-medium">{current?.label}</span>
          <ChevronDown
            size={13}
            className={cn("shrink-0 text-zinc-500 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>

        {open && (
          <div
            role="listbox"
            aria-label={title}
            className="absolute inset-x-0 top-[calc(100%+6px)] z-50 rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-xl shadow-black/40 animate-fade-in"
          >
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.value);
                    close();
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-surface-hover",
                    selected ? "text-white" : "text-zinc-300",
                  )}
                >
                  <span className="grid w-4 shrink-0 place-items-center">
                    {selected && <Check size={13} className="text-accent" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </SettingRow>
  );
};

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
  <div className="flex items-center justify-between gap-4 px-4 py-4">
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
