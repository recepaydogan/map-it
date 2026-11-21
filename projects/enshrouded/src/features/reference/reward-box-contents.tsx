import { useTranslation } from "react-i18next";
import { formatDropChance } from "../../lib/format-drop-chance";
import DatabaseSectionTitle from "../database/database-section-title";
import AdventureLinkList from "./adventure-link-list";
import type { ReferenceLink, ReferenceSection } from "./reference-types";

const contentKinds: Record<string, string> = {
  "reference.labels.contents": "guaranteed",
  "reference.labels.choose-a-reward": "selection",
  "reference.labels.possible-contents": "random",
};

const RewardBoxContents = ({ sections, technical }: { sections: ReferenceSection[]; technical: boolean }) => {
  const { t, i18n } = useTranslation();
  const readableLink = (link: ReferenceLink, random: boolean): ReferenceLink => {
    const rates = random ? link.rewardRates?.map((rate) => {
      const chance = rate.percent > 100 ? t("reference.dungeon.multipleRewards") : formatDropChance(rate.percent, i18n.language);
      const quantity = rate.quantityMin === rate.quantityMax ? `${rate.quantityMin}` : `${rate.quantityMin}–${rate.quantityMax}`;
      return rate.kind === "pool"
        ? t("reference.boxes.poolRate", { chance,
          pool: rate.poolPercent === undefined ? t("reference.dungeon.rateUnavailable") : formatDropChance(rate.poolPercent, i18n.language),
          rolls: rate.poolCount ?? t("reference.dungeon.rateUnavailable"), quantity })
        : t("reference.boxes.directRate", { chance, quantity });
    }).join(" · ") : undefined;
    return { ...link,
      name: link.unresolvedName && !technical ? t("reference.boxes.unresolvedItem") : link.name,
      note: random ? rates || t("reference.dungeon.rateUnavailable") : link.note,
      quantity: random && link.rewardRates?.length ? undefined : link.quantity,
    };
  };
  const populated = sections.filter((section) => section.links?.length);
  return <div className="@container space-y-7">
    {populated.length === 0 && <p className="text-[13px] text-subtle">{t("reference.boxes.contentsUnknown")}</p>}
    {populated.map((section, index) => {
      const kind = contentKinds[section.title];
      return <section key={`${section.title}-${index}`}>
        <DatabaseSectionTitle count={section.links?.length}>{t(`reference.boxes.${kind}`)}</DatabaseSectionTitle>
        <p className="mb-3 text-[12px] leading-relaxed text-subtle">{t(`reference.boxes.${kind}Notice`)}</p>
        <AdventureLinkList links={section.links!.map((link) => readableLink(link, kind === "random"))} showRates={kind === "random"} showRateNotes />
      </section>;
    })}
  </div>;
};

export default RewardBoxContents;
