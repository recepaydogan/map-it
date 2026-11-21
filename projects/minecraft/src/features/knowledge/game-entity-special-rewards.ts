import type { TFunction } from "i18next";
import { GAME_GUIDE_ENTITY_SPECIAL_REWARDS } from "../../game-config.ts";
import type { InspectorSubject } from "../inspector/inspector-controller.ts";
import type { InspectorContent, InspectorLink } from "../inspector/inspector-types.ts";
import type { KnowledgeSubjectDisplay } from "./mechanics-inspector-content.ts";
import type { ValidatedMechanicsCatalog } from "./mechanics-types.ts";

type Resolver = (subject: InspectorSubject) => InspectorContent | null;

/** Add verified rewards which the edition's entity loot tables do not encode. */
export const withGameEntitySpecialRewards = (resolve: Resolver, display: KnowledgeSubjectDisplay, t: TFunction,
  catalog: ValidatedMechanicsCatalog | null, items: ReadonlySet<string>, edition: string): Resolver => {
  if (edition !== "java" || !catalog) return resolve;
  const entities = new Set(catalog.subjects.filter(subject => subject.kind === "entity").map(subject => subject.id));
  const rewards = GAME_GUIDE_ENTITY_SPECIAL_REWARDS.filter(reward => entities.has(reward.entity) && items.has(reward.item));
  return subject => {
    const base = resolve(subject);
    const matches = rewards.filter(reward => subject.kind === "entity" ? reward.entity === subject.id
      : subject.kind === "item" && reward.item === subject.id);
    if (!matches.length) return base;
    const links: InspectorLink[] = matches.map(reward => {
      const target = subject.kind === "entity" ? { kind: "item" as const, id: reward.item }
        : { kind: "entity" as const, id: reward.entity };
      return { key: `entity-special:${reward.entity}:${reward.item}`, subject: target, ...display(target.kind, target.id),
        note: t(`inspector.entityAcquisition.${reward.method}`) };
    });
    const fallback = display(subject.kind, subject.id);
    return { ...base, name: base?.name ?? fallback.name, image: base?.image ?? fallback.image,
      category: base?.category ?? t(`inspector.subjectKinds.${subject.kind}`),
      sections: [...(base?.sections ?? []), { key: "entity:special-rewards",
        title: t(subject.kind === "entity" ? "inspector.entityAcquisition.specialRewards"
          : "inspector.entityAcquisition.specialSources"), links }] };
  };
};
