import { Sparkles, Swords } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ItemEffect } from "./types";

const ItemEffectCard = ({ effect }: { effect: ItemEffect }) => {
  const { t, i18n } = useTranslation();
  const Icon = effect.kind === "action" ? Swords : Sparkles;
  const name = effect.localizedNames[i18n.language] ?? effect.localizedNames.en ?? effect.name;
  const description = effect.localizedDescriptions[i18n.language]
    ?? effect.localizedDescriptions.en
    ?? effect.description;

  return (
    <article className="rounded-[var(--radius-md)] border border-border bg-surface px-3.5 py-3">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-accent/25 bg-accent-soft text-accent">
          <Icon size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-5 text-white">{name}</p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
            {t(`items.effects.${effect.kind}`)}
          </p>
          {description && (
            <p className="mt-2 whitespace-pre-line text-[12px] leading-5 text-zinc-300">{description}</p>
          )}
        </div>
      </div>
    </article>
  );
};

export default ItemEffectCard;
