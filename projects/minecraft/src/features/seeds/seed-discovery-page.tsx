import { Check, Copy, MapPin } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_SEED_DISCOVERIES } from "../../game-config";
import { cn } from "../../lib/cn";
import type { NewWorld } from "../worlds/world-types";
import { seedDiscoveryImagePath } from "./seed-discovery-image";
import "./seed-discovery-page.css";

type EditionFilter = "all" | "java" | "bedrock";
type SeedDiscovery = (typeof GAME_SEED_DISCOVERIES)[number];

const compareVersions = (left: string, right: string): number => {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
    const difference = (rightParts[index] ?? 0) - (leftParts[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
};

function SeedActions({ discovery, copied, onCopy, onCreate, featured = false }: {
  discovery: SeedDiscovery;
  copied: boolean;
  onCopy: (discovery: SeedDiscovery) => void;
  onCreate: (discovery: SeedDiscovery) => void;
  featured?: boolean;
}) {
  const { t } = useTranslation();
  return <div className={cn("flex min-w-0 items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-background p-1.5",
    featured && "mt-auto")}>
    <code className="min-w-0 flex-1 select-text truncate px-2 text-[13px] font-semibold tabular-nums text-zinc-100"
      title={discovery.seed}>{discovery.seed}</code>
    <button type="button" onClick={() => onCopy(discovery)}
      aria-label={t("seeds.copySeed", { seed: discovery.seed })}
      className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-surface-hover px-2.5 text-xs font-semibold text-zinc-100 transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      {t(copied ? "seeds.copied" : "seeds.copy")}
    </button>
    <button type="button" onClick={() => onCreate(discovery)}
      aria-label={`${t("seeds.create")} ${t(discovery.titleKey)}`}
      className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] bg-accent px-3 text-xs font-semibold text-on-accent transition-colors hover:bg-[#e8c65f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      {t("seeds.create")}
    </button>
  </div>;
}

function SeedMetadata({ discovery }: { discovery: SeedDiscovery }) {
  const { t } = useTranslation();
  return <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[.08em] text-subtle">
    <span>{t(`worlds.editions.${discovery.edition}`)}</span>
    <span aria-hidden="true" className="text-muted">/</span>
    <span>{discovery.version}</span>
    {discovery.version === "26.3" && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] tracking-normal text-accent">
      {t("seeds.currentVersion")}
    </span>}
  </div>;
}

function SeedLocation({ discovery }: { discovery: SeedDiscovery }) {
  const { t } = useTranslation();
  if (!("x" in discovery && "z" in discovery && "locationKey" in discovery)) return null;
  return <p className="flex items-center gap-1.5 text-xs text-zinc-300">
    <MapPin size={13} className="shrink-0 text-accent" aria-hidden="true" />
    <span>{t(discovery.locationKey)} · X {discovery.x}, Z {discovery.z}</span>
  </p>;
}

function FeaturedSeed({ discovery, copied, onCopy, onCreate }: {
  discovery: SeedDiscovery;
  copied: boolean;
  onCopy: (discovery: SeedDiscovery) => void;
  onCreate: (discovery: SeedDiscovery) => void;
}) {
  const { t } = useTranslation();
  return <article className="seed-feature overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--panel-shadow)]">
    <div className="min-h-[260px] overflow-hidden bg-elevated">
      <img src={seedDiscoveryImagePath(discovery)} alt={t("seeds.imageAlt", { title: t(discovery.titleKey) })}
        className="h-full min-h-[260px] w-full object-cover" fetchPriority="high" />
    </div>
    <div className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[.15em] text-accent">{t("seeds.topPick")}</span>
        <span className="text-xs font-semibold tabular-nums text-subtle">#{String(discovery.rank).padStart(2, "0")}</span>
      </div>
      <div>
        <SeedMetadata discovery={discovery} />
        <h2 className="mt-2 text-[clamp(1.5rem,2vw,2rem)] font-semibold leading-tight tracking-tight text-zinc-50">
          {t(discovery.titleKey)}
        </h2>
        <p className="mt-3 text-[13px] leading-6 text-zinc-300">{t(discovery.descriptionKey)}</p>
      </div>
      <SeedLocation discovery={discovery} />
      <SeedActions discovery={discovery} copied={copied} onCopy={onCopy} onCreate={onCreate} featured />
    </div>
  </article>;
}

function SeedCard({ discovery, copied, onCopy, onCreate }: {
  discovery: SeedDiscovery;
  copied: boolean;
  onCopy: (discovery: SeedDiscovery) => void;
  onCreate: (discovery: SeedDiscovery) => void;
}) {
  const { t } = useTranslation();
  return <article className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
    <div className="relative aspect-[16/9] overflow-hidden bg-elevated">
      <img src={seedDiscoveryImagePath(discovery)} alt={t("seeds.imageAlt", { title: t(discovery.titleKey) })}
        loading="lazy" className="h-full w-full object-cover" />
      <span className="absolute left-3 top-3 rounded-[var(--radius-sm)] bg-background/90 px-2 py-1 text-[11px] font-bold tabular-nums text-zinc-100">
        #{String(discovery.rank).padStart(2, "0")}
      </span>
    </div>
    <div className="flex flex-1 flex-col gap-3 p-4">
      <div>
        <SeedMetadata discovery={discovery} />
        <h3 className="mt-2 text-[17px] font-semibold leading-snug text-zinc-50">{t(discovery.titleKey)}</h3>
        <p className="mt-2 text-[12px] leading-5 text-zinc-300">{t(discovery.descriptionKey)}</p>
      </div>
      <SeedLocation discovery={discovery} />
      <div className="mt-auto pt-2">
        <SeedActions discovery={discovery} copied={copied} onCopy={onCopy} onCreate={onCreate} />
      </div>
    </div>
  </article>;
}

export default function SeedDiscoveryPage({ initialEdition = "all", preferredVersion = null, onCreateWorld }: {
  initialEdition?: EditionFilter;
  preferredVersion?: string | null;
  onCreateWorld: (input: NewWorld) => void;
}) {
  const { t } = useTranslation();
  const [edition, setEdition] = useState<EditionFilter>(initialEdition);
  const [priorityVersion, setPriorityVersion] = useState(preferredVersion);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const visibleSeeds = GAME_SEED_DISCOVERIES.filter(seed => edition === "all" || seed.edition === edition)
    .sort((left, right) => {
      if (priorityVersion && left.version !== right.version) {
        if (left.version === priorityVersion) return -1;
        if (right.version === priorityVersion) return 1;
        return compareVersions(left.version, right.version);
      }
      return left.rank - right.rank;
    });
  const featured = visibleSeeds[0];

  const copySeed = async (discovery: SeedDiscovery) => {
    try {
      await navigator.clipboard.writeText(discovery.seed);
      setCopiedId(discovery.id);
      setCopyError(false);
    } catch (error) {
      console.error("Could not copy the seed.", error);
      setCopyError(true);
    }
  };
  const createWorld = (discovery: SeedDiscovery) => onCreateWorld({
    name: t(discovery.titleKey), edition: discovery.edition,
    generation: { version: discovery.version, seed: discovery.seed, preset: "default", settings: {} },
  });

  return <div className="h-full overflow-y-auto bg-background text-white">
    <div className="mx-auto max-w-[1040px] px-5 pb-10 pt-7 sm:px-7">
      <header className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[.15em] text-accent">{t("seeds.eyebrow")}</p>
        <h1 className="mt-2 text-[clamp(1.75rem,3vw,2.25rem)] font-semibold tracking-tight text-zinc-50">{t("seeds.title")}</h1>
        <p className="mt-2 max-w-[65ch] text-[13px] leading-5 text-zinc-300">{t("seeds.intro")}</p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-border pb-4">
        <div role="group" aria-label={t("seeds.editionFilter")}
          className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-border bg-surface p-1">
          {(["all", "java", "bedrock"] as const).map(option => <button key={option} type="button"
            aria-pressed={edition === option} onClick={() => { setEdition(option); setPriorityVersion(null); }}
            className={cn("min-h-8 cursor-pointer rounded-[var(--radius-sm)] px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent",
              edition === option ? "bg-accent text-on-accent" : "text-zinc-300 hover:bg-surface-hover hover:text-white")}>
            {option === "all" ? t("seeds.allEditions") : t(`worlds.editions.${option}`)}
          </button>)}
        </div>
        <span className="ml-auto text-xs tabular-nums text-subtle">{t("seeds.results", { count: visibleSeeds.length })}</span>
      </div>

      {copyError && <p role="alert" className="mb-4 text-xs text-danger-text">{t("seeds.copyFailed")}</p>}
      {featured ? <>
        <FeaturedSeed discovery={featured} copied={copiedId === featured.id} onCopy={copySeed} onCreate={createWorld} />
        {visibleSeeds.length > 1 && <section className="mt-8" aria-labelledby="more-seeds-heading">
          <h2 id="more-seeds-heading" className="mb-4 text-base font-semibold text-zinc-100">{t("seeds.morePicks")}</h2>
          <div className="seed-card-grid grid gap-4">
            {visibleSeeds.slice(1).map(discovery => <SeedCard key={discovery.id} discovery={discovery}
              copied={copiedId === discovery.id} onCopy={copySeed} onCreate={createWorld} />)}
          </div>
        </section>}
      </> : <p className="rounded-[var(--radius-md)] border border-border bg-surface p-8 text-center text-sm text-zinc-300">{t("seeds.empty")}</p>}
    </div>
  </div>;
}
