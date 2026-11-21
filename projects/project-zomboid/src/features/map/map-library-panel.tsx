import { FolderSearch, Map, Power, Search, Send, Sparkles, Trash2, TriangleAlert, X } from "lucide-react";
import { useMemo, useState, type Ref } from "react";
import { useTranslation } from "react-i18next";
import TruncatedText from "../../components/truncated-text";
import { cn } from "../../lib/cn";
import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import { useAuth } from "../../state/use-auth";
import type { MapLibraryEntry } from "./community-map-types";
import { getMapModVisibilityIssues } from "./map-mod-visibility";
import { MOD_REQUEST_MAX_LENGTH, submitModRequest } from "./mod-request-service";

interface MapLibraryPanelProps {
  modRequestInputRef?: Ref<HTMLTextAreaElement>;
  entries: MapLibraryEntry[];
  activeModKeys: string[];
  error: string | null;
  zomboidRootMissing: boolean;
  zomboidRootSelectionInvalid: boolean;
  onToggleMods: (keys: string[]) => void;
  onLocateZomboidRoot: () => Promise<void>;
  onRemove: (key: string) => Promise<void>;
  onClose: () => void;
}

const MapLibraryPanel = ({
  modRequestInputRef,
  entries,
  activeModKeys,
  error,
  zomboidRootMissing,
  zomboidRootSelectionInvalid,
  onToggleMods,
  onLocateZomboidRoot,
  onRemove,
  onClose,
}: MapLibraryPanelProps) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [modRequest, setModRequest] = useState("");
  const [requestState, setRequestState] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const packageEntries = entries.filter(({ currentGameWorld }) => !currentGameWorld);
  const currentWorld = entries.find(({ currentGameWorld }) => currentGameWorld);
  const visibilityIssues = useMemo(
    () => getMapModVisibilityIssues(
      currentWorld?.preparedMods ?? [],
      currentWorld?.preparedMapOrder,
    ),
    [currentWorld?.preparedMapOrder, currentWorld?.preparedMods],
  );
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredEntries = normalizedSearchQuery
    ? packageEntries.filter((entry) => [
      entry.displayName,
      entry.description,
      entry.creator,
      entry.modId,
      entry.workshopId,
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedSearchQuery)))
    : packageEntries;

  const handleModRequest = async () => {
    if (!modRequest.trim() || requestState === "submitting") return;
    setRequestState("submitting");
    const result = await submitModRequest(modRequest, user?.id ?? null);
    // The wording is user content and stays in Supabase; analytics only counts
    // that a request happened and whether it went through.
    track(EVENTS.MAP_MOD_REQUESTED, {
      result: result.ok ? "sent" : result.reason,
      request_length: modRequest.trim().length,
      signed_in: Boolean(user),
    });
    if (result.ok) {
      setModRequest("");
      setRequestState("sent");
      return;
    }
    setRequestState("error");
  };

  return (
    <section
      id="map-library-panel"
      aria-label={t("map.library.modAvailable")}
      className="pointer-events-auto flex max-h-full w-[21rem] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/90 shadow-2xl shadow-black/40 backdrop-blur-xl animate-fade-in"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="min-w-0 flex-1 text-[13px] font-semibold text-zinc-100">
          {t("map.library.modAvailable")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("map.library.modClose")}
          className="-mr-1 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <label className="relative block">
          <span className="sr-only">{t("map.library.searchLabel")}</span>
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("map.library.searchPlaceholder")}
            className="mod-search-input h-9 w-full rounded-[var(--radius-md)] border border-border bg-black/15 pl-9 pr-3 text-[12px] text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-accent/70"
          />
        </label>

        <div className="scroll-slim mt-3 max-h-72 overflow-y-auto pr-1">
          <div className="flex flex-col gap-1.5">
            {filteredEntries.map((entry) => {
              const confirmingRemoval = pendingRemoval === entry.key;
              const packageMods = entry.kind === "mod" ? entry.preparedMods ?? [] : [];
              const packageModKeys = packageMods.map(({ key }) => key);
              const packageActive = packageModKeys.length > 0
                && packageModKeys.every((key) => activeModKeys.includes(key));
              const packageVisibilityIssues = packageMods
                .map(({ key }) => visibilityIssues.get(key))
                .filter((issue) => issue !== undefined);
              const visibilityIssueKind = packageVisibilityIssues.length === packageMods.length
                && packageVisibilityIssues.every(({ kind }) => kind === "hidden")
                ? "hidden"
                : "partial";
              const blockingMods = [...new globalThis.Map(packageVisibilityIssues
                .flatMap(({ blockingMods: issueBlockingMods }) => issueBlockingMods)
                .map((mod) => [mod.key, mod])).values()];
              const blockerNames = blockingMods.length > 0
                ? new Intl.ListFormat(i18n.language, { style: "short", type: "conjunction" })
                  .format(blockingMods.map(({ displayName }) => displayName))
                : "";
              return (
              <div
                key={entry.key}
                className={cn(
                  "overflow-hidden rounded-[var(--radius-md)] border transition-colors",
                  packageActive
                    ? "border-accent/65 bg-accent-soft"
                    : "border-border bg-white/[0.03]",
                )}
              >
                <div className="flex items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-white/8 text-zinc-300">
                      <Map size={15} aria-hidden="true" />
                    </span>
                    <TruncatedText
                      text={entry.displayName}
                      side="top"
                      align="start"
                      wrapTooltip
                      wrapperClassName="flex-1"
                      className="text-[13px] font-semibold text-zinc-100"
                    />
                  </div>

                  {packageModKeys.length > 0 && (
                    <button
                      type="button"
                      aria-pressed={packageActive}
                      aria-label={t(packageActive ? "map.library.deactivate" : "map.library.activate", { name: entry.displayName })}
                      title={t(packageActive ? "map.library.deactivate" : "map.library.activate", { name: entry.displayName })}
                      onClick={() => onToggleMods(packageModKeys)}
                      className={cn(
                        "mr-2 flex h-7 w-[4.75rem] shrink-0 cursor-pointer items-center justify-center gap-1 rounded-[var(--radius-sm)] border text-[10px] font-semibold transition-colors",
                        packageActive
                          ? "border-white/15 bg-white/[0.10] text-white hover:bg-white/[0.14]"
                          : "border-border bg-black/10 text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200",
                      )}
                    >
                      <Power
                        size={11}
                        className={packageActive ? "text-accent" : "text-zinc-500"}
                        aria-hidden="true"
                      />
                      {t(packageActive ? "map.library.active" : "map.library.inactive")}
                    </button>
                  )}

                  {entry.kind === "community" && !confirmingRemoval && (
                    <button
                      type="button"
                      onClick={() => setPendingRemoval(entry.key)}
                      aria-label={t("map.library.remove", { name: entry.displayName })}
                      title={t("map.library.remove", { name: entry.displayName })}
                      className="mr-1.5 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>

                {packageActive && packageVisibilityIssues.length > 0 && (
                  <div className="flex items-start gap-2 border-t border-warning/25 bg-warning/10 px-2.5 py-2">
                    <TriangleAlert
                      size={13}
                      className="mt-0.5 shrink-0 text-warning"
                      aria-hidden="true"
                    />
                    <p className="min-w-0 text-[10px] leading-relaxed text-zinc-200">
                      {t(visibilityIssueKind === "hidden"
                        ? "map.library.hiddenByMapOrder"
                        : "map.library.partiallyCoveredByMapOrder", { mods: blockerNames })}
                    </p>
                  </div>
                )}

                {confirmingRemoval && (
                  <div className="flex items-center gap-2 border-t border-border px-2.5 py-2">
                    <span className="min-w-0 flex-1 text-[11px] text-zinc-300">
                      {t("map.library.removeConfirm")}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void onRemove(entry.key).then(() => {
                          setPendingRemoval(null);
                          setStatus(t("map.library.removed", { name: entry.displayName }));
                        });
                      }}
                      className="shrink-0 cursor-pointer rounded-[var(--radius-sm)] bg-danger/25 px-2 py-1 text-[11px] font-medium text-danger-text transition-colors hover:bg-danger/40"
                    >
                      {t("map.library.removeAction")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingRemoval(null)}
                      className="shrink-0 cursor-pointer rounded-[var(--radius-sm)] bg-white/8 px-2 py-1 text-[11px] font-medium text-zinc-200 transition-colors hover:bg-white/12"
                    >
                      {t("map.library.cancel")}
                    </button>
                  </div>
                )}
              </div>
              );
            })}
            {filteredEntries.length === 0 && (
              <p className="rounded-[var(--radius-md)] border border-dashed border-border px-3 py-5 text-center text-[11px] text-zinc-400">
                {t("map.library.noSearchResults")}
              </p>
            )}
          </div>
        </div>

        {zomboidRootMissing && (
          <div className="mt-3 flex items-center gap-2.5 rounded-[var(--radius-md)] border border-warning/35 bg-warning/10 px-3 py-2.5">
            <FolderSearch size={16} className="shrink-0 text-warning" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-zinc-200">
              {t(zomboidRootSelectionInvalid
                ? "map.library.invalidZomboidFolder"
                : "map.library.zomboidFolderMissing")}
            </p>
            <button
              type="button"
              onClick={() => void onLocateZomboidRoot()}
              className="h-8 shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-white/15 bg-white/10 px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-white/15"
            >
              {t("map.library.locateFolder")}
            </button>
          </div>
        )}

        {(status || error) && (
          <p
            role="status"
            className={cn("mt-2 text-[11px] leading-relaxed", error ? "text-danger-text" : "text-zinc-300")}
          >
            {status ?? error}
          </p>
        )}

        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-start gap-2.5">
            <Sparkles size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-zinc-100">
                {t("map.library.moreModsComing")}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                {t("map.library.requestHint")}
              </p>
            </div>
          </div>

          <form
            className="mt-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleModRequest();
            }}
          >
            <label htmlFor="mod-request" className="sr-only">
              {t("map.library.requestLabel")}
            </label>
            <textarea
              ref={modRequestInputRef}
              id="mod-request"
              value={modRequest}
              maxLength={MOD_REQUEST_MAX_LENGTH}
              rows={3}
              onChange={(event) => {
                setModRequest(event.target.value);
                if (requestState !== "idle") setRequestState("idle");
              }}
              placeholder={t("map.library.requestPlaceholder")}
              className="min-h-20 w-full resize-none rounded-[var(--radius-md)] border border-border bg-black/15 px-3 py-2 text-[12px] leading-relaxed text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-accent/70"
            />
            <div className="mt-2 flex min-h-8 items-center justify-between gap-3">
              <p className={cn(
                "text-[11px] leading-relaxed",
                requestState === "sent" ? "text-success-text" : requestState === "error" ? "text-danger-text" : "text-zinc-500",
              )} role="status">
                {requestState === "sent"
                  ? t("map.library.requestSent")
                  : requestState === "error"
                    ? t("map.library.requestFailed")
                    : t("map.library.requestMultiple")}
              </p>
              <button
                type="submit"
                disabled={!modRequest.trim() || requestState === "submitting"}
                className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-3 text-[11px] font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send size={12} aria-hidden="true" />
                {t(requestState === "submitting" ? "map.library.requestSending" : "map.library.requestSend")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
};

export default MapLibraryPanel;
