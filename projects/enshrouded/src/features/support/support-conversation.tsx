import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Loader2,
  Lock,
  MailCheck,
  MessageSquareDashed,
  Pencil,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import ActionButton from "../../components/action-button";
import FormTextarea from "../../components/form-textarea";
import { cn } from "../../lib/cn";
import {
  SUPPORT_MAX_BODY,
  SUPPORT_REPLY_HOURS,
  type SupportMessage,
  type SupportSender,
  type SupportThread,
} from "../../services/support/support-service";
import { useSupport } from "../../state/use-support";
import SupportStatusChip from "./support-status-chip";

const stamp = (iso: string, locale: string): string =>
  new Date(iso).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

interface MessageBlockProps {
  message: SupportMessage;
  /** Which side the reader is on: the support page ("user") or the inbox. */
  role: SupportSender;
  /** How the reporter asked to be addressed — the label on their messages. */
  reporterName: string;
  onSave: (body: string) => Promise<boolean>;
}

/**
 * One message. The two sides have to be told apart at a glance, so support
 * replies carry the accent (tint, rule, icon) and the reporter's stay neutral —
 * and both are labelled by WHO wrote them rather than by "you", which reads the
 * same on both surfaces and told the two apart nowhere.
 *
 * Yours carries an inline edit affordance: support conversations are written in
 * a hurry and the first thing anyone wants is to fix a typo, so editing happens
 * in place rather than behind a modal.
 */
const MessageBlock = ({ message, role, reporterName, onSave }: MessageBlockProps) => {
  const { t, i18n } = useTranslation();
  const fromSupport = message.sender === "admin";
  // You may edit the side you are speaking for — the same rule the server
  // enforces on the write itself.
  const mine = message.sender === role;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [saving, setSaving] = useState(false);

  const author = fromSupport ? t("support.supportSide") : reporterName;

  const save = async () => {
    const next = draft.trim();
    if (!next || next === message.body) {
      setEditing(false);
      setDraft(message.body);
      return;
    }
    setSaving(true);
    const done = await onSave(next);
    setSaving(false);
    if (done) setEditing(false);
  };

  return (
    <article
      className={cn(
        "rounded-[var(--radius-md)] border border-l-2 px-4 py-3",
        fromSupport
          ? "border-support-accent/25 border-l-support-accent bg-support-accent/[0.06]"
          : "border-support-border border-l-white/20 bg-white/[0.025]",
      )}
    >
      <header className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-[12px] font-semibold",
            fromSupport ? "text-support-accent" : "text-support-zinc-100",
          )}
        >
          {fromSupport ? (
            <ShieldCheck size={12} aria-hidden="true" />
          ) : (
            <UserRound size={12} aria-hidden="true" />
          )}
          <span className="max-w-52 truncate">{author}</span>
        </span>
        <span className="text-[10px] tabular-nums text-support-subtle">{stamp(message.createdAt, i18n.language)}</span>
        {message.editedAt && (
          <span className="text-[10px] uppercase tracking-wide text-support-subtle">{t("support.edited")}</span>
        )}
        {mine && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(message.body);
              setEditing(true);
            }}
            className="ml-auto cursor-pointer p-1 text-support-zinc-500 transition-colors hover:text-white"
            aria-label={t("support.editMessage")}
            title={t("support.editMessage")}
          >
            <Pencil size={13} aria-hidden="true" />
          </button>
        )}
      </header>

      {editing ? (
        <div className="flex flex-col gap-2">
          <FormTextarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={SUPPORT_MAX_BODY}
            rows={4}
            autoFocus
            aria-label={t("support.editMessage")}
          />
          <div className="flex items-center justify-end gap-2">
            <ActionButton
              onClick={() => {
                setEditing(false);
                setDraft(message.body);
              }}
              disabled={saving}
            >
              <X size={12} aria-hidden="true" /> {t("support.cancel")}
            </ActionButton>
            <ActionButton variant="primary" onClick={() => void save()} disabled={saving}>
              {saving ? (
                <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              ) : (
                <Check size={12} aria-hidden="true" />
              )}
              {t("support.saveChanges")}
            </ActionButton>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-pretty text-[13px] leading-relaxed text-support-zinc-200">
          {message.body}
        </p>
      )}
    </article>
  );
};

interface SupportConversationProps {
  thread: SupportThread;
  /** "user" on the support page, "admin" in the inbox. */
  role: SupportSender;
  /** Label for the back control (the list the reader came from). */
  backLabel: string;
  onBack: () => void;
  /** Shown once, right after the report was filed. */
  justSent?: boolean;
}

/**
 * A whole support conversation: the thread's header, its messages, and the box
 * to add to it. Shared by both sides — `role` is the only difference, so the
 * two surfaces can never drift apart in how a thread reads or behaves.
 */
const SupportConversation = ({
  thread,
  role,
  backLabel,
  onBack,
  justSent = false,
}: SupportConversationProps) => {
  const { t, i18n } = useTranslation();
  const { messages, loadingThreadId, loadMessages, post, edit, remove, changeStatus, markRead } =
    useSupport();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const list = messages[thread.id];
  const loading = loadingThreadId === thread.id && list === undefined;
  // null = the read failed. Empty array = the thread really holds nothing.
  // Rendering both as blank space is how a broken read passed for an empty
  // conversation for as long as it did.
  const failed = list === null;

  // Open = read. The unread dot in the header dies here, not on the next poll.
  useEffect(() => {
    void loadMessages(thread.id);
    void markRead(thread.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [list?.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    const result = await post(thread.id, body, role === "admin");
    setSending(false);
    if (result.ok) setDraft("");
    else setError(result.error);
  };

  const saveEdit = async (messageId: string, body: string): Promise<boolean> => {
    const result = await edit(thread.id, messageId, body);
    if (!result.ok) setError(result.error);
    return result.ok;
  };

  const closed = thread.status === "closed";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-[12.5px] font-medium text-support-zinc-400 transition-colors hover:text-white cursor-pointer"
        >
          <ChevronLeft size={15} aria-hidden="true" />
          <span className="truncate">{backLabel}</span>
        </button>
        <SupportStatusChip status={thread.status} className="ml-auto" />
        {role === "admin" && (
          <ActionButton onClick={() => void changeStatus(thread.id, closed ? "open" : "closed")}>
            {closed ? (
              <>
                <Undo2 size={12} aria-hidden="true" /> {t("support.reopen")}
              </>
            ) : (
              <>
                <MailCheck size={12} aria-hidden="true" /> {t("support.markClosed")}
              </>
            )}
          </ActionButton>
        )}
        <ActionButton variant="danger" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={12} aria-hidden="true" /> {t("support.deleteConversation")}
        </ActionButton>
      </div>

      <section className="flex min-h-0 flex-1 flex-col gap-3 rounded-[var(--radius-lg)] border border-support-border bg-support-surface/60 p-4">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-support-border pb-3">
          <h2 className="font-support-display text-[17px] font-semibold text-white">{thread.displayName}</h2>
          {role === "admin" && (
            <span className="text-[11px] text-support-subtle">
              {thread.userEmail ?? t("support.anonymousReport")}
            </span>
          )}
          <span className="ml-auto text-[10px] tabular-nums text-support-subtle">
            {t("support.opened", { date: stamp(thread.createdAt, i18n.language) })}
          </span>
        </header>

        {justSent && (
          <p className="flex items-center gap-2 rounded-[var(--radius-md)] border-l-2 border-emerald-400/60 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-200">
            <MailCheck size={13} aria-hidden="true" />
            {t("support.sentConfirm", { hours: SUPPORT_REPLY_HOURS })}
          </p>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-8 text-[12px] text-support-subtle">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              {t("support.loading")}
            </p>
          ) : failed ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8">
              <p className="flex items-center gap-2 text-[12px] text-rose-300">
                <AlertTriangle size={14} aria-hidden="true" />
                {t("support.loadFailed")}
              </p>
              <ActionButton onClick={() => void loadMessages(thread.id)}>
                <RefreshCw size={12} aria-hidden="true" /> {t("support.retry")}
              </ActionButton>
            </div>
          ) : list?.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-8 text-center text-[12px] text-support-subtle">
              <MessageSquareDashed size={14} aria-hidden="true" />
              {t("support.noMessages")}
            </p>
          ) : (
            (list ?? []).map((message) => (
              <MessageBlock
                key={message.id}
                message={message}
                role={role}
                reporterName={thread.displayName}
                onSave={(body) => saveEdit(message.id, body)}
              />
            ))
          )}
          <div ref={endRef} />
        </div>

        <div className="flex flex-col gap-2 border-t border-support-border pt-3">
          {closed && role === "user" && (
            <p className="flex items-center gap-2 text-[11px] text-support-subtle">
              <Lock size={12} aria-hidden="true" />
              {t("support.closedHint")}
            </p>
          )}
          <FormTextarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void send();
              }
            }}
            maxLength={SUPPORT_MAX_BODY}
            rows={3}
            placeholder={role === "admin" ? t("support.replyPlaceholder") : t("support.addPlaceholder")}
            aria-label={role === "admin" ? t("support.yourReply") : t("support.yourMessage")}
          />
          {error && <p className="text-[12px] text-rose-300">{error}</p>}
          <div className="flex items-center gap-3">
            <ActionButton
              variant="primary"
              className="ml-auto"
              onClick={() => void send()}
              disabled={sending || draft.trim().length === 0}
            >
              {sending ? (
                <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              ) : (
                <Send size={12} aria-hidden="true" />
              )}
              {t("support.send")}
            </ActionButton>
          </div>
        </div>
      </section>

      {/* The support page bounds this confirmation to the content region.
          Its scroll container is inside that boundary. */}
      {confirmDelete && (
        <div className="absolute inset-0 z-[1700] grid place-items-center bg-black/60 px-4 animate-support-fade-in">
          <div className="w-[380px] max-w-full rounded-[var(--radius-lg)] border border-support-border bg-support-surface p-5 shadow-2xl shadow-black/60">
            <h3 className="text-[15px] font-semibold text-white">{t("support.deleteTitle")}</h3>
            <p className="mt-2 text-[12.5px] leading-relaxed text-support-zinc-400">{t("support.deleteBody")}</p>
            {deleteError && <p className="mt-2 text-[12px] text-rose-300">{deleteError}</p>}
            <div className="mt-4 flex items-center justify-end gap-2">
              <ActionButton onClick={() => setConfirmDelete(false)}>{t("support.cancel")}</ActionButton>
              <ActionButton
                variant="danger"
                onClick={() => {
                  void remove(thread.id).then((result) => {
                    if (result.ok) onBack();
                    else setDeleteError(result.error);
                  });
                }}
              >
                <Trash2 size={12} aria-hidden="true" /> {t("support.delete")}
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportConversation;

