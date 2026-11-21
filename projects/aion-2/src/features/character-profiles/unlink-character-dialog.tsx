import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

const UnlinkCharacterDialog = ({ name, pending, error, onConfirm, onClose }: {
  name: string;
  pending: boolean;
  error: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return <dialog ref={dialogRef} aria-labelledby="unlink-character-title" aria-describedby="unlink-character-description"
    onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}
    className="m-auto w-[min(420px,calc(100vw-2rem))] rounded-[var(--radius-lg)] border border-border bg-surface p-0 text-white shadow-2xl backdrop:bg-black/75">
    <div className="space-y-4 p-5">
      <div>
        <h2 id="unlink-character-title" className="text-[17px] font-semibold">{t("characterProfiles.unlinkTitle")}</h2>
        <p id="unlink-character-description" className="mt-2 text-[12px] leading-5 text-subtle">{t("characterProfiles.unlinkBody", { name })}</p>
      </div>
      {error && <p role="alert" className="text-[12px] text-danger-text">{t("characterProfiles.unlinkError")}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={pending} className="h-9 cursor-pointer rounded-[var(--radius-md)] border border-border px-4 text-[12px] font-semibold text-white hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60">{t("characterProfiles.unlinkCancel")}</button>
        <button type="button" onClick={onConfirm} disabled={pending} className="h-9 cursor-pointer rounded-[var(--radius-md)] bg-danger px-4 text-[12px] font-semibold text-white hover:bg-danger/80 disabled:cursor-wait disabled:opacity-60">{t(pending ? "characterProfiles.unlinking" : "characterProfiles.unlinkConfirm")}</button>
      </div>
    </div>
  </dialog>;
};

export default UnlinkCharacterDialog;
