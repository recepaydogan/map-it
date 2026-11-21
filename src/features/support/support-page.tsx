import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  Clock,
  Inbox,
  Loader2,
  MessageSquarePlus,
  MessageSquareText,
  Send,
  ShieldCheck,
} from "lucide-react";
import { track } from "../../services/optional-usage";
import {
  hasUnreadReply,
  isSupportAvailable,
  needsAdminAttention,
  SUPPORT_MAX_BODY,
  SUPPORT_MAX_NAME,
  SUPPORT_REPLY_HOURS,
  UNAVAILABLE_KEY,
  type SupportThread,
} from "../../services/support/support-service";
import { useAuth } from "../../state/use-auth";
import { useSupport } from "../../state/use-support";
import CategoryDropdown from "../../components/category-dropdown";
import { findMapGame, MAP_GAMES } from "../app-library/app-selection";
import SupportGameBadge from "./support-game-badge";
import ActionButton from "../../components/action-button";
import FormTextarea from "../../components/form-textarea";
import SupportConversation from "./support-conversation";
import SharedPageHeader from "../../components/layout/shared-page-header";
import SupportStatusChip from "./support-status-chip";
import { formatSupportTime } from "./support-time";
import "./support-page.css";

type View =
  | { mode: "list" }
  | { mode: "compose" }
  | { mode: "thread"; id: string; justSent: boolean }
  | { mode: "inbox" }
  | { mode: "inboxThread"; id: string };

/** Standing promise, stated everywhere the user is about to wait for us. */
const ReplyPromise = () => {
  const { t } = useTranslation();
  return (
    <p className="map-it-support-reply-time">
      <Clock size={14} aria-hidden="true" />
      {t("support.replyPromise", { hours: SUPPORT_REPLY_HOURS })}
    </p>
  );
};

interface ComposeProps {
  /** Prefilled from the account when there is one — still fully editable. */
  initialName: string;
  initialGameId?: string;
  /** Fired on the first edit, so the surface can pin this screen. */
  onEngaged?: () => void;
  onOpened: (threadId: string) => void;
  onCancel?: () => void;
}

/** The form the button leads to: who we're talking to, and what happened. */
const ComposeReport = ({ initialName, initialGameId, onEngaged, onOpened, onCancel }: ComposeProps) => {
  const { t } = useTranslation();
  const { createReport, draft, setDraft } = useSupport();
  // The draft lives in the store, not in this component: a report can take a
  // while to write, and nothing that re-renders or remounts this form — a poll,
  // a screen change, closing the panel by mistake — may cost someone their
  // words. The account name is only a starting suggestion, so it fills the
  // field once and is editable from there.
  const name = draft.name ?? initialName;
  const body = draft.body;
  const [gameId, setGameId] = useState(() => initialGameId ?? draft.gameId);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const game = findMapGame(gameId);
  const ready = name.trim().length > 0 && body.trim().length > 0 && Boolean(game);

  const submit = async () => {
    if (!ready || !game || sending) return;
    setSending(true);
    setError(null);
    const result = await createReport(name, body, game.moduleId);
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    track("SUPPORT_REPORT_SENT");
    onOpened(result.value.id);
  };

  return (
    <form className="map-it-panel map-it-support-compose" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <header className="map-it-support-card-heading">
        <h2>{t("support.writeTitle")}</h2>
        <p>{t("support.writeBody")}</p>
      </header>

      <div className="map-it-support-fields">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="support-game" className="map-it-label">{t("support.gameLabel")}</label>
          <CategoryDropdown id="support-game" value={gameId} ariaLabel={t("support.gameLabel")}
            triggerClassName="map-it-field"
            contentClassName="map-it-support-game-menu"
            options={[{ key: "", label: t("support.gamePlaceholder") }, ...MAP_GAMES.map(app => ({ key: app.id, label: app.name, image: app.icon }))]}
            onChange={gameId => { onEngaged?.(); setGameId(gameId); setDraft({ gameId }); }} />
        </div>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="map-it-label">{t("support.nameLabel")}</span>
          <input
            value={name}
            onChange={(event) => {
              onEngaged?.();
              setDraft({ name: event.target.value });
            }}
            maxLength={SUPPORT_MAX_NAME}
            placeholder={t("support.namePlaceholder")}
            autoComplete="nickname"
            className="map-it-field"
            required
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        {/* The counter belongs with the label, not stranded under the box: it is a
            property of the field, and at the bottom it read as a stray number. */}
        <span className="flex items-baseline justify-between gap-2">
          <span className="map-it-label">
            {t("support.reportLabel")}
          </span>
          <span className="text-[10px] tabular-nums text-support-subtle">{`${body.length} / ${SUPPORT_MAX_BODY}`}</span>
        </span>
        <FormTextarea
          value={body}
          onChange={(event) => {
            onEngaged?.();
            setDraft({ body: event.target.value });
          }}
          maxLength={SUPPORT_MAX_BODY}
          rows={8}
          placeholder={t("support.reportPlaceholder")}
          required
        />
      </label>

      {error && <p role="alert" className="text-[13px] text-danger-text">{error}</p>}

      <footer className="map-it-support-compose-footer">
        <ReplyPromise />
        <div className="map-it-support-actions">
          {onCancel && <ActionButton onClick={onCancel} disabled={sending}>{t("support.cancel")}</ActionButton>}
          <ActionButton type="submit" disabled={!ready || sending}>
            {sending ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              : <Send size={14} aria-hidden="true" />}
            {t("support.sendReport")}
          </ActionButton>
        </div>
      </footer>
    </form>
  );
};

/** One report in the personal list or staff inbox. */
const ThreadRow = ({
  thread,
  onOpen,
  admin,
}: {
  thread: SupportThread;
  onOpen: () => void;
  admin?: boolean;
}) => {
  const { t, i18n } = useTranslation();
  const flagged = admin ? needsAdminAttention(thread) : hasUnreadReply(thread);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="map-it-support-thread-row"
      data-unread={flagged || undefined}
    >
      {flagged && (
        <span className="sr-only">{admin ? t("support.status.open") : t("support.newReply")}</span>
      )}
      <span className="map-it-support-thread-details">
        <SupportGameBadge gameId={thread.gameId} />
        <span className="map-it-support-thread-meta">
          <span className="truncate">{thread.displayName}</span>
          {admin && <span className="truncate">{thread.userEmail ?? t("support.anonymousReport")}</span>}
          <time dateTime={thread.lastMessageAt}>
            {admin ? formatSupportTime(thread.lastMessageAt, i18n.language)
              : t("support.lastActivity", { date: formatSupportTime(thread.lastMessageAt, i18n.language) })}
          </time>
        </span>
      </span>
      <SupportStatusChip status={thread.status} />
      <ChevronRight size={16} className="map-it-support-thread-chevron" aria-hidden="true" />
    </button>
  );
};

/**
 * The user's side of support: one button in the header lands here. With no
 * history it opens straight on the form (the fastest path to being heard); once
 * there are reports it lists them, and each one opens into the conversation
 * where our reply appears. Staff additionally get the inbox with every report.
 *
 * A normal page in the host content area. The game header and ad rail stay
 * mounted; dropdowns use the host portal above this page.
 */
const SupportPage = ({ gameId }: { gameId?: string }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { myThreads, inboxThreads, isAdmin, loading, hasLoaded, refresh } = useSupport();
  const [view, setView] = useState<View | null>(null);

  // A fresh open should show the truth, not the last poll's copy.
  useEffect(() => {
    void refresh();
  }, [refresh]);


  const inboxPending = useMemo(() => inboxThreads.filter(needsAdminAttention).length, [inboxThreads]);

  // Until the user picks something, the screen shows whichever surface is
  // useful: the form when there's nothing to come back to, the list otherwise.
  // It also self-corrects when a pick stops making sense — the open thread was
  // just deleted, or the list emptied out — so neither leaves a dead end.
  //
  // This is recomputed on every render, so while it is the ACTIVE screen the
  // writer is one background poll away from losing it — a poll that turns up a
  // thread (a slow first load, or an anonymous report adopted at sign-in) flips
  // the fallback from the form to the list. The first keystroke therefore pins
  // the form as an explicit pick (see onEngaged below), which is the moment it
  // stops being a default and starts being someone's work.
  const current: View =
    view?.mode === "compose"
    || view?.mode === "inbox"
    || (view?.mode === "thread" && myThreads.some((thread) => thread.id === view.id))
    || (view?.mode === "inboxThread" && inboxThreads.some((thread) => thread.id === view.id))
      ? view
      : myThreads.length > 0
        ? { mode: "list" }
        : { mode: "compose" };

  const shell = (children: React.ReactNode) => (
    <div data-map-it-support-page className="relative flex h-full min-h-0 flex-col">
      <SharedPageHeader icon={MessageSquareText} title={t("support.title")} description={t("support.subtitle")}>
        {isAdmin && (
          <ActionButton
            onClick={() => {
              if (current.mode === "inbox") {
                setView({ mode: "list" });
              } else {
                setView({ mode: "inbox" });
                void refresh();
              }
            }}
            aria-pressed={current.mode === "inbox" || current.mode === "inboxThread"}
          >
            <Inbox size={15} aria-hidden="true" />
            {t("support.inbox")}
            {inboxPending > 0 && (
              <span className="map-it-support-inbox-count">
                {inboxPending}
              </span>
            )}
          </ActionButton>
        )}
      </SharedPageHeader>

      <div className="map-it-page-body">
        <div className="map-it-page-content map-it-support-content">{children}</div>
      </div>
    </div>
  );

  // No Supabase credentials in this build — say so instead of offering a form
  // that could never send.
  if (!isSupportAvailable()) {
    return shell(
      <p className="map-it-panel map-it-support-state">
        {t(UNAVAILABLE_KEY)}
      </p>,
    );
  }

  if (loading && !hasLoaded && view === null) {
    return shell(
      <p role="status" className="map-it-panel map-it-support-state">
        <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {t("support.loading")}
      </p>,
    );
  }

  if (current.mode === "thread" || current.mode === "inboxThread") {
    const admin = current.mode === "inboxThread";
    const thread = (admin ? inboxThreads : myThreads).find((candidate) => candidate.id === current.id);
    if (thread) {
      return shell(
        <SupportConversation
          thread={thread}
          role={admin ? "admin" : "user"}
          backLabel={admin ? t("support.inbox") : t("support.yourReports")}
          justSent={current.mode === "thread" ? current.justSent : false}
          onBack={() => setView({ mode: admin ? "inbox" : "list" })}
        />,
      );
    }
  }

  if (current.mode === "inbox") {
    return shell(
      <>
        <header className="map-it-support-list-header">
          <div className="map-it-support-card-heading">
            <h2 className="flex items-center gap-2"><ShieldCheck size={18} aria-hidden="true" />{t("support.inbox")}</h2>
            <p>{t("support.inboxCount", { count: inboxThreads.length })}</p>
          </div>
        </header>
        {inboxThreads.length === 0 ? (
          <p className="map-it-panel map-it-support-state">
            {t("support.inboxEmpty")}
          </p>
        ) : (
          <div className="map-it-panel map-it-support-thread-list">
            {inboxThreads.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                admin
                onOpen={() => setView({ mode: "inboxThread", id: thread.id })}
              />
            ))}
          </div>
        )}
      </>,
    );
  }

  return shell(
    <>
      {current.mode === "compose" ? (
        <ComposeReport
          initialName={user?.displayName ?? ""}
          initialGameId={gameId}
          // Typing turns the default screen into a chosen one. The updater
          // returns the SAME object when it is already pinned, so React bails
          // out and this costs nothing per keystroke.
          onEngaged={() =>
            setView((prev) => (prev?.mode === "compose" ? prev : { mode: "compose" }))
          }
          onOpened={(id) => setView({ mode: "thread", id, justSent: true })}
          onCancel={myThreads.length > 0 ? () => setView({ mode: "list" }) : undefined}
        />
      ) : (
        <>
          <header className="map-it-support-list-header">
            <div className="map-it-support-card-heading">
              <h2>{t("support.yourReports")}</h2>
              <ReplyPromise />
            </div>
            <ActionButton onClick={() => setView({ mode: "compose" })}>
              <MessageSquarePlus size={15} aria-hidden="true" />{t("support.newReport")}
            </ActionButton>
          </header>
          <div className="map-it-panel map-it-support-thread-list">
            {myThreads.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                onOpen={() => setView({ mode: "thread", id: thread.id, justSent: false })}
              />
            ))}
          </div>
        </>
      )}
    </>,
  );
};

export default SupportPage;

