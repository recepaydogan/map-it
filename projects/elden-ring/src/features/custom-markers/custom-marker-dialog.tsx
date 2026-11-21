import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Upload, X } from "lucide-react";
import CategoryDot from "../../components/category-dot";
import {
  type CustomMarker,
  CUSTOM_TYPES,
  customTypeDef,
  DEFAULT_CUSTOM_TYPE,
  PRESET_MARKER_IMAGES,
} from "../../data/custom-markers";
import { cn } from "../../lib/cn";
import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import { useMapStore } from "../../store/map-store";
import { useMapExperience } from "../map-experience/map-experience";
import { type CreateSpot, useCustomMarkerUi } from "./custom-marker-ui";

/**
 * Create / edit dialog for a custom marker. Opened either by a placing click (a fresh
 * marker at that spot) or from the detail panel's "Edit". The user picks a type
 * (its colour + glyph), names it, optionally gives it a preset symbol image and a
 * description, with a live pin preview. Required: name only.
 */
const CustomMarkerDialog = () => {
  const createSpot = useCustomMarkerUi((s) => s.createSpot);
  const editId = useCustomMarkerUi((s) => s.editId);
  const close = useCustomMarkerUi((s) => s.close);
  const customMarkers = useMapStore((s) => s.customMarkers);

  const editing = editId ? customMarkers.find((m) => m.id === editId) ?? null : null;
  // Open when creating at a spot or editing an existing marker (that still exists).
  if (!createSpot && !editing) return null;

  return (
    <DialogForm
      key={editId ?? "new"}
      editing={editing}
      spot={createSpot}
      onClose={close}
    />
  );
};

interface DialogFormProps {
  editing: CustomMarker | null;
  spot: CreateSpot | null;
  onClose: () => void;
}

const DialogForm = ({ editing, spot, onClose }: DialogFormProps) => {
  const { t } = useTranslation();
  const addCustomMarker = useMapStore((s) => s.addCustomMarker);
  const updateCustomMarker = useMapStore((s) => s.updateCustomMarker);
  const { select } = useMapExperience();
  const notifySaved = useCustomMarkerUi((s) => s.notifySaved);

  const [category, setCategory] = useState(editing?.category ?? DEFAULT_CUSTOM_TYPE);
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  // undefined → use the type's glyph; otherwise a preset symbol URL.
  const [icon, setIcon] = useState<string | undefined>(editing?.icon);

  // ESC closes the dialog first (capture + stopImmediatePropagation so the app-wide
  // ESC for selection / rail doesn't also fire underneath).
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

  const typeDef = customTypeDef(category);
  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0;

  const save = () => {
    if (!canSave) return;
    const desc = description.trim() || undefined;
    if (editing) {
      updateCustomMarker(editing.id, { name: trimmedName, category, description: desc, icon });
      select(editing.id);
      notifySaved(editing.id);
    } else if (spot) {
      const id = addCustomMarker({
        game: spot.game,
        layer: spot.layer,
        category,
        name: trimmedName,
        description: desc,
        pixel: spot.pixel,
        icon,
      });
      track(EVENTS.CUSTOM_MARKER_CREATED, {
        marker_category: category,
        map: spot.game,
        map_view: spot.layer,
        has_description: Boolean(desc),
        has_icon: Boolean(icon),
      });
      select(id, "custom-marker");
      notifySaved(id);
    }
    onClose();
  };

  return (
    // `absolute`, not `fixed`: this dialog renders inside MapShell's relative,
    // overflow-hidden root (the non-ads region), so the dim backdrop is scoped to the
    // map area and never covers the Overwolf ad rail — the same rule every other
    // overlay here follows.
    <div
      className="absolute inset-0 z-[1600] grid place-items-center bg-black/55 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? t("tracking.editMarker") : t("tracking.newMarker")}
      >
        {/* Header — live preview of the pin + title. */}
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <CategoryDot color={typeDef.color} icon={typeDef.icon} iconUrl={icon} size={40} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold text-white">
              {trimmedName || (editing ? t("tracking.editMarker") : t("tracking.newMarker"))}
            </h2>
            <p className="mt-0.5 text-[12px] text-muted">
              {t(`category.${typeDef.key}`, { defaultValue: typeDef.label })}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("tracking.close")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/8 hover:text-white cursor-pointer"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Type */}
          <Field label={t("tracking.type")}>
            <div className="flex flex-wrap gap-1.5">
              {CUSTOM_TYPES.map((type) => {
                const active = type.key === category;
                return (
                  <button
                    key={type.key}
                    onClick={() => setCategory(type.key)}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center gap-1.5 rounded-[var(--radius-md)] border px-2 py-1.5 text-[12px] font-medium transition-colors cursor-pointer",
                      active
                        ? "border-accent bg-accent/15 text-white"
                        : "border-border bg-white/[0.03] text-zinc-300 hover:border-zinc-500 hover:text-white",
                    )}
                  >
                    <CategoryDot color={type.color} icon={type.icon} size={18} />
                    {t(`category.${type.key}`, { defaultValue: type.label })}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Name */}
          <Field label={t("tracking.name")} required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={80}
              placeholder={t("tracking.namePlaceholder")}
              className="w-full rounded-[var(--radius-md)] border border-border bg-black/25 px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-accent focus:outline-none"
            />
          </Field>

          {/* Image — a preset symbol or the type's own glyph (no user uploads). */}
          <Field label={t("tracking.image")} hint={t("tracking.imageHint")}>
            <div className="grid grid-cols-7 gap-1.5">
              {/* Default: the type's own glyph. */}
              <ImageTile
                label={t("tracking.typeIcon")}
                selected={icon === undefined}
                onClick={() => setIcon(undefined)}
              >
                <CategoryDot color={typeDef.color} icon={typeDef.icon} size={32} />
              </ImageTile>

              {/* Preset symbols. */}
              {PRESET_MARKER_IMAGES.map((p) => (
                <ImageTile
                  key={p.url}
                  label={p.label}
                  selected={icon === p.url}
                  onClick={() => setIcon(p.url)}
                >
                  <DiscImg src={p.url} />
                </ImageTile>
              ))}
            </div>
          </Field>

          {/* Description */}
          <Field label={t("tracking.description")} hint={t("tracking.optional")}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={t("tracking.descriptionPlaceholder")}
              className="w-full resize-none rounded-[var(--radius-md)] border border-border bg-black/25 px-3 py-2 text-[13px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-accent focus:outline-none"
            />
          </Field>
        </div>

        <footer className="flex shrink-0 gap-2 border-t border-border p-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-[var(--radius-md)] border border-border bg-white/[0.03] px-3 py-2 text-[13px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-white cursor-pointer"
          >
            {t("tracking.cancel")}
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className="flex flex-[2] items-center justify-center gap-2 rounded-[var(--radius-md)] bg-accent px-3 py-2 text-[13px] font-semibold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            {editing ? (
              <>
                <Check size={15} aria-hidden="true" /> {t("tracking.saveChanges")}
              </>
            ) : (
              <>
                <Upload size={15} aria-hidden="true" /> {t("tracking.addMarker")}
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
};

/** A labelled form field. */
const Field = ({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) => (
  <div>
    <div className="mb-1.5 flex items-baseline gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
        {label}
        {required && <span className="ml-0.5 text-accent">*</span>}
      </span>
      {hint && <span className="text-[11px] text-zinc-500">{hint}</span>}
    </div>
    {children}
  </div>
);

/** One selectable image tile in the picker grid. */
const ImageTile = ({
  label,
  selected,
  disabled,
  onClick,
  children,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
    aria-pressed={selected}
    className={cn(
      "grid aspect-square place-items-center rounded-[var(--radius-md)] border transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
      selected
        ? "border-accent bg-accent/15"
        : "border-border bg-white/[0.03] hover:border-zinc-500",
    )}
  >
    {children}
  </button>
);

/** A preset/uploaded image shown on the same dark disc + neutral ring the map uses. */
const DiscImg = ({ src }: { src: string }) => (
  <span
    className="grid h-8 w-8 place-items-center overflow-hidden rounded-full"
    style={{ backgroundColor: "rgba(9, 11, 15, 0.92)", border: "1.5px solid rgba(255,255,255,0.18)" }}
  >
    <img src={src} alt="" draggable={false} className="h-full w-full object-contain" />
  </span>
);

export default CustomMarkerDialog;
