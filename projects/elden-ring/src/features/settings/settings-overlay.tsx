import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Compass, Gamepad2, Settings, Sparkles, Swords, X } from "lucide-react";
import ToggleSwitch from "../../components/toggle-switch";
import LanguageSwitcher from "./language-switcher";
import { cn } from "../../lib/cn";
import PrivacyChoicesSection from "../ads/privacy-choices-section";
import { useOnboarding } from "../onboarding/use-onboarding";
import { useWhatsNew } from "../whats-new/use-whats-new";
import { useMapStore } from "../../store/map-store";
import { IS_OVERWOLF } from "../../utils/platform";
import { useLaunchPreferences } from "../../state/use-launch-preferences";
import { useCompanionHotkey } from "./use-companion-hotkey";
import { useHotkeyRebind, type HotkeyName } from "./use-hotkey-rebind";

/**
 * In-app Settings page. Shares the codex overlay's shell language (full-bleed
 * backdrop, header + close, fade-in) but its own quiet body — a single narrow
 * column, not the codex's data-browser columns. Lives inside MapShell, so it is
 * constrained to the non-ads region and never covers the Overwolf ad rail.
 *
 * Scope is deliberately one focused section (Map display) rather than a padded
 * grid of half-empty cards; more sections slot in as real preferences appear.
 */
const SettingsOverlay = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const clusterMarkers = useMapStore((s) => s.clusterMarkers);
  const setClusterMarkers = useMapStore((s) => s.setClusterMarkers);
  const clusterBelowPercent = useMapStore((s) => s.clusterBelowPercent);
  const setClusterBelowPercent = useMapStore((s) => s.setClusterBelowPercent);
  const markerZoomEnabled = useMapStore((s) => s.markerZoomEnabled);
  const setMarkerZoomEnabled = useMapStore((s) => s.setMarkerZoomEnabled);
  const markerZoomPercent = useMapStore((s) => s.markerZoomPercent);
  const setMarkerZoomPercent = useMapStore((s) => s.setMarkerZoomPercent);
  const startTour = useOnboarding((s) => s.start);
  const showWhatsNew = useWhatsNew((s) => s.show);

  // ESC closes Settings first. Capture + stopImmediatePropagation so the
  // app-wide ESC handler (selection / filter rail) doesn't also fire underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-[1500] flex flex-col bg-background animate-fade-in">
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
          onClick={onClose}
          aria-label={t("settings.close")}
          className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/8 hover:text-white cursor-pointer"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-2xl">
          <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {t("settings.languageSection")}
          </p>
          <div className="mb-7 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/60">
            <SettingRow title={t("settings.language")} description={t("settings.languageDesc")}>
              <LanguageSwitcher />
            </SettingRow>
          </div>

          <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {t("settings.mapSection")}
          </p>
          <div
            data-tour="settings-map"
            className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/60"
          >
            <SettingRow
              title={t("settings.groupNearby")}
              description={t("settings.groupNearbyDesc")}
            >
              <ToggleSwitch
                checked={clusterMarkers}
                onChange={setClusterMarkers}
                label={t("settings.groupNearby")}
              />
            </SettingRow>

            <div
              className={cn(
                "border-t border-border px-4 py-4 transition-opacity",
                clusterMarkers ? "opacity-100" : "pointer-events-none opacity-50",
              )}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-white">{t("settings.groupBelowZoom")}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                    {t("settings.groupBelowZoomDesc")}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[15px] font-semibold tabular-nums text-accent">
                  {clusterBelowPercent}%
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                step={1}
                value={clusterBelowPercent}
                disabled={!clusterMarkers}
                onChange={(e) => setClusterBelowPercent(Number(e.target.value))}
                aria-label={t("settings.groupBelowZoomAria")}
                className="mt-3 w-full cursor-pointer [accent-color:var(--color-accent)] disabled:cursor-not-allowed"
              />
            </div>

            <div className="border-t border-border">
              <SettingRow
                title={t("settings.markerZoom")}
                description={t("settings.markerZoomDesc")}
              >
                <ToggleSwitch
                  checked={markerZoomEnabled}
                  onChange={setMarkerZoomEnabled}
                  label={t("settings.markerZoom")}
                />
              </SettingRow>
            </div>

            <div
              className={cn(
                "border-t border-border px-4 py-4 transition-opacity",
                markerZoomEnabled ? "opacity-100" : "pointer-events-none opacity-50",
              )}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-white">{t("settings.markerZoomLevel")}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                    {t("settings.markerZoomLevelDesc")}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[15px] font-semibold tabular-nums text-accent">
                  {markerZoomPercent}%
                </span>
              </div>
              <input
                type="range"
                min={100}
                max={400}
                step={5}
                value={markerZoomPercent}
                disabled={!markerZoomEnabled}
                onChange={(e) => setMarkerZoomPercent(Number(e.target.value))}
                aria-label={t("settings.markerZoomLevelAria")}
                className="mt-3 w-full cursor-pointer [accent-color:var(--color-accent)] disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <ShortcutsSection />

          {IS_OVERWOLF && <GameIntegrationSection />}

          {IS_OVERWOLF && <OverlayHotkeysSection />}

          <p className="px-1 pb-2 pt-7 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {t("settings.helpSection")}
          </p>
          <div
            data-tour="settings-replay"
            className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/60"
          >
            <SettingRow
              title={t("settings.replayTour")}
              description={t("settings.replayTourDesc")}
            >
              <button
                onClick={() => {
                  // Close Settings first so the tour can spotlight the live map underneath.
                  onClose();
                  startTour();
                }}
                className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft px-3 py-2 text-[12.5px] font-semibold text-accent transition-colors hover:bg-accent/15 cursor-pointer"
              >
                <Compass size={14} aria-hidden="true" />
                {t("settings.startTour")}
              </button>
            </SettingRow>
            <SettingRow
              title={t("settings.whatsNew")}
              description={t("settings.whatsNewDesc")}
            >
              <button
                onClick={() => {
                  // Same reason as the tour: it paints over the map, not over Settings.
                  onClose();
                  showWhatsNew();
                }}
                className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-white/[0.03] px-3 py-2 text-[12.5px] font-semibold text-zinc-200 transition-colors hover:border-accent/30 hover:text-white cursor-pointer"
              >
                <Sparkles size={14} aria-hidden="true" />
                {t("settings.showWhatsNew")}
              </button>
            </SettingRow>
          </div>

          <PrivacyChoicesSection />
        </div>
      </div>
    </div>
  );
};

/** A quiet reference for the map's keyboard navigation — power features that are otherwise
 * invisible (directional jumps, marker cycling). Documentation, not a control. */
const ShortcutsSection = () => {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    ["W / A / S / D", t("settings.shortcutMove")],
    ["Esc", t("settings.shortcutEsc")],
    [t("settings.shortcutClickKey"), t("settings.shortcutClick")],
  ];
  return (
    <>
      <p className="px-1 pb-2 pt-7 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {t("settings.keyboardSection")}
      </p>
      <div
        data-tour="settings-shortcuts"
        className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/60"
      >
        {rows.map(([keys, desc]) => (
          <div key={keys} className="flex items-center justify-between gap-4 px-4 py-3">
            <p className="text-[12.5px] text-zinc-300">{desc}</p>
            <kbd className="shrink-0 rounded-[var(--radius-sm)] border border-border bg-black/30 px-2 py-1 font-mono text-[11px] text-zinc-200">
              {keys}
            </kbd>
          </div>
        ))}
      </div>
    </>
  );
};

/** Game integration — how the Atlas app behaves when Elden Ring / Nightreign
 * launches. One control gates the DESKTOP window's auto-open; the in-game corner
 * map widget is separate and always appears, so it is called out in the copy.
 * Overwolf-only (the plain web build never sees a game launch). */
const GameIntegrationSection = () => {
  const { t } = useTranslation();
  const { preferences, update } = useLaunchPreferences();
  const companionHotkey = useCompanionHotkey();

  return (
    <>
      <p className="px-1 pb-2 pt-7 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {t("settings.gameSection")}
      </p>
      <div
        data-tour="settings-game"
        className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/60"
      >
        <div className="flex items-center justify-between gap-4 px-4 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
              <Gamepad2 size={15} className="text-accent" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-white">{t("settings.autoOpenApp")}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                {t("settings.autoOpenAppDesc")}
              </p>
            </div>
          </div>
          <ToggleSwitch
            checked={preferences.autoOpenInGameApp}
            onChange={(next) => update({ autoOpenInGameApp: next })}
            label={t("settings.autoOpenApp")}
          />
        </div>

        {/* The Roundtable opens with the game like the desktop window does.
            Off doesn't remove it — the hotkey below still brings it up, which is
            why the copy names the shortcut instead of just saying "off". */}
        <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
              <Swords size={15} className="text-accent" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-white">{t("settings.autoOpenCompanion")}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                {t("settings.autoOpenCompanionDesc", { hotkey: companionHotkey })}
              </p>
            </div>
          </div>
          <ToggleSwitch
            checked={preferences.openCompanionWithGame}
            onChange={(next) => update({ openCompanionWithGame: next })}
            label={t("settings.autoOpenCompanion")}
          />
        </div>
      </div>
    </>
  );
};

/** The global Overwolf hotkeys that drive the in-game windows (the Atlas window and
 * the map overlay), plus Overwolf's built-in exclusive-mode toggle. Overwolf-only —
 * these do nothing in the plain web build. The two app hotkeys are rebindable
 * in-app (per Overwolf's guidance); the exclusive-mode toggle is a platform
 * built-in, so it stays read-only documentation. */
const OverlayHotkeysSection = () => {
  const { t } = useTranslation();
  const { bindings, capturing, supported, error, startCapture, cancelCapture } =
    useHotkeyRebind();

  return (
    <>
      <p className="px-1 pb-2 pt-7 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {t("settings.hotkeysSection")}
      </p>
      <div
        data-tour="settings-hotkeys"
        className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/60"
      >
        <HotkeyRow
          name="toggle_app"
          desc={t("settings.hotkeyAtlas")}
          fallback="Ctrl + Shift + D"
          binding={bindings.toggle_app}
          editable={supported}
          capturing={capturing === "toggle_app"}
          anyCapturing={capturing !== null}
          onStart={() => startCapture("toggle_app")}
          onCancel={cancelCapture}
        />
        <HotkeyRow
          name="toggle_companion"
          desc={t("settings.hotkeyCompanion")}
          fallback="Ctrl + Shift + B"
          binding={bindings.toggle_companion}
          editable={supported}
          capturing={capturing === "toggle_companion"}
          anyCapturing={capturing !== null}
          onStart={() => startCapture("toggle_companion")}
          onCancel={cancelCapture}
        />
        <HotkeyRow
          name="toggle_overlay"
          desc={t("settings.hotkeyMap")}
          fallback="Ctrl + M"
          binding={bindings.toggle_overlay}
          editable={supported}
          capturing={capturing === "toggle_overlay"}
          anyCapturing={capturing !== null}
          onStart={() => startCapture("toggle_overlay")}
          onCancel={cancelCapture}
        />
        <HotkeyRow
          name="dismiss_overlay"
          desc={t("settings.hotkeyDismiss")}
          fallback="Ctrl + Shift + M"
          binding={bindings.dismiss_overlay}
          editable={supported}
          capturing={capturing === "dismiss_overlay"}
          anyCapturing={capturing !== null}
          onStart={() => startCapture("dismiss_overlay")}
          onCancel={cancelCapture}
        />
        {/* Overwolf's exclusive-mode toggle is a platform hotkey — not ours to reassign. */}
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <p className="text-[12.5px] text-zinc-300">{t("settings.hotkeyExclusive")}</p>
          <kbd className="shrink-0 rounded-[var(--radius-sm)] border border-border bg-black/30 px-2 py-1 font-mono text-[11px] text-zinc-200">
            Ctrl + Tab
          </kbd>
        </div>
      </div>
      {error && <p className="px-1 pt-2 text-[11px] text-red-400">{error}</p>}
      <p className="px-1 pt-2 text-[11px] leading-relaxed text-zinc-500">
        {t("settings.hotkeysNote")}
      </p>
    </>
  );
};

/** One rebindable hotkey row: description + current binding, with a Change button
 * that arms key capture ("Press keys…" + Cancel). Falls back to read-only when the
 * Overwolf hotkeys API isn't available. */
const HotkeyRow = ({
  desc,
  fallback,
  binding,
  editable,
  capturing,
  anyCapturing,
  onStart,
  onCancel,
}: {
  name: HotkeyName;
  desc: string;
  fallback: string;
  binding: string | undefined;
  editable: boolean;
  capturing: boolean;
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
      <p className="text-[12.5px] text-zinc-300">{desc}</p>
      {capturing ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-[var(--radius-sm)] border border-accent bg-accent-soft px-2.5 py-1 font-mono text-[11px] text-accent animate-pulse">
            {t("settings.hotkeyPressKeys")}
          </span>
          <button
            onClick={onCancel}
            className="flex items-center gap-1 rounded-[var(--radius-md)] border border-border bg-black/30 px-2.5 py-1 text-[11.5px] font-medium text-zinc-300 transition-colors hover:bg-white/8 hover:text-white cursor-pointer"
          >
            <X size={12} aria-hidden="true" />
            {t("settings.hotkeyCancel")}
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <kbd className="rounded-[var(--radius-sm)] border border-border bg-black/30 px-2 py-1 font-mono text-[11px] text-zinc-200">
            {label}
          </kbd>
          {editable && (
            <button
              onClick={onStart}
              disabled={anyCapturing}
              className="rounded-[var(--radius-md)] border border-border bg-black/30 px-2.5 py-1 text-[11.5px] font-medium text-zinc-300 transition-colors hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              {t("settings.hotkeyChange")}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/** A labelled settings row: title + description on the left, its control on the
 * right. Shared by every "label ↔ control" preference in the panel. */
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

export default SettingsOverlay;
