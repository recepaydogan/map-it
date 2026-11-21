import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CLASS_TIER_LIST_ARTWORK } from "../../game-config";
import { cn } from "../../lib/cn";
import { contentUrl } from "../../lib/content-url";
import { TIER_LIST_MODES, isTierListCatalog, type TierListCatalog, type TierListMode } from "./tier-list-data";

export default function TierListPage() {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<TierListMode>("pve");
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; catalog?: TierListCatalog }>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void fetch(contentUrl("class-tier-lists.json"), { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(`Class tier lists: HTTP ${response.status}`);
      const catalog: unknown = await response.json();
      if (!isTierListCatalog(catalog)) throw new Error("Invalid class tier list catalog");
      if (!controller.signal.aborted) setState({ status: "ready", catalog });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      console.error("Failed to load class tier lists", error);
      setState({ status: "error" });
    });
    return () => controller.abort();
  }, []);

  const selected = state.catalog?.modes.find((entry) => entry.mode === mode);
  const updated = selected && new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(`${selected.updatedAt}T00:00:00Z`));

  return <div className="catalog-page-frame flex min-w-0 flex-col animate-fade-in">
    <header className="catalog-page-header shrink-0 border-b border-border px-6 py-5">
      <h1 className="text-lg font-semibold tracking-tight text-zinc-100">{t("tierLists.title")}</h1>
      <p className="mt-1 text-xs text-subtle">{t("tierLists.intro")}</p>
    </header>
    <div role="tablist" aria-label={t("tierLists.mode")} className="flex shrink-0 gap-5 border-b border-border bg-surface px-6">
      {TIER_LIST_MODES.map((item) => <button key={item} id={`tier-list-tab-${item}`} type="button" role="tab"
        aria-selected={mode === item} aria-controls="tier-list-panel" onClick={() => setMode(item)}
        className={cn("-mb-px min-h-11 cursor-pointer border-b-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent",
          mode === item ? "border-accent text-accent" : "border-transparent text-subtle hover:text-white")}
      >{t(`tierLists.modes.${item}`)}</button>)}
    </div>
    <div id="tier-list-panel" role="tabpanel" aria-labelledby={`tier-list-tab-${mode}`} className="scroll-slim min-h-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-4xl">
        {state.status !== "ready" ? <p role={state.status === "error" ? "alert" : "status"} className="py-10 text-sm text-subtle">{t(state.status === "error" ? "tierLists.loadError" : "reference.loading")}</p>
          : selected && <>
            <p className="mb-6 text-xs leading-5 text-subtle">{t("tierLists.preliminary")}</p>
            <div className="space-y-9">
              {selected.tiers.map((tier) => <section key={tier.rank} aria-labelledby={`tier-list-rank-${tier.rank}`}>
                <h2 id={`tier-list-rank-${tier.rank}`} className="mb-4 rounded-[var(--radius-md)] border border-border bg-surface px-4 py-2.5 font-display text-lg font-semibold text-accent">
                  {t("tierLists.tier", { rank: tier.rank })}
                </h2>
                <ul className="grid gap-4 md:grid-cols-2">
                  {tier.classes.map((classEntry) => {
                    const artwork = CLASS_TIER_LIST_ARTWORK[classEntry.name as keyof typeof CLASS_TIER_LIST_ARTWORK];
                    return <li key={classEntry.name} className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
                      <article className="h-full">
                        <div className="flex h-52 items-end justify-center overflow-hidden border-b border-border bg-map-surface">
                          {artwork && <img src={contentUrl(artwork)} alt="" loading="lazy" className="h-full max-w-full object-contain object-bottom" />}
                        </div>
                        <div className="px-4 py-4">
                          <h3 className="text-[15px] font-semibold text-zinc-100">{classEntry.name}</h3>
                          <p className="mt-2 text-[13px] leading-5 text-subtle">{classEntry.description}</p>
                        </div>
                      </article>
                    </li>;
                  })}
                </ul>
              </section>)}
            </div>
            <p className="mt-6 text-xs text-subtle">{t("tierLists.updated", { date: updated })}</p>
          </>}
      </div>
    </div>
  </div>;
}
