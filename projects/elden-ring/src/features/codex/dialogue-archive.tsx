import { useMemo, useState } from "react";
import { ChevronLeft, MessageSquare, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  dialogueLineCount,
  erDialogueSpeakers,
  type DialogueConfidence,
  type DialogueSpeaker,
} from "../../data/er-dialogue-data";
import { cn } from "../../lib/cn";
import { useIsMobile } from "../../utils/platform";

/** Case-insensitive highlight of the active query inside a line of dialogue. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const Highlight = ({ text, q }: { text: string; q: string }) => {
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRe(q)})`, "ig"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded-[3px] bg-accent/25 text-inherit">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
};

/** One conversation — a titled card whose lines read top-to-bottom in play order. */
const ConversationBlock = ({
  lines,
  label,
  query,
}: {
  lines: string[];
  label: string;
  query: string;
}) => (
  <article className="rounded-[var(--radius-lg)] border border-border bg-white/[0.02] p-4 sm:p-5">
    <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">{label}</h3>
    <div className="mt-2.5 space-y-2">
      {lines.map((line, i) => (
        <p key={i} className="whitespace-pre-line text-[13.5px] leading-relaxed text-zinc-200">
          <Highlight text={line} q={query} />
        </p>
      ))}
    </div>
  </article>
);

/** A small honesty badge — flags a name we inferred rather than one the game states.
 *  "Unknown speaker" rows say it in the name, so they need no badge. */
const ConfidenceBadge = ({ confidence }: { confidence: DialogueConfidence }) => {
  const { t } = useTranslation();
  if (confidence !== "inferred") return null;
  return (
    <span className="shrink-0 rounded-[var(--radius-full)] bg-white/[0.06] px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wider text-zinc-400">
      {t("dialogue.confidence.inferred")}
    </span>
  );
};

/**
 * Dialogue Archive — every word the game's NPCs speak, browsable per speaker. The rail
 * lists each speaker (with their line count); the panel shows that speaker's whole script
 * as titled conversation blocks, in playback order. Search filters the rail by speaker
 * name AND by line text, so "Bayle" or "needle" surfaces the exact exchange.
 *
 * Nothing here is hand-written — it's the game's own TalkMsg script (base + Shadow of the
 * Erdtree). Speaker names are shown with their confidence (a wrong name would be worse
 * than none), so inferred and unknown speakers are marked as such.
 */
const DialogueArchive = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [speakerId, setSpeakerId] = useState<string>(erDialogueSpeakers[0]?.id ?? "");
  const [mobileDetail, setMobileDetail] = useState(false);

  const q = query.trim().toLowerCase();

  // Rail filter: a speaker matches on their name OR any line they speak.
  const filtered = useMemo(() => {
    if (!q) return erDialogueSpeakers;
    return erDialogueSpeakers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.conversations.some((c) => c.lines.some((l) => l.toLowerCase().includes(q))),
    );
  }, [q]);

  // Keep the explicit selection when it survives the filter; otherwise fall to the top hit
  // so typing a query that excludes the current speaker jumps straight to a match.
  const current: DialogueSpeaker | undefined =
    filtered.find((s) => s.id === speakerId) ?? filtered[0];

  // When searching, lead with the conversations that actually contain the query (a
  // name-only match still shows the full script). Otherwise show everything, in order.
  const shownConversations = useMemo(() => {
    if (!current) return [];
    if (!q || current.name.toLowerCase().includes(q)) return current.conversations;
    const hits = current.conversations.filter((c) => c.lines.some((l) => l.toLowerCase().includes(q)));
    return hits.length ? hits : current.conversations;
  }, [current, q]);

  const pick = (id: string) => {
    setSpeakerId(id);
    setMobileDetail(true);
  };

  return (
    <div
      data-game="elden-ring"
      className="absolute inset-0 z-[1500] flex flex-col bg-background animate-fade-in"
    >
      <header className="relative flex items-center gap-3 border-b border-border px-4 py-3.5 sm:px-6 sm:py-4">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/[0.07] to-transparent" />
        <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
          <MessageSquare size={18} className="text-accent" aria-hidden="true" />
        </div>
        <div className="relative min-w-0">
          <h1 className="font-display text-[16px] font-semibold uppercase leading-none tracking-[0.14em] text-white sm:text-[19px] sm:tracking-[0.18em]">
            {t("nav.dialogue")}
          </h1>
          <p className="mt-1 truncate text-[11px] tracking-wide text-muted">{t("dialogue.subtitle")}</p>
        </div>
        <div className="flex-1" />
        <button
          onClick={onClose}
          aria-label={t("dialogue.close")}
          className="relative grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/8 hover:text-white cursor-pointer"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {(!isMobile || !mobileDetail) && (
          <nav className={cn("flex shrink-0 flex-col border-border", isMobile ? "w-full" : "w-72 border-r")}>
            {/* Search — filters speakers by name AND by anything they say. */}
            <div className="border-b border-border p-2.5">
              <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-black/30 px-2.5 py-1.5 focus-within:border-accent/60">
                <Search size={15} className="shrink-0 text-zinc-500" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("dialogue.search")}
                  aria-label={t("dialogue.search")}
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-500"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    aria-label={t("dialogue.clearSearch")}
                    className="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-zinc-500 hover:text-white cursor-pointer"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-zinc-500">{t("dialogue.noResults")}</p>
              ) : (
                filtered.map((s) => {
                  const active = s.id === current?.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => pick(s.id)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "group relative flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors cursor-pointer",
                        active ? "bg-accent-soft" : "hover:bg-white/5",
                      )}
                    >
                      <span aria-hidden="true" className={cn("absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent transition-opacity", active ? "opacity-100" : "opacity-0")} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-[13px] font-medium", active ? "text-white" : "text-zinc-300")}>
                          {s.name}
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          {t("dialogue.lineCount", { count: dialogueLineCount(s) })}
                        </span>
                      </span>
                      <ConfidenceBadge confidence={s.confidence} />
                    </button>
                  );
                })
              )}
            </div>
          </nav>
        )}

        {(!isMobile || mobileDetail) && (
          <div className="flex min-w-0 flex-1 flex-col">
            {isMobile && (
              <button
                onClick={() => setMobileDetail(false)}
                className="flex shrink-0 items-center gap-1.5 border-b border-border px-4 py-2.5 text-[13px] font-medium text-zinc-300 hover:text-white cursor-pointer"
              >
                <ChevronLeft size={16} aria-hidden="true" />
                {t("dialogue.speakers")}
              </button>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {current ? (
                <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
                  {/* Spoiler warning — the archive is the whole script, endings and all. */}
                  <p className="text-[11px] font-medium tracking-wide text-amber-300/80">
                    {t("dialogue.spoilerNote")}
                  </p>

                  <header className="mt-3 flex items-baseline justify-between gap-3">
                    <h2 className="font-display text-[22px] font-semibold leading-tight text-white">
                      {current.name}
                    </h2>
                    <span className="shrink-0 text-[12px] text-zinc-500">
                      {t("dialogue.lineCount", { count: dialogueLineCount(current) })}
                    </span>
                  </header>
                  {current.confidence !== "named" && (
                    <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-500">
                      {t(`dialogue.note.${current.confidence}`)}
                    </p>
                  )}

                  <div className="mt-4 flex flex-col gap-3">
                    {shownConversations.map((conv, i) => (
                      <ConversationBlock
                        key={conv.id}
                        lines={conv.lines}
                        label={t("dialogue.conversationLabel", { index: i + 1 })}
                        query={q}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="px-6 py-10 text-center text-[13px] text-zinc-500">{t("dialogue.noResults")}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DialogueArchive;
