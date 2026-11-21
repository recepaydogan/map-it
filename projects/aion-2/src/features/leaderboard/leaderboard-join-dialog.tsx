import { X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Trans, useTranslation } from "react-i18next";
import { loadAccountLinkedCharacters, readGuestLinkedCharacters } from "../character-profiles/linked-characters";
import { useAuth } from "../../state/use-auth";

const linkClass = "cursor-pointer font-medium text-accent underline underline-offset-2 hover:text-white focus-visible:outline-2 focus-visible:outline-accent";

const LeaderboardJoinDialog = ({ onClose, onOpenSignIn, onOpenMyCharacters }: {
  onClose: () => void;
  onOpenSignIn: () => void;
  onOpenMyCharacters: () => void;
}) => {
  const { t } = useTranslation();
  const { status, user } = useAuth();
  const userId = status === "signed-in" ? user?.id ?? null : null;
  const dialogRef = useRef<HTMLDivElement>(null);
  const [guestHasCharacters] = useState(() => readGuestLinkedCharacters(!userId).length > 0);
  const [accountCharacters, setAccountCharacters] = useState<{ userId: string; hasCharacters: boolean; error: boolean } | null>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => {
      if (previous?.isConnected && !previous.closest("[inert]")) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void loadAccountLinkedCharacters(userId).then((characters) => {
      if (cancelled) return;
      setAccountCharacters({ userId, hasCharacters: characters.length > 0, error: false });
    }).catch((error: unknown) => {
      if (cancelled) return;
      console.error("Could not check linked characters for leaderboard guidance", error);
      setAccountCharacters({ userId, hasCharacters: false, error: true });
    });
    return () => { cancelled = true; };
  }, [status, userId]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    if (buttons.length === 0) return;
    const first = buttons[0]!;
    const last = buttons[buttons.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };

  const accountChecked = !userId || accountCharacters?.userId === userId;
  const checkError = accountChecked && accountCharacters?.error === true;
  const ready = status !== "loading" && accountChecked && !checkError;
  const hasCharacters = userId ? accountCharacters?.hasCharacters === true : guestHasCharacters;
  const needsSignIn = ready && !userId;
  const needsCharacters = ready && !hasCharacters;
  const messageKey = needsSignIn && needsCharacters ? "leaderboard.joinBoth"
    : needsSignIn ? "leaderboard.joinSignIn"
      : needsCharacters ? "leaderboard.joinCharacters" : "leaderboard.joinReady";

  return <div className="absolute inset-0 z-[1600] flex items-center justify-center bg-black/75 p-4"
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="leaderboard-join-title" aria-describedby="leaderboard-join-description"
      tabIndex={-1} onKeyDown={onKeyDown}
      className="w-full max-w-md rounded-[var(--radius-lg)] border border-border bg-surface p-5 text-white shadow-2xl outline-none sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 id="leaderboard-join-title" className="text-[17px] font-semibold">{t("leaderboard.joinTitle")}</h2>
        <button type="button" onClick={onClose} aria-label={t("leaderboard.joinClose")}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-subtle hover:bg-surface-hover hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      <p id="leaderboard-join-description" className="mt-3 text-[13px] leading-6 text-subtle">
        {!ready ? t(checkError ? "leaderboard.joinLoadError" : "leaderboard.joinLoading")
          : needsSignIn || needsCharacters ? <Trans i18nKey={messageKey} components={{
            signIn: <button type="button" onClick={onOpenSignIn} className={linkClass} />,
            myCharacters: <button type="button" onClick={onOpenMyCharacters} className={linkClass} />,
          }} /> : t(messageKey)}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {needsSignIn && <button type="button" onClick={onOpenSignIn}
          className="min-h-10 min-w-32 flex-1 cursor-pointer rounded-[var(--radius-md)] bg-accent px-4 text-[12px] font-semibold text-on-accent hover:bg-[var(--gold-bright)] focus-visible:outline-2 focus-visible:outline-accent">
          {t("leaderboard.joinSignInAction")}
        </button>}
        {(needsCharacters || checkError) && <button type="button" onClick={onOpenMyCharacters}
          className="min-h-10 min-w-32 flex-1 cursor-pointer rounded-[var(--radius-md)] border border-accent/40 bg-accent-soft px-4 text-[12px] font-semibold text-accent hover:border-accent focus-visible:outline-2 focus-visible:outline-accent">
          {t("leaderboard.joinCharactersAction")}
        </button>}
        {ready && !needsSignIn && !needsCharacters && <button type="button" onClick={onClose}
          className="min-h-10 min-w-32 flex-1 cursor-pointer rounded-[var(--radius-md)] bg-accent px-4 text-[12px] font-semibold text-on-accent hover:bg-[var(--gold-bright)] focus-visible:outline-2 focus-visible:outline-accent">
          {t("leaderboard.joinClose")}
        </button>}
      </div>
    </div>
  </div>;
};

export default LeaderboardJoinDialog;
