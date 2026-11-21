import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn";
import { nrItemIconUrl } from "../../utils/assets";
import { rarityColor, type Page } from "./nr-archive-pages";

// Item icons stream from the CDN (see nrItemIconUrl) so the ~21MB set stays out of
// the OPK. When one can't load — offline, or an id with no icon — the archive shows
// the current category's glyph instead (see ItemIcon), so a tile is never blank.
export const archiveIconUrl = (id?: number | null) => (id == null ? undefined : nrItemIconUrl(id));

/**
 * An archive item's icon: the real (CDN) image when it loads, else the category's
 * fallback glyph. One fallback per category is enough — every page on screen belongs
 * to the same category, so the caller passes that category's icon.
 */
export const ArchiveItemIcon = ({
  src,
  fallback: Fallback,
  imgClass,
  iconSize,
}: {
  src?: string;
  fallback: LucideIcon;
  imgClass: string;
  iconSize: number;
}) => {
  const [failedSource, setFailedSource] = useState<string>();
  if (src && src !== failedSource) {
    return (
      <img
        src={src}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
        className={imgClass}
        onError={() => setFailedSource(src)}
      />
    );
  }
  return <Fallback size={iconSize} className="text-subtle" aria-hidden="true" />;
};

const Chip = ({ color, children }: { color?: string; children: React.ReactNode }) => (
  <span
    className="rounded-[var(--radius-full)] bg-white/[0.08] px-2 py-0.5 text-[11px] font-medium"
    style={{ color: color ?? "#e4e4e7" }}
  >
    {children}
  </span>
);

export const ArchiveItemDetail = ({ p, fallback }: { p: Page; fallback: LucideIcon }) => {
  const color = rarityColor(p.rarity);
  const showRarity = p.rarity != null;
  const src = archiveIconUrl(p.iconId);
  return (
    // Left-aligned (no mx-auto) to match the Elden Ring item detail — the content hugs the
    // list side instead of floating centred in the reclaimed width.
    <div className="max-w-[760px] px-4 py-5 sm:px-6">
      <header className="flex items-start gap-4">
        <span
          className="grid h-20 w-20 shrink-0 place-items-center rounded-[var(--radius-lg)]"
          style={
            showRarity
              ? { backgroundColor: `${color}14`, border: "1px solid rgba(63, 214, 224, 0.55)" }
              : { backgroundColor: "rgba(255,255,255,0.04)" }
          }
        >
          <ArchiveItemIcon src={src} fallback={fallback} imgClass="h-16 w-16 object-contain" iconSize={24} />
        </span>
        <div className="min-w-0 flex-1">
          {p.sub && (
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: showRarity ? color : "var(--accent)" }}
            >
              {p.sub}
            </p>
          )}
          <h2 className="mt-0.5 text-[19px] font-semibold leading-tight text-white">{p.name}</h2>
          {p.chips?.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.chips.map((c) => (
                <Chip key={c.label} color={c.color}>
                  {c.label}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {p.info && <p className="mt-4 text-[13px] font-medium leading-relaxed text-zinc-200">{p.info}</p>}
      {p.body && (
        <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-zinc-400">{p.body}</p>
      )}

      {p.blocks?.length ? (
        <section
          className={cn(
            "mt-4 grid gap-3",
            p.blocks.length > 1 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {p.blocks.map((b) => (
            <div key={b.title} className="rounded-[var(--radius-lg)] border border-border bg-white/[0.02] p-3.5">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{b.title}</h3>
              <div className="mt-2 space-y-1">
                {b.rows.map((row) => (
                  <p key={row.label} className="flex justify-between gap-3 text-[12.5px]">
                    <span style={{ color: row.color ?? "#a1a1aa" }}>{row.label}</span>
                    <span className="font-semibold tabular-nums text-zinc-100">{row.value}</span>
                  </p>
                ))}
                {!b.rows.length && <p className="text-[12px] text-subtle">—</p>}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {p.notes?.map((n) => (
        <section key={n.title} className="mt-3 rounded-[var(--radius-lg)] border border-border bg-white/[0.02] p-3.5">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">{n.title}</h3>
          <div className="mt-1.5 space-y-1.5">
            {n.lines.map((l, i) => (
              <p key={i} className="whitespace-pre-line text-[12.5px] leading-relaxed text-zinc-300">
                {l}
              </p>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

