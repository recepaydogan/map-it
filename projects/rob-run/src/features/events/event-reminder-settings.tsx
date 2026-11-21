import { Square, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { playEventAudio, stopEventAudio, unlockEventAudio, type EventSound } from "./event-audio";
import type { EventPreferences } from "./use-event-preferences";

export default function EventReminderSettings({ preferences, update, onAudioError, onTest }: {
  preferences: EventPreferences;
  update: (patch: Partial<EventPreferences>) => void;
  onAudioError: (error: unknown) => void;
  onTest: () => void;
}) {
  const { t } = useTranslation();
  return <section id="event-reminder-settings" aria-label={t("events.reminderSettings")} className="border-b border-border bg-surface/40 px-6 py-5">
    <div className="mx-auto max-w-5xl">
      <div className="grid gap-4 @min-[620px]:grid-cols-[1fr_1fr_1fr_auto]">
        <div><p className="mb-2 text-xs text-subtle">{t("events.notifyBefore")}</p><CategoryDropdown ariaLabel={t("events.notifyBefore")} value={String(preferences.leadMinutes)} onChange={(value) => update({ leadMinutes: Number(value) })} options={[1, 5, 10, 15].map((value) => ({ key: String(value), label: t("events.minutes", { count: value }) }))} /></div>
        <div><p className="mb-2 text-xs text-subtle">{t("events.sound")}</p><CategoryDropdown ariaLabel={t("events.sound")} value={preferences.sound} onChange={(value) => { update({ sound: value as EventSound }); if (value === "off") stopEventAudio(); else void unlockEventAudio().catch(onAudioError); }} options={["chime", "bell", "off"].map((key) => ({ key, label: t(`events.sounds.${key}`) }))} /></div>
        <div><p className="mb-2 text-xs text-subtle">{t("events.playFor")}</p><CategoryDropdown ariaLabel={t("events.playFor")} value={String(preferences.soundSeconds)} onChange={(value) => update({ soundSeconds: Number(value) })} options={[3, 10, 20].map((value) => ({ key: String(value), label: t("events.seconds", { count: value }) }))} /></div>
        <div className="flex items-end gap-2">
          <button type="button" disabled={preferences.sound === "off"} onClick={() => { onTest(); void playEventAudio(preferences.sound, preferences.soundSeconds).catch(onAudioError); }} className="flex h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border px-3 text-xs text-zinc-100 hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-subtle"><Volume2 size={14} aria-hidden="true" />{t("events.test")}</button>
          <button type="button" onClick={stopEventAudio} aria-label={t("events.stop")} className="grid h-10 w-10 cursor-pointer place-items-center rounded-[var(--radius-sm)] border border-border text-subtle hover:bg-surface-hover hover:text-white"><Square size={12} aria-hidden="true" /></button>
        </div>
      </div>
    </div>
  </section>;
}
