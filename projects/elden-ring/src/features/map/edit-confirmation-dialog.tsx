import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Trash2 } from "lucide-react";

interface EditConfirmationDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
}

const EditConfirmationDialog = ({
  onCancel,
  onConfirm,
}: EditConfirmationDialogProps) => {
  const { t } = useTranslation();
  const titleId = "marker-edit-discard-title";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel]);

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[1700] grid place-items-center bg-black/55 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-2xl shadow-black/60"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex gap-3 px-5 pb-4 pt-5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-amber-500/15 text-amber-300">
            <AlertTriangle size={18} aria-hidden="true" />
          </div>
          <div>
            <h2 id={titleId} className="text-[15px] font-semibold text-white">
              {t("mapEdit.unsavedTitle")}
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/80">
              {t("mapEdit.unsavedBody")}
            </p>
          </div>
        </div>
        <div className="flex gap-2 border-t border-border p-4">
          <button
            autoFocus
            onClick={onCancel}
            className="flex-1 rounded-[var(--radius-md)] border border-border bg-white/[0.03] px-3 py-2 text-[12.5px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-white cursor-pointer"
          >
            {t("mapEdit.keepEditing")}
          </button>
          <button
            onClick={onConfirm}
            className="flex flex-[1.35] items-center justify-center gap-2 rounded-[var(--radius-md)] bg-red-500/90 px-3 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-red-500 cursor-pointer"
          >
            <Trash2 size={14} aria-hidden="true" />
            {t("mapEdit.discard")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditConfirmationDialog;
