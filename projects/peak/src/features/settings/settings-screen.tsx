import {
  AlertTriangle,
  Compass,
  Gamepad2,
  Keyboard,
  Map as MapIcon,
  Settings,
  X,
} from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { twMerge } from "tailwind-merge";
import ToggleSwitch from "../../components/toggle-switch";
import { APP_CONFIG } from "../../config/app-config";
import {
  setPreference,
  usePreferences,
  type AppPreferences,
} from "../../state/preferences-store";
import { IS_OVERWOLF } from "../../utils/platform";
import { HOTKEY_DEFAULTS, useHotkeyRebind, type HotkeyName } from "./use-hotkey-rebind";
import { startOnboarding } from "../onboarding/use-onboarding";
import SettingRow from "./setting-row";

interface SettingsScreenProps {
  onClose: () => void;
}

/**
 * Settings for the desktop window. Every control here drives something the app
 * actually does: launch automation and global hotkeys. These Overwolf-only
 * sections stay out of the plain web build.
 */
const SettingsScreen = ({ onClose }: SettingsScreenProps) => {
  const { t } = useTranslation();
  const preferences = usePreferences();
  const gameConfigured = APP_CONFIG.supportedGameId !== null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const toggle = (key: keyof AppPreferences, value: boolean) => setPreference(key, value);

  return (
    <section className="relative flex h-full flex-col overflow-hidden bg-background animate-fade-in">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
          <Settings size={18} className="text-accent" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold tracking-tight text-primary">{t("settings.title")}</h1>
          <p className="mt-0.5 text-[12px] text-muted">{t("settings.subtitle")}</p>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-subtle transition-colors hover:bg-primary/[0.08] hover:text-primary"
          aria-label={t("settings.close")}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-2xl">
          {/* Game integration */}
          {IS_OVERWOLF && (
            <>
              <SectionLabel>{t("settings.gameSection")}</SectionLabel>
              <div data-tour="settings-game">
                <Card divided>
                  <IconRow
                  icon={Gamepad2}
                  title={t("settings.openOnGameLaunch")}
                  description={t("settings.openOnGameLaunchDescription")}
                >
                  <ToggleSwitch
                    checked={preferences.openOnGameLaunch}
                    disabled={!gameConfigured}
                    label={t("settings.openOnGameLaunch")}
                    onChange={(checked) => toggle("openOnGameLaunch", checked)}
                  />
                  </IconRow>
                  <IconRow
                  icon={MapIcon}
                  title={t("settings.showOverlayOnGameLaunch")}
                  description={t("settings.showOverlayOnGameLaunchDescription")}
                >
                  <ToggleSwitch
                    checked={preferences.showOverlayOnGameLaunch}
                    disabled={!gameConfigured}
                    label={t("settings.showOverlayOnGameLaunch")}
                    onChange={(checked) => toggle("showOverlayOnGameLaunch", checked)}
                  />
                  </IconRow>
                </Card>
              </div>

              {!gameConfigured && (
                <div className="mt-3 flex items-start gap-3 rounded-[var(--radius-md)] border border-accent/25 bg-accent-soft px-4 py-3 text-xs leading-5 text-muted">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                  {t("settings.gameIdMissing")}
                </div>
              )}

              <HotkeysSection />
            </>
          )}

          <HelpSection onClose={onClose} />
        </div>
      </div>
    </section>
  );
};

/* ---------------------------------------------------------------
   Sections
   --------------------------------------------------------------- */

/** The two global hotkeys declared in the manifest, rebindable in place. */
const HotkeysSection = () => {
  const { t } = useTranslation();
  const { bindings, capturing, supported, error, startCapture, cancelCapture } = useHotkeyRebind();

  const rows: Array<{ name: HotkeyName; label: string }> = [
    { name: "toggle_app", label: t("settings.hotkeyApp") },
    { name: "toggle_overlay", label: t("settings.hotkeyOverlay") },
  ];

  return (
    <>
      <SectionLabel className="pt-7">{t("settings.hotkeysSection")}</SectionLabel>
      <div data-tour="settings-hotkeys">
        <Card divided>
          {rows.map(({ name, label }) => (
            <HotkeyRow
              key={name}
              label={label}
              fallback={HOTKEY_DEFAULTS[name]}
              binding={bindings[name]}
              editable={supported}
              capturing={capturing === name}
              anyCapturing={capturing !== null}
              onStart={() => startCapture(name)}
              onCancel={cancelCapture}
            />
          ))}
        </Card>
      </div>
      {error && <p className="px-1 pt-2 text-[11px] text-danger">{error}</p>}
      <p className="px-1 pt-2 text-[11px] leading-relaxed text-subtle">{t("settings.hotkeysNote")}</p>
    </>
  );
};

const HelpSection = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();

  return (
    <>
      <SectionLabel className={IS_OVERWOLF ? "pt-7" : undefined}>
        {t("settings.helpSection")}
      </SectionLabel>
      <Card>
        <SettingRow title={t("settings.replayTour")} description={t("settings.replayTourDesc")}>
          <button
            type="button"
            onClick={() => {
              onClose();
              window.requestAnimationFrame(startOnboarding);
            }}
            className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft px-3 py-2 text-[12.5px] font-semibold text-accent transition-colors hover:bg-accent/15"
          >
            <Compass size={14} aria-hidden="true" />
            {t("settings.startTour")}
          </button>
        </SettingRow>
      </Card>
    </>
  );
};

/* ---------------------------------------------------------------
   Shared pieces
   --------------------------------------------------------------- */

const SectionLabel = ({ children, className }: { children: ReactNode; className?: string }) => (
  <p
    className={twMerge(
      "px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle",
      className,
    )}
  >
    {children}
  </p>
);

const Card = ({ children, divided = false }: { children: ReactNode; divided?: boolean }) => (
  <div
    className={twMerge(
      "overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/60",
      divided && "divide-y divide-border",
    )}
  >
    {children}
  </div>
);

/** A settings row that leads with an icon, used where the control changes how
 * the app behaves outside its own window so the row reads as a system switch. */
const IconRow = ({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Gamepad2;
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <div className="flex items-center justify-between gap-4 px-4 py-4">
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
        <Icon size={15} className="text-accent" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-primary">{title}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{description}</p>
      </div>
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

/** One rebindable hotkey: current combo, plus a Change button that arms capture. */
const HotkeyRow = ({
  label,
  fallback,
  binding,
  editable,
  capturing,
  anyCapturing,
  onStart,
  onCancel,
}: {
  label: string;
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
  const combo =
    binding === undefined ? fallback : binding === "" ? t("settings.hotkeyUnassigned") : binding;

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Keyboard size={14} className="shrink-0 text-subtle" aria-hidden="true" />
        <p className="truncate text-[12.5px] text-muted">{label}</p>
      </div>
      {capturing ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-[var(--radius-sm)] border border-accent bg-accent-soft px-2.5 py-1 font-mono text-[11px] text-accent animate-pulse">
            {t("settings.hotkeyPressKeys")}
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="flex cursor-pointer items-center gap-1 rounded-[var(--radius-md)] border border-border bg-background/60 px-2.5 py-1 text-[11.5px] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-primary"
          >
            <X size={12} aria-hidden="true" />
            {t("settings.hotkeyCancel")}
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <kbd className="rounded-[var(--radius-sm)] border border-border bg-background/60 px-2 py-1 font-mono text-[11px] text-primary">
            {combo}
          </kbd>
          {editable && (
            <button
              type="button"
              onClick={onStart}
              disabled={anyCapturing}
              className="cursor-pointer rounded-[var(--radius-md)] border border-border bg-background/60 px-2.5 py-1 text-[11.5px] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("settings.hotkeyChange")}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SettingsScreen;
