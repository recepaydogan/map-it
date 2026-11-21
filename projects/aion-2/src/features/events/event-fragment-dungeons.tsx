import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EVENT_CANDY_FRAGMENT_DUNGEONS } from "../../game-config";
import { useReferenceNavigation } from "../reference/reference-navigation-context";

export default function EventFragmentDungeons() {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();

  return <div className="@container space-y-3">
    {EVENT_CANDY_FRAGMENT_DUNGEONS.map(({ category, dungeonIds }) => <section key={category}
      className="border-t border-border pt-3">
      <h5 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">
        {t(`events.guide.fragmentDungeons.${category}`)}
      </h5>
      <div className="grid gap-x-4 @min-[440px]:grid-cols-2">
        {dungeonIds.map((id) => {
          const name = t(`mapInteriors.names.${id}`);
          return <button key={id} type="button"
            onClick={() => openReference({ category: "dungeons", id: `Dungeon:${id}`, name })}
            className="flex min-w-0 cursor-pointer items-center justify-between gap-2 border-b border-border/70 px-1 py-2 text-left text-[12px] font-medium text-zinc-100 transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
            <span className="min-w-0 break-words">{name}</span>
            <ArrowUpRight size={13} className="shrink-0 text-accent" aria-hidden="true" />
          </button>;
        })}
      </div>
    </section>)}
  </div>;
}
