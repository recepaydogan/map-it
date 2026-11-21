import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Clock,
  Inbox,
  Loader2,
  MessageSquarePlus,
  MessageSquareText,
  Send,
  ShieldCheck,
} from "lucide-react";
import { cn } from "../../lib/cn";
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
import ActionButton from "../../components/action-button";
import FormTextarea from "../../components/form-textarea";
import SupportConversation from "./support-conversation";
import SupportStatusChip from "./support-status-chip";
import { formatSupportTime } from "./support-time";

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
    <p className="flex items-center gap-1.5 text-[12px] text-support-subtle">
      <Clock size={13} className="text-support-accent" aria-hidden="true" />
      {t("support.replyPromise", { hours: SUPPORT_REPLY_HOURS })}
    </p>
  );
};

interface ComposeProps {
  /** Prefilled from the account when there is one — still fully editable. */
  initialName: string;
  focusName: boolean;
  /** Fired on the first edit, so the surface can pin this screen. */
  onEngaged?: () => void;
  onOpened: (threadId: string) => void;
  onCancel?: () => void;
}

/** The form the button leads to: who we're talking to, and what happened. */
const ComposeReport = ({ initialName, focusName, onEngaged, onOpened, onCancel }: ComposeProps) => {
  const { t } = useTranslation();
  const { createReport, draft, setDraft } = useSupport();
  // The draft lives in the store, not in this component: a report can take a
  // while to write, and nothing that re-renders or remounts this form — a poll,
  // a screen change, closing the panel by mistake — may cost someone their
  // words. The account name is only a starting suggestion, so it fills the
  // field once and is editable from there.
  const name = draft.name ?? initialName;
  const body = draft.body;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = name.trim().length > 0 && body.trim().length > 0;

  const submit = async () => {
    if (!ready) return;
    setSending(true);
    setError(null);
    const result = await createReport(name, body);
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    track("SUPPORT_REPORT_SENT");
    onOpened(result.value.id);
  };

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-support-border bg-support-surface/60 p-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-support-display text-[17px] font-semibold text-white">{t("support.writeTitle")}</h2>
        {/* Two lines on purpose: the privacy promise is the sentence that decides
            whether someone writes at all, so it gets its own line instead of
            trailing off the end of the one before it. */}
        <p className="text-pretty text-[13px] leading-relaxed text-support-zinc-400">{t("support.writeBody")}</p>
        <p className="text-pretty text-[13px] leading-relaxed text-support-zinc-400">{t("support.writePrivacy")}</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-support-zinc-300">
          {t("support.nameLabel")}
        </span>
        <input
          value={name}
          onChange={(event) => {
            onEngaged?.();
            setDraft({ name: event.target.value });
          }}
          maxLength={SUPPORT_MAX_NAME}
          placeholder={t("support.namePlaceholder")}
          autoFocus={focusName}
          className="h-9 w-full rounded-[var(--radius-md)] border border-support-border bg-black/25 px-3 text-[13px] text-support-zinc-100 outline-none transition-colors placeholder:text-support-zinc-600 focus:border-support-accent/60 focus:bg-black/40"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        {/* The counter belongs with the label, not stranded under the box: it is a
            property of the field, and at the bottom it read as a stray number. */}
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-support-zinc-300">
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
        />
      </label>

      {error && <p className="text-[12px] text-rose-300">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <ReplyPromise />
        {onCancel && (
          <ActionButton className="ml-auto" onClick={onCancel} disabled={sending}>
            {t("support.cancel")}
          </ActionButton>
        )}
        <ActionButton
          variant="primary"
          className={onCancel ? undefined : "ml-auto"}
          onClick={() => void submit()}
          disabled={!ready || sending}
        >
          {sending ? (
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          ) : (
            <Send size={12} aria-hidden="true" />
          )}
          {t("support.sendReport")}
        </ActionButton>
      </div>
    </section>
  );
};

/** One row in "your reports" — the list only appears once there are several. */
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
      className="flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-support-border bg-support-surface/60 p-4 text-left transition-colors hover:border-support-accent/30 hover:bg-white/[0.04] cursor-pointer"
    >
      {flagged && (
        <span
          className="h-2 w-2 shrink-0 rounded-full bg-support-accent"
          aria-label={admin ? t("support.status.open") : t("support.newReply")}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold text-white">{thread.displayName}</span>
        <span className="block truncate text-[11px] text-support-subtle">
          {admin
            ? (thread.userEmail ?? t("support.anonymousReport"))
            : t("support.lastActivity", { date: formatSupportTime(thread.lastMessageAt, i18n.language) })}
        </span>
      </span>
      {admin && (
        <span className="shrink-0 text-[11px] tabular-nums text-support-subtle">
          {formatSupportTime(thread.lastMessageAt, i18n.language)}
        </span>
      )}
      <SupportStatusChip status={thread.status} />
    </button>
  );
};

/**
 * The user's side of support: one button in the header lands here. With no
 * history it opens straight on the form (the fastest path to being heard); once
 * there are reports it lists them, and each one opens into the conversation
 * where our reply appears. Staff additionally get the inbox with every report.
 *
 * Occupies the app's content region beside the navigation and ad rail.
 */
const SupportPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { myThreads, inboxThreads, isAdmin, loading, hasLoaded, refresh } = useSupport();
  const [view, setView] = useState<View | null>(null);
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

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
    <section data-support-page aria-labelledby={headingId} className="relative flex h-full min-h-0 min-w-0 flex-col animate-support-fade-in">
      <header className="flex shrink-0 items-center gap-3 border-b border-support-border px-6 py-4">
        <div className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] border border-support-accent/30 bg-support-accent-soft">
          <MessageSquareText size={18} className="text-support-accent" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 id={headingId} ref={headingRef} tabIndex={-1} className="text-[18px] font-semibold tracking-tight text-white outline-none">{t("support.title")}</h1>
          <p className="mt-0.5 text-[12px] text-support-muted">{t("support.subtitle")}</p>
        </div>
        <div className="flex-1" />
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              if (current.mode === "inbox") {
                setView({ mode: "list" });
              } else {
                setView({ mode: "inbox" });
                void refresh();
              }
            }}
            className={cn(
              "relative flex items-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-2 text-[12.5px] font-semibold transition-colors cursor-pointer",
              current.mode === "inbox" || current.mode === "inboxThread"
                ? "border-support-accent/40 bg-support-accent/[0.12] text-support-accent"
                : "border-support-border bg-white/[0.03] text-support-zinc-300 hover:text-white",
            )}
          >
            <Inbox size={13} aria-hidden="true" />
            {t("support.inbox")}
            {inboxPending > 0 && (
              <span className="ml-1 rounded-full bg-support-accent px-1.5 text-[10px] font-bold tabular-nums text-support-on-accent">
                {inboxPending}
              </span>
            )}
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4">{children}</div>
      </div>
    </section>
  );

  // No Supabase credentials in this build — say so instead of offering a form
  // that could never send.
  if (!isSupportAvailable()) {
    return shell(
      <p className="rounded-[var(--radius-lg)] border border-dashed border-support-border p-8 text-center text-[13px] text-support-subtle">
        {t(UNAVAILABLE_KEY)}
      </p>,
    );
  }

  if (loading && !hasLoaded && view === null) {
    return shell(
      <p className="flex items-center justify-center gap-2 py-10 text-[12px] text-support-subtle">
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
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
          backLabel={admin ? t("support.inbox") : t("support.title")}
          justSent={current.mode === "thread" ? current.justSent : false}
          onBack={() => setView({ mode: admin ? "inbox" : "list" })}
        />,
      );
    }
  }

  if (current.mode === "inbox") {
    return shell(
      <>
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-support-accent" aria-hidden="true" />
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-support-zinc-300">
            {t("support.inbox")}
          </h2>
          <span className="text-[11px] text-support-subtle">
            {t("support.inboxCount", { count: inboxThreads.length })}
          </span>
        </div>
        {inboxThreads.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-support-border p-8 text-center text-[13px] text-support-subtle">
            {t("support.inboxEmpty")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
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
          focusName={view?.mode === "compose"}
          initialName={user?.displayName ?? ""}
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
          <div className="flex flex-wrap items-center gap-3">
            <ReplyPromise />
            <ActionButton
              variant="primary"
              className="ml-auto"
              onClick={() => setView({ mode: "compose" })}
            >
              <MessageSquarePlus size={12} aria-hidden="true" /> {t("support.newReport")}
            </ActionButton>
          </div>
          <div className="flex flex-col gap-2">
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

