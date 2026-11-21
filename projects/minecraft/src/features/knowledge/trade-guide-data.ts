import { GAME_GUIDE_TRADE_CURRENCY_ITEM, GAME_GUIDE_TRADE_SHARED_POOLS,
  GAME_GUIDE_TRADE_WANDERING_ENTITY, GAME_GUIDE_TRADE_WANDERING_ID,
  GAME_GUIDE_TRADE_VILLAGER_ENTITY, GAME_GUIDE_TRADE_VILLAGER_ENTITY_BEDROCK,
  GAME_GUIDE_TRADE_WORKSTATIONS } from "../../game-config.ts";
import type { KnowledgeMechanicRecord, ValidatedMechanicsCatalog } from "./mechanics-types.ts";

export interface TradeGuideEntry {
  id: string;
  offers: readonly KnowledgeMechanicRecord[];
  entityId: string;
  workstationId?: string;
  wandering: boolean;
}

export interface TradeGuideIndex {
  professions: ReadonlyMap<string, TradeGuideEntry>;
  offers: ReadonlyMap<string, KnowledgeMechanicRecord>;
  offerProfessions: ReadonlyMap<string, readonly string[]>;
}

export type TradeOfferDirection = "all" | "spend" | "earn";

export const tradeOfferDirection = (offer: KnowledgeMechanicRecord): Exclude<TradeOfferDirection, "all"> =>
  offer.outputs.some(output => output.id === GAME_GUIDE_TRADE_CURRENCY_ITEM) ? "earn" : "spend";

export const createTradeGuideIndex = (catalog: ValidatedMechanicsCatalog | null): TradeGuideIndex => {
  const professions = new Map<string, TradeGuideEntry>();
  const offers = new Map<string, KnowledgeMechanicRecord>();
  const offerProfessions = new Map<string, readonly string[]>();
  if (!catalog) return { professions, offers, offerProfessions };
  const byProfession = new Map<string, KnowledgeMechanicRecord[]>();
  for (const subject of catalog.subjects) if (subject.kind === "trade"
    && !GAME_GUIDE_TRADE_SHARED_POOLS[subject.id]) byProfession.set(subject.id, []);
  for (const offer of catalog.mechanics) {
    if (offer.kind !== "trade" || offer.subject.kind !== "trade") continue;
    const targets = GAME_GUIDE_TRADE_SHARED_POOLS[offer.subject.id] ?? [offer.subject.id];
    const available = targets.filter(id => byProfession.has(id));
    if (!available.length) continue;
    offers.set(offer.id, offer);
    offerProfessions.set(offer.id, available);
    for (const id of available) byProfession.get(id)!.push(offer);
  }
  for (const [id, entries] of byProfession) {
    if (!entries.length) continue;
    entries.sort((left, right) => (left.trade?.level ?? 0) - (right.trade?.level ?? 0)
      || left.id.localeCompare(right.id));
    const wandering = id === GAME_GUIDE_TRADE_WANDERING_ID;
    professions.set(id, { id, offers: entries,
      entityId: wandering ? GAME_GUIDE_TRADE_WANDERING_ENTITY : catalog.source.edition === "bedrock"
        ? GAME_GUIDE_TRADE_VILLAGER_ENTITY_BEDROCK : GAME_GUIDE_TRADE_VILLAGER_ENTITY,
      workstationId: GAME_GUIDE_TRADE_WORKSTATIONS[id], wandering });
  }
  return { professions, offers, offerProfessions };
};
