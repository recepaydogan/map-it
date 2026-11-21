import { setCompanionAutoLaunch } from '../lib/analytics/craft-window-analytics'
import { Compass, Download, FolderSearch, Gamepad2, Keyboard, LoaderCircle, MousePointer2, Settings, X } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHotkeyRebind, type HotkeyBindingStatus } from '../hooks/use-hotkey-rebind'
import type { LiveInventoryState } from '../hooks/use-live-inventory.ts'
import type { useLivePosition } from '../hooks/use-live-position'
import { formatHotkeyBinding, type AppHotkeyName } from '../lib/hotkey-bindings'
import { findSelectedTrackingProfile } from '../lib/live-tracking/tracking-installer'
import { useCraftingPlannerStore } from '../store/crafting-planner-store.ts'
import { readPreferences, writePreferences, type AppPreferences } from '../store/preferences'
import { useOnboarding } from '../features/onboarding/use-onboarding'
import { ToggleSwitch } from './toggle-switch'
import { AppLanguagePicker } from './layout/app-language-picker'
import { TrackerLocateModal } from './tracker-locate-modal'
import { isOverwolf } from '../utils/overwolf'
import SubscriptionSettings from '../features/subscriptions/subscription-settings'
import { SUBSCRIPTIONS_ENABLED } from '../features/subscriptions/subscription-runtime'

const pickProfileFolder = (initialPath: string): Promise<string | null> => {
  if (!isOverwolf() || !overwolf.utils?.openFolderPicker) return Promise.resolve(null)
  return new Promise((resolve) => overwolf.utils.openFolderPicker(initialPath, (result) =>
    resolve(result.success && result.path ? result.path : null)))
}

type SettingsPanelProps = {
  onClose: () => void
  onViewPlans: () => void
  inventory: LiveInventoryState
  tracking: ReturnType<typeof useLivePosition>
}

const SettingRow = ({
  children,
  description,
  title,
}: {
  children: ReactNode
  description: string
  title: string
}) => (
  <div className="flex items-center justify-between gap-5 px-4 py-4">
    <div className="min-w-0">
      <p className="text-[13px] font-medium text-[var(--text)]">{title}</p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--muted)]">{description}</p>
    </div>
    <div className="shrink-0">{children}</div>
  </div>
)

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <p className="px-1 pb-2 pt-7 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
    {children}
  </p>
)

function HotkeyRow({
  anyCapturing,
  binding,
  capturePreview,
  capturing,
  description,
  name,
  onCancel,
  onStart,
  status,
  supported,
}: {
  anyCapturing: boolean
  binding?: string
  capturePreview: string
  capturing: boolean
  description: string
  name: AppHotkeyName
  onCancel: () => void
  onStart: (name: AppHotkeyName) => void
  status: HotkeyBindingStatus
  supported: boolean
}) {
  const { t } = useTranslation()
  const label = status === 'loading'
    ? t('common.loading')
    : status === 'unavailable'
      ? t('settings.hotkeyOverwolfOnly')
      : binding
        ? formatHotkeyBinding(binding)
        : t('settings.hotkeyUnassigned')

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <p className="text-[12.5px] text-[var(--text)]">{description}</p>
      {capturing ? (
        <div className="flex shrink-0 items-center gap-2">
          <kbd aria-live="polite" aria-atomic="true" className="min-w-20 animate-pulse rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2.5 py-1 text-center font-mono text-[11px] text-[var(--text)]">
            {capturePreview || t('settings.hotkeyPressKeys')}
          </kbd>
          <button type="button" onClick={onCancel} className="cursor-pointer rounded-[var(--radius-md)] border border-[var(--border)] bg-black/30 px-2.5 py-1 text-[11px] text-[var(--muted)] hover:text-[var(--text)]">
            {t('settings.hotkeyCancel')}
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <kbd aria-live="polite" className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/30 px-2 py-1 font-mono text-[11px] text-[var(--text)]">
            {label}
          </kbd>
          {supported ? (
            <button type="button" disabled={anyCapturing} onClick={() => onStart(name)} className="cursor-pointer rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2.5 py-1 text-[11px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-40">
              {t('settings.hotkeyChange')}
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

export function SettingsPanel({ onClose, onViewPlans, inventory, tracking }: SettingsPanelProps) {
  const { t } = useTranslation()
  const [preferences, setPreferences] = useState<AppPreferences>(readPreferences)
  const [installingTracker, setInstallingTracker] = useState(false)
  const [locatingTracker, setLocatingTracker] = useState(false)
  const [pickingProfile, setPickingProfile] = useState(false)
  const [invalidProfile, setInvalidProfile] = useState(false)
  const trackerBusy = installingTracker || tracking.status === 'installing'
  const installTracker = async () => {
    if (trackerBusy || tracking.status === 'unsupported') return
    setInstallingTracker(true)
    try {
      await tracking.retryInstall()
    } finally {
      setInstallingTracker(false)
    }
  }
  const selectProfile = async () => {
    if (pickingProfile || trackerBusy || tracking.status === 'unsupported') return
    setPickingProfile(true)
    try {
      const selected = await pickProfileFolder(preferences.trackingProfileDirectory ?? preferences.trackingInstallDirectory ?? '')
      if (!selected) return
      const profile = await findSelectedTrackingProfile(selected)
      if (!profile) { setInvalidProfile(true); return }
      setInvalidProfile(false)
      updatePreference('trackingProfileDirectory', profile)
      await tracking.retryInstall()
    } finally {
      setPickingProfile(false)
    }
  }
  const hotkeys = useHotkeyRebind()
  const notifications = useCraftingPlannerStore((state) => state.notifications)
  const startTour = useOnboarding((state) => state.start)
  const setNotificationPreferences = useCraftingPlannerStore((state) => state.setNotificationPreferences)
  const updatePreference = <Key extends keyof AppPreferences>(key: Key, value: AppPreferences[Key]) => {
    const next = { ...readPreferences(), [key]: value }
    setPreferences(next)
    writePreferences(next)
  }
  useEffect(() => {
    const sync = () => setPreferences(readPreferences())
    window.addEventListener('storage', sync)
    window.addEventListener('valheim-companion:preferences-changed', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('valheim-companion:preferences-changed', sync)
    }
  }, [])
  const inventoryActive = preferences.inventoryTrackingEnabled

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || hotkeys.capturing || locatingTracker || document.querySelector('[data-premium-plans], [data-language-menu="open"]')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [hotkeys.capturing, locatingTracker, onClose])

  return (
    <main className="h-full overflow-y-auto bg-[var(--background)]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--background)]/95 px-6 py-4 backdrop-blur-xl">
        <span className="grid size-10 place-items-center rounded-[var(--radius-md)] border border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent-text)]">
          <Settings size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold tracking-tight text-[var(--text)]">{t('settings.title')}</h1>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">{t('settings.description')}</p>
        </div>
        <div className="flex-1" />
        <button type="button" onClick={onClose} className="grid size-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-[var(--muted)] hover:bg-white/[0.06] hover:text-[var(--text)]" aria-label={t('settings.close')}>
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="mx-auto w-full max-w-2xl px-6 pb-10">
        {SUBSCRIPTIONS_ENABLED && <div className="pt-7"><SubscriptionSettings onViewPlans={onViewPlans} /></div>}
        <SectionLabel>{t('settings.languageSection')}</SectionLabel>
        <section className="relative z-20 divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]/60">
          <SettingRow title={t('settings.language')} description={t('settings.languageDescription')}>
            <AppLanguagePicker variant="settings" />
          </SettingRow>
        </section>

        <SectionLabel>{t('settings.gameSection')}</SectionLabel>
        <section className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]/60">
          <SettingRow title={t('settings.tracker')} description={t('settings.trackerDescription')}>
            <button
              type="button"
              onClick={() => void installTracker()}
              disabled={trackerBusy || tracking.status === 'unsupported'}
              aria-busy={trackerBusy}
              className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-2 text-[12.5px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {trackerBusy ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
              {t(trackerBusy ? 'tracking.installing' : 'settings.installTracker')}
            </button>
          </SettingRow>
          <div className="px-4 py-3">
            <p role="status" className="text-[11.5px] leading-relaxed text-[var(--muted)]">
              {t(`tracking.status.${trackerBusy ? 'installing' : tracking.status}`)}
            </p>
            {!trackerBusy && tracking.error ? (
              <p role="alert" className="mt-1.5 text-[11px] text-red-300">
                {t(`tracking.errors.${tracking.error}`, { defaultValue: t('tracking.errors.unknown') })}
              </p>
            ) : null}
            {!trackerBusy && tracking.error === 'valheim-not-found' ? (
              <button
                type="button"
                onClick={() => setLocatingTracker(true)}
                className="mt-2 flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-2 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
              >
                <FolderSearch size={14} aria-hidden="true" />
                {t('tracking.locate.find')}
              </button>
            ) : null}
          </div>
          <SettingRow title={t('settings.trackerProfile')} description={t('settings.trackerProfileDescription')}>
            <button
              type="button"
              onClick={() => void selectProfile()}
              disabled={trackerBusy || pickingProfile || tracking.status === 'unsupported'}
              className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-2 text-[12.5px] font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pickingProfile ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <FolderSearch size={14} aria-hidden="true" />}
              {t('settings.chooseTrackerProfile')}
            </button>
          </SettingRow>
          {preferences.trackingProfileDirectory || invalidProfile ? (
            <div className="px-4 pb-3 text-[11.5px] text-[var(--muted)]">
              {invalidProfile ? <p role="alert" className="text-red-300">{t('settings.trackerProfileInvalid')}</p> : null}
              {preferences.trackingProfileDirectory ? (
                <p>
                  <span className="truncate" title={preferences.trackingProfileDirectory}>
                    {t('settings.trackerProfileSelected', { name: preferences.trackingProfileDirectory.split('\\').pop() })}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
          <SettingRow title={t('settings.overlayEnabled')} description={t('settings.overlayEnabledDescription')}>
            <ToggleSwitch checked={preferences.overlayEnabled} label={t('settings.overlayEnabled')} onChange={(checked) => updatePreference('overlayEnabled', checked)} />
          </SettingRow>
          <SettingRow title={t('settings.autoShowOverlay')} description={t('settings.autoShowOverlayDescription')}>
            <ToggleSwitch checked={preferences.autoShowOverlay} label={t('settings.autoShowOverlay')} onChange={(checked) => updatePreference('autoShowOverlay', checked)} />
          </SettingRow>
          <SettingRow title={t('settings.autoOpenInGameApp')} description={t('settings.autoOpenInGameAppDescription')}>
            <ToggleSwitch checked={preferences.autoOpenInGameApp} label={t('settings.autoOpenInGameApp')} onChange={(checked) => updatePreference('autoOpenInGameApp', checked)} />
          </SettingRow>
        </section>

        <SectionLabel>{t('settings.craftWindows')}</SectionLabel>
        <section className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]/60">
          <SettingRow title={t('settings.autoLaunchCompanion')} description={t('settings.autoLaunchCompanionDescription')}>
            <ToggleSwitch checked={preferences.autoLaunchCompanion} label={t('settings.autoLaunchCompanion')} onChange={(checked) => setCompanionAutoLaunch(checked, 'settings')} />
          </SettingRow>
        </section>
        <SectionLabel>{t('settings.plannerSection')}</SectionLabel>
        <section className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]/60">
          <SettingRow title={t('settings.liveInventory')} description={t('settings.liveInventoryDescription')}>
            <ToggleSwitch
              checked={inventoryActive}
              label={t('settings.liveInventory')}
              onChange={(checked) => {
                // Enabling can fail (no tracker installed), so the switch follows
                // what was actually written rather than the click.
                void (checked ? inventory.enable() : inventory.disable())
                  .then(() => setPreferences(readPreferences()))
              }}
            />
          </SettingRow>
          <div className="px-4 py-3">
            <p className="text-[11.5px] leading-relaxed text-[var(--muted)]">
              {t(`planner.inventory.explain.${inventory.status}`)}
            </p>
            {inventory.error ? (
              <p className="mt-1.5 text-[11px] text-red-300">
                {t(`tracking.errors.${inventory.error}`, { defaultValue: t('tracking.errors.unknown') })}
              </p>
            ) : null}
          </div>
          <SettingRow title={t('settings.inventoryCharacter')} description={t('settings.inventoryCharacterDescription')}>
            <ToggleSwitch
              checked={preferences.inventorySources.characterInventory}
              disabled={!inventoryActive}
              label={t('settings.inventoryCharacter')}
              onChange={(checked) => updatePreference('inventorySources', {
                ...preferences.inventorySources,
                characterInventory: checked,
              })}
            />
          </SettingRow>
          <SettingRow title={t('settings.inventoryEquipped')} description={t('settings.inventoryEquippedDescription')}>
            <ToggleSwitch
              checked={preferences.inventorySources.equippedItems}
              disabled={!inventoryActive}
              label={t('settings.inventoryEquipped')}
              onChange={(checked) => updatePreference('inventorySources', {
                ...preferences.inventorySources,
                equippedItems: checked,
              })}
            />
          </SettingRow>
          <SettingRow title={t('settings.inventoryOwnContainers')} description={t('settings.inventoryOwnContainersDescription')}>
            <ToggleSwitch
              checked={preferences.inventorySources.ownContainers}
              disabled={!inventoryActive}
              label={t('settings.inventoryOwnContainers')}
              onChange={(checked) => updatePreference('inventorySources', {
                ...preferences.inventorySources,
                ownContainers: checked,
              })}
            />
          </SettingRow>
          <SettingRow title={t('settings.notifyTargetReady')} description={t('settings.notifyTargetReadyDescription')}>
            <ToggleSwitch
              checked={notifications.targetReady}
              label={t('settings.notifyTargetReady')}
              onChange={(checked) => setNotificationPreferences({ targetReady: checked })}
            />
          </SettingRow>
          <SettingRow title={t('settings.notifyMaterialCompleted')} description={t('settings.notifyMaterialCompletedDescription')}>
            <ToggleSwitch
              checked={notifications.materialCompleted}
              label={t('settings.notifyMaterialCompleted')}
              onChange={(checked) => setNotificationPreferences({ materialCompleted: checked })}
            />
          </SettingRow>
          <SettingRow title={t('settings.notifyPlanCompleted')} description={t('settings.notifyPlanCompletedDescription')}>
            <ToggleSwitch
              checked={notifications.planCompleted}
              label={t('settings.notifyPlanCompleted')}
              onChange={(checked) => setNotificationPreferences({ planCompleted: checked })}
            />
          </SettingRow>
        </section>
        <p className="px-1 pt-2 text-[11px] leading-relaxed text-[var(--muted)]">{t('settings.plannerPrivacyNote')}</p>

        <SectionLabel>{t('settings.hotkeysSection')}</SectionLabel>
        <section className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]/60">
          <HotkeyRow name="toggle_app" description={t('settings.desktopHotkey')} binding={hotkeys.bindings.toggle_app} capturePreview={hotkeys.capturePreview} status={hotkeys.status} supported={hotkeys.supported} capturing={hotkeys.capturing === 'toggle_app'} anyCapturing={hotkeys.capturing !== null} onStart={hotkeys.startCapture} onCancel={hotkeys.cancelCapture} />
          <HotkeyRow name="toggle_in_game_app" description={t('settings.inGameAppHotkey')} binding={hotkeys.bindings.toggle_in_game_app} capturePreview={hotkeys.capturePreview} status={hotkeys.status} supported={hotkeys.supported} capturing={hotkeys.capturing === 'toggle_in_game_app'} anyCapturing={hotkeys.capturing !== null} onStart={hotkeys.startCapture} onCancel={hotkeys.cancelCapture} />
          <HotkeyRow name="toggle_overlay" description={t('settings.overlayHotkey')} binding={hotkeys.bindings.toggle_overlay} capturePreview={hotkeys.capturePreview} status={hotkeys.status} supported={hotkeys.supported} capturing={hotkeys.capturing === 'toggle_overlay'} anyCapturing={hotkeys.capturing !== null} onStart={hotkeys.startCapture} onCancel={hotkeys.cancelCapture} />
        {(['toggle_craft_overlay', 'toggle_companion'] as const).map((name) => <HotkeyRow key={name} name={name} description={t(`settings.${name}`)} binding={hotkeys.bindings[name]} capturePreview={hotkeys.capturePreview} status={hotkeys.status} supported={hotkeys.supported} capturing={hotkeys.capturing === name} anyCapturing={hotkeys.capturing !== null} onStart={hotkeys.startCapture} onCancel={hotkeys.cancelCapture} />)}
        </section>
        {hotkeys.assignError ? <p className="px-1 pt-2 text-[11px] text-red-300">{t('settings.hotkeyAssignFailed', { error: hotkeys.assignError })}</p> : null}
        {hotkeys.status === 'error' ? <p className="px-1 pt-2 text-[11px] text-red-300">{t('settings.hotkeyReadFailed')}</p> : null}
        <p className="px-1 pt-2 text-[11px] leading-relaxed text-[var(--muted)]">{t('settings.hotkeysNote')}</p>

        <SectionLabel>{t('settings.mapControlsSection')}</SectionLabel>
        <section className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]/60">
          {[
            [t('settings.mapDrag'), t('settings.mapDragControl')],
            [t('settings.mapZoom'), t('settings.mapZoomControl')],
            [t('settings.mapCluster'), t('settings.mapClusterControl')],
            [t('settings.closePanels'), 'Esc'],
          ].map(([description, key]) => (
            <div key={description} className="flex items-center justify-between gap-4 px-4 py-3">
              <p className="flex items-center gap-2 text-[12.5px] text-[var(--text)]">
                {description === t('settings.mapDrag') ? <MousePointer2 size={14} className="text-[var(--accent-text)]" aria-hidden="true" /> : <Keyboard size={14} className="text-[var(--accent-text)]" aria-hidden="true" />}
                {description}
              </p>
              <kbd className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/30 px-2 py-1 font-mono text-[11px] text-[var(--text)]">{key}</kbd>
            </div>
          ))}
        </section>

        <SectionLabel>{t('settings.helpSection', { defaultValue: 'Help & Tour' })}</SectionLabel>
        <section data-tour="settings-replay" className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]/60">
          <SettingRow
            title={t('settings.replayTour', { defaultValue: 'Replay Guided Tour' })}
            description={t('settings.replayTourDesc', { defaultValue: 'Restart the welcome tour to learn about the app\'s layout.' })}
          >
            <button
              onClick={() => {
                onClose()
                startTour()
              }}
              className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-2 text-[12.5px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              <Compass size={14} aria-hidden="true" />
              {t('settings.startTour', { defaultValue: 'Start Tour' })}
            </button>
          </SettingRow>
        </section>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-[var(--muted)]">
          <Gamepad2 size={13} aria-hidden="true" />{t('settings.saved')}
        </p>
      </div>
      {locatingTracker ? (
        <TrackerLocateModal
          visible
          manual
          onDismiss={() => setLocatingTracker(false)}
          onLocated={async () => {
            await installTracker()
            setLocatingTracker(false)
          }}
        />
      ) : null}
    </main>
  )
}
