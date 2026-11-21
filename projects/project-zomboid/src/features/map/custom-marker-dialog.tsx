import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";
import { getPointAppearance } from "./map-config";
import MapPointIcon from "./map-point-icon";
import MapMarkerStylePicker from "./map-marker-style-picker";
import MapMarkerGroupPicker from "./map-marker-group-picker";
import type { UserMapMarker } from "./types";

export interface CustomMarkerDraft {
  marker: UserMapMarker;
  note: string;
  source: "placement" | "coordinate" | "edit";
  chooseLocation?: boolean;
  saveFailed?: boolean;
  useForLootBase?: boolean;
}

interface CustomMarkerDialogProps {
  draft: CustomMarkerDraft;
  onClose: () => void;
  onSave: (marker: UserMapMarker, note: string) => void;
}

const CustomMarkerDialog = ({ draft, onClose, onSave }: CustomMarkerDialogProps) => {
  const { t } = useTranslation();
  const [marker, setMarker] = useState(draft.marker);
  const [note, setNote] = useState(draft.note);
  const [failed, setFailed] = useState(draft.saveFailed ?? false);
  const formRef = useRef<HTMLFormElement>(null);
  const appearance = getPointAppearance(marker);

  useEffect(() => {
    const previous = document.activeElement;
    const form = formRef.current!;
    form.querySelector<HTMLInputElement>("input")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else if (event.key === "Tab") {
        const controls = Array.from(form.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, textarea, [tabindex='0']",
        ));
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-[1600] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" data-map-ui
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={formRef} role="dialog" aria-modal="true" aria-labelledby="custom-marker-title"
        className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (!marker.name.trim()) return;
          try { onSave({ ...marker, name: marker.name.trim() }, note.trim()); }
          catch (error) {
            console.error("Failed to save custom marker.", error);
            setFailed(true);
          }
        }}>
        <header className="flex items-center gap-3 border-b border-border p-4">
          <span className={cn("map-details-icon", appearance.markerClass)}>
            <MapPointIcon fallback={appearance.icon} source={appearance.nativeIconPath} size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="custom-marker-title" className="text-sm font-semibold text-white">
              {t(draft.source === "edit" ? "map.custom.edit" : "map.controls.addMarker")}
            </h2>
            <p className="truncate text-xs text-white/60">{marker.name || t("map.details.markerName")}</p>
          </div>
          <button type="button" onClick={onClose} className="map-icon-button" aria-label={t("chrome.close")}>
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 space-y-4 overflow-y-auto p-4">
          <label className="block">
            <span className="map-micro-label">{t("map.details.markerName")}</span>
            <input required maxLength={80} value={marker.name} className="map-name-input mt-2"
              onChange={(event) => setMarker({ ...marker, name: event.target.value })} />
          </label>
          {!draft.chooseLocation && (
            <p className="font-mono text-xs text-white/60">{t("map.details.coordinates")}: {marker.x}, {marker.y}</p>
          )}
          <MapMarkerStylePicker imageCategory={marker.imageCategory} color={marker.color ?? "sage"} icon={marker.icon ?? "pin"}
            onChange={(change) => setMarker({ ...marker, ...change })} />
          <MapMarkerGroupPicker group={marker.group ?? "general"}
            onChange={(group) => setMarker({ ...marker, group })} />
          <label className="block">
            <span className="map-micro-label">{t("map.details.notes")}</span>
            <textarea value={note} maxLength={10000} rows={3} className="map-notes-input"
              placeholder={t("map.details.notesPlaceholder")} onChange={(event) => setNote(event.target.value)} />
          </label>
          {failed && <p role="alert" className="text-xs text-red-400">{t("map.custom.saveFailed")}</p>}
        </div>
        <footer className="flex gap-2 border-t border-border p-4">
          <button type="button" onClick={onClose} className="map-secondary-button">{t("support.cancel")}</button>
          <button type="submit" disabled={!marker.name.trim()} className="map-secondary-button disabled:opacity-40">
            {t(draft.chooseLocation ? "map.custom.chooseLocation" : "map.custom.save")}
          </button>
        </footer>
      </form>
    </div>
  );
};

export default CustomMarkerDialog;
