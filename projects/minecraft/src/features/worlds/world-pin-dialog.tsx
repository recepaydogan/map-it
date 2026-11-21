import { useEffect, useRef, useState } from "react";
import { Check, Copy, MapPinPlus, Pencil, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { formatGameTeleportCommand } from "../../game-config";
import { DEFAULT_USER_MARKER_COLOR, DEFAULT_USER_MARKER_ICON } from "../map/map-config";
import MapPointIcon from "../map/map-point-icon";
import { DEFAULT_MARKER_GROUP, MARKER_GROUPS } from "../map/marker-group-config";
import type { UserMarkerColor } from "../map/types";
import type { WorldPin } from "./world-types";
import { customWorldPinGroupName } from "./world-pin-group";
import WorldPinGroupPicker from "./world-pin-group-picker";
import WorldPinStylePicker from "./world-pin-style-picker";
import { getWorldPinAppearance } from "./world-pin-style";

export interface WorldPinDraft {
  pin: WorldPin;
  source: "placement" | "edit";
}

const WorldPinDialog = ({ draft, availableGroups, onClose, onSave, onRemove, onDraftChange }: {
  draft: WorldPinDraft;
  availableGroups: readonly string[];
  onClose: () => void;
  onSave: (pin: WorldPin) => Promise<void>;
  onRemove?: () => Promise<void>;
  onDraftChange?: (pin: WorldPin) => void;
}) => {
  const { t } = useTranslation();
  const [pin, setPin] = useState(draft.pin);
  const [editing, setEditing] = useState(draft.source === "placement");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const nameRef = useRef<HTMLInputElement>(null);
  const color = (pin.color || DEFAULT_USER_MARKER_COLOR) as UserMarkerColor;
  const icon = pin.icon || DEFAULT_USER_MARKER_ICON;
  const group = pin.group || DEFAULT_MARKER_GROUP;
  const appearance = getWorldPinAppearance(icon, color);
  const groupName = MARKER_GROUPS.some(item => item.id === group)
    ? t(`map.markerGroups.${group}`) : customWorldPinGroupName(group) ?? group;
  const coordinates = `X ${pin.x}, Y ${pin.y ?? "—"}, Z ${pin.z}`;

  useEffect(() => {
    if (draft.source === "placement") nameRef.current?.focus();
  }, [draft.source]);
  useEffect(() => {
    if (copyStatus === "idle") return;
    const timer = window.setTimeout(() => setCopyStatus("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (pending) return;
      if (editing && draft.source === "edit") { setPin(draft.pin); setEditing(false); }
      else onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [draft.pin, draft.source, editing, onClose, pending]);

  const save = async () => {
    if (pending || !pin.name.trim()) return;
    setPending(true); setFailed(false);
    try {
      await onSave({ ...pin, name: pin.name.trim().slice(0, 200),
        y: pin.y === null ? null : Math.round(pin.y), note: pin.note.trim().slice(0, 10_000) });
      setEditing(false);
    } catch (error) { console.error("Personal marker save failed", error); setFailed(true); }
    finally { setPending(false); }
  };
  const remove = async () => {
    if (!onRemove || pending) return;
    setPending(true); setFailed(false);
    try { await onRemove(); }
    catch (error) { console.error("Personal marker removal failed", error); setFailed(true); setPending(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(formatGameTeleportCommand(pin)); setCopyStatus("copied"); }
    catch (error) { console.error("Personal marker coordinate copy failed", error); setCopyStatus("failed"); }
  };

  return <section data-map-ui aria-label={t("map.custom.personal")}
    className="world-pin-panel absolute bottom-[4.75rem] left-3 top-[3.75rem] z-[70] flex w-[min(360px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/95 shadow-[var(--panel-shadow)] backdrop-blur-xl">
    <header className="flex shrink-0 items-start gap-3 border-b border-border bg-black/15 p-4">
      <span className={cn("map-details-icon", appearance.markerClass,
        appearance.darkArtwork && "map-marker-dark-artwork")}
        style={appearance.accentColor ? { borderColor: appearance.accentColor, color: appearance.accentColor } : undefined}>
        <MapPointIcon fallback={appearance.icon} source={appearance.source} size={24} />
      </span>
      <div className="min-w-0 flex-1">
        {editing ? <input ref={nameRef} value={pin.name} maxLength={200} className="map-name-input"
          onChange={event => setPin({ ...pin, name: event.target.value })}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void save(); } }}
          placeholder={t("map.details.markerName")} aria-label={t("map.details.markerName")} />
          : <h2 className="truncate text-base font-semibold text-white">{pin.name}</h2>}
        <p className="mt-1 text-xs text-zinc-400">{t("map.custom.personal")}</p>
      </div>
      <button type="button" onClick={onClose} disabled={pending} className="map-icon-button disabled:opacity-40" aria-label={t("chrome.close")}><X size={16} /></button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="map-coordinate-card mt-0">
        <div className="min-w-0"><p className="map-micro-label">{t("map.details.coordinates")}</p>
          <p className="mt-1 font-mono text-xs font-semibold text-zinc-100">{coordinates}</p></div>
        <button type="button" onClick={() => void copy()} className="map-icon-button"
          aria-label={t(copyStatus === "copied" ? "map.details.coordinatesCopied" : copyStatus === "failed" ? "map.details.coordinatesCopyFailed" : "map.details.copyCoordinates")}
          title={t("map.details.copyCoordinates")}><Copy size={13} /></button>
      </div>
      {copyStatus !== "idle" && <p role="status" className="mt-1 text-xs text-zinc-300">{t(copyStatus === "copied" ? "map.details.coordinatesCopied" : "map.details.coordinatesCopyFailed")}</p>}
      {editing ? <>
        <label className="mt-3 block"><span className="map-micro-label">Y</span>
          <input type="number" min={-2048} max={2048} value={pin.y ?? ""} className="map-name-input mt-2 text-sm"
            onChange={event => setPin({ ...pin, y: event.target.value === "" ? null : Number(event.target.value) })} />
        </label>
        <WorldPinStylePicker color={color} icon={icon} onChange={change => {
          const next = { ...pin, ...change }; setPin(next); onDraftChange?.(next);
        }} />
        <WorldPinGroupPicker group={group} availableGroups={availableGroups} onChange={group => {
          const next = { ...pin, group }; setPin(next); onDraftChange?.(next);
        }} />
        <section className="mt-3 rounded-[var(--radius-md)] border border-border bg-white/[0.03] p-3">
          <label htmlFor={`world-pin-note-${pin.id}`} className="map-micro-label">{t("map.details.notes")}</label>
          <textarea id={`world-pin-note-${pin.id}`} value={pin.note} maxLength={10000} rows={4}
            className="map-notes-input min-h-24 resize-y" placeholder={t("map.details.notesPlaceholder")}
            onChange={event => setPin({ ...pin, note: event.target.value })} />
        </section>
        {draft.source === "edit" && <button type="button" onClick={() => void remove()} disabled={pending}
          className="map-danger-button mt-4"><Trash2 size={14} />{t("map.details.deleteMarker")}</button>}
      </> : <>
        <button type="button" onClick={() => { setPin(draft.pin); setEditing(true); }}
          className="map-secondary-button mt-3"><Pencil size={14} />{t("map.custom.edit")}</button>
        <div className="mt-4 grid gap-2">
          <section className="rounded-[var(--radius-md)] border border-border bg-white/[0.03] p-3">
            <p className="map-micro-label">{t("map.markerGroups.group")}</p>
            <p className="mt-2 text-xs text-zinc-100">{groupName}</p>
          </section>
          {pin.note && <section className="rounded-[var(--radius-md)] border border-border bg-white/[0.03] p-3">
            <p className="map-micro-label">{t("map.details.notes")}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-100">{pin.note}</p>
          </section>}
        </div>
      </>}
      {failed && <p role="alert" className="mt-3 text-xs text-danger-text">{t("map.custom.saveFailed")}</p>}
    </div>
    {editing && <footer className="flex shrink-0 gap-2 border-t border-border p-4">
      {draft.source === "edit" && <button type="button" onClick={() => { setPin(draft.pin); setEditing(false); setFailed(false); }}
        className="map-secondary-button min-w-0 flex-1">{t("account.cancel")}</button>}
      <button type="button" onClick={() => void save()} disabled={pending || !pin.name.trim() || !Number.isFinite(pin.y ?? 0)}
        className="map-secondary-button min-w-0 flex-1 border-accent/50 bg-accent-soft text-accent disabled:opacity-40">
        {draft.source === "placement" ? <MapPinPlus size={15} /> : <Check size={15} />}{t("map.custom.save")}
      </button>
    </footer>}
  </section>;
};

export default WorldPinDialog;
