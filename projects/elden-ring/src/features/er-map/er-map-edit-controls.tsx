import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Move, Trash2, Undo2, X } from "lucide-react";
import Tooltip from "../../components/tooltip";
import { cn } from "../../lib/cn";
import { useMapStore } from "../../store/map-store";
import EditConfirmationDialog from "../map/edit-confirmation-dialog";
import EditEntryButton from "../map/edit-entry-button";
import MarkerChangesControl from "../map/marker-changes-control";

interface ErMapEditControlsProps {
  selectedMarkerId: string | null;
  onSelectMarker: (id: string | null) => void;
  game: string;
  /** id → name for this map's streamed markers; the Changes panel has no other
   * source for them (they aren't part of the baked live-map marker set). */
  markerNames: ReadonlyMap<string, string>;
}

const ErMapEditControls = ({
  selectedMarkerId,
  onSelectMarker,
  game,
  markerNames,
}: ErMapEditControlsProps) => {
  const { t } = useTranslation();
  const editMode = useMapStore((state) => state.editMode);
  const beginEditSession = useMapStore((state) => state.beginMarkerEditSession);
  const saveEdits = useMapStore((state) => state.saveMarkerEdits);
  const discardEdits = useMapStore((state) => state.discardMarkerEdits);
  const dirty = useMapStore((state) => state.markerOverridesDirty);
  const undoOverride = useMapStore((state) => state.undoMarkerOverride);
  const undoCount = useMapStore((state) => state.markerOverrideOrder.length);
  const toggleMarkerDeletion = useMapStore((state) => state.toggleMarkerDeletion);
  const [discardOpen, setDiscardOpen] = useState(false);

  const deleteSelected = () => {
    if (!selectedMarkerId) return;
    toggleMarkerDeletion(selectedMarkerId);
    onSelectMarker(null);
  };

  const requestExit = () => {
    if (dirty) setDiscardOpen(true);
    else discardEdits();
  };

  const confirmDiscard = () => {
    discardEdits();
    setDiscardOpen(false);
  };

  if (!editMode) {
    return (
      <EditEntryButton
        label={t("mapEdit.enter")}
        hint={t("mapEdit.enterHint")}
        onClick={beginEditSession}
      />
    );
  }

  return (
    <>
      <div className="pointer-events-auto absolute right-3 top-1/2 z-[1300] flex -translate-y-1/2 items-center gap-2 rounded-[var(--radius-md)] border border-amber-500/40 bg-surface/95 px-3 py-2 backdrop-blur-xl">
        <Tooltip label={t("mapEdit.dragHint")}>
          <Move size={14} aria-hidden="true" className="text-amber-300" />
        </Tooltip>
        <Tooltip label={t("mapEdit.save")}>
          <button
            onClick={saveEdits}
            disabled={!dirty}
            className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-accent px-2.5 py-1 text-[12px] font-semibold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            <Check size={13} aria-hidden="true" /> {t("mapEdit.save")}
          </button>
        </Tooltip>
        <MarkerChangesControl game={game as any} names={markerNames} scope="er-map" />
        <Tooltip label={t("mapEdit.selectMarker")} disabled={!!selectedMarkerId}>
          <button
            onClick={deleteSelected}
            aria-disabled={!selectedMarkerId}
            aria-label={t("detail.deleteMarker")}
            className={cn(
              "flex items-center rounded-[var(--radius-sm)] px-1.5 py-1 text-[12px] font-medium transition-colors",
              selectedMarkerId
                ? "text-zinc-300 hover:bg-red-500/15 hover:text-red-300 cursor-pointer"
                : "text-subtle cursor-not-allowed",
            )}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </Tooltip>
        <Tooltip label={t("mapEdit.undo")} align="end">
          <button
            onClick={undoOverride}
            disabled={undoCount === 0}
            aria-label={t("mapEdit.undo")}
            className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-zinc-400 hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            <Undo2 size={14} aria-hidden="true" />
          </button>
        </Tooltip>
        <Tooltip label={t("mapEdit.exit")} align="end">
          <button
            onClick={requestExit}
            aria-label={t("mapEdit.exit")}
            className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-zinc-400 hover:bg-white/8 hover:text-white cursor-pointer"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
      {discardOpen && (
        <EditConfirmationDialog
          onCancel={() => setDiscardOpen(false)}
          onConfirm={confirmDiscard}
        />
      )}
    </>
  );
};

export default ErMapEditControls;
