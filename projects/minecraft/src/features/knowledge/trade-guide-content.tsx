import type { TFunction } from "i18next";
import type { InspectorContent, InspectorGuideSection, InspectorLink } from "../inspector/inspector-types.ts";
import type { RecipeSubjectDisplay } from "./recipe-subject-display.ts";
import type { KnowledgeMechanicRecord, KnowledgeSubjectRef } from "./mechanics-types.ts";
import type { TradeGuideEntry, TradeGuideIndex } from "./trade-guide-data.ts";
import { TradeOfferList, TradeOfferPreview } from "./trade-guide-visuals.tsx";

const subjectLink = (kind: "item" | "entity" | "trade", id: string, display: RecipeSubjectDisplay): InspectorLink =>
  ({ key: `trade:${kind}:${id}`, subject: { kind, id }, ...display(kind, id) });

const sideName = (items: readonly KnowledgeSubjectRef[], display: RecipeSubjectDisplay) => items.map(item =>
  `${item.count && item.count.min > 1 ? `${item.count.min}× ` : ""}${display(item.kind, item.id).name}`).join(" + ");

export const createTradeGuideContent = (entry: TradeGuideEntry, base: InspectorContent | null,
  display: RecipeSubjectDisplay, availableItems: ReadonlySet<string>, availableEntities: ReadonlySet<string>,
  t: TFunction): InspectorContent => {
  const name = base?.name ?? display("trade", entry.id).name;
  const links = [
    ...(availableEntities.has(entry.entityId) ? [subjectLink("entity", entry.entityId, display)] : []),
    ...(entry.workstationId && availableItems.has(entry.workstationId)
      ? [subjectLink("item", entry.workstationId, display)] : []),
  ];
  const sections: InspectorGuideSection[] = [{ key: "trade:offers",
    title: t("inspector.tradeGuide.availableOffers"),
    body: <TradeOfferList key={entry.id} entry={entry} display={display} t={t} /> }];
  if (links.length) sections.push({ key: "trade:find", title: t("inspector.tradeGuide.findTrader"),
    sections: [{ key: "trade:find:links", title: t("inspector.tradeGuide.findTrader"), links }] });
  return { ...base, ...display("trade", entry.id), name, category: t("inspector.subjectKinds.trade"),
    description: t(entry.wandering ? "inspector.tradeGuide.wanderingIntro" : "inspector.tradeGuide.professionIntro"),
    guideSections: sections, sectionLinksInteractive: true };
};

export const createTradeOfferContent = (offer: KnowledgeMechanicRecord, base: InspectorContent | null,
  index: TradeGuideIndex, display: RecipeSubjectDisplay, t: TFunction): InspectorContent => {
  const name = `${sideName(offer.inputs, display)} → ${sideName(offer.outputs, display)}`;
  const professions = (index.offerProfessions.get(offer.id) ?? [])
    .map(id => subjectLink("trade", id, display));
  const sections: InspectorGuideSection[] = [{ key: "trade:exchange", title: t("inspector.tradeGuide.exchange"),
    body: <TradeOfferPreview offer={offer} display={display} t={t} /> }];
  if (professions.length) sections.push({ key: "trade:professions", title: t("inspector.tradeGuide.availableFrom"),
    sections: [{ key: "trade:profession:links", title: t("inspector.tradeGuide.availableFrom"), links: professions }] });
  return { ...base, name, category: t("inspector.subjectKinds.trade"),
    description: t("inspector.tradeGuide.offerIntro"), guideSections: sections, sectionLinksInteractive: true };
};
