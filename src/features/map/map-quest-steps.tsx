import { ArrowRight, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { contentUrl } from "../../lib/content-url";
import { requestMapDestinationInMain } from "./map-window-bridge";
import { findDirectedStepMarker } from "./map-quest-step-marker";
import type { MapPoint } from "./types";

interface QuestStepLocation {
  name?: string;
  x: number;
  y: number;
  zone: string;
  zoneX: number;
  zoneY: number;
}
interface QuestSteps {
  title: string;
  pickup: QuestStepLocation[];
  objectives: { name: string; locations: QuestStepLocation[] }[];
  handIn: QuestStepLocation[];
  earlier: string[];
  following: string[];
}
interface QuestStepsCatalog { version: 1; quests: Record<string, QuestSteps> }

let catalogRequest: Promise<QuestStepsCatalog> | undefined;
function loadCatalog() {
  catalogRequest ??= fetch(contentUrl("data/quests/step-locations.json")).then(async (response) => {
    if (!response.ok) throw new Error(`Quest steps: HTTP ${response.status}`);
    const data: QuestStepsCatalog = await response.json();
    if (data.version !== 1 || !data.quests) throw new Error("Invalid quest steps");
    return data;
  }).catch((error: unknown) => { catalogRequest = undefined; throw error; });
  return catalogRequest;
}

function distinctLocations(locations: QuestStepLocation[]) {
  return locations.filter((location, index) => !locations.slice(0, index).some((other) =>
    Math.hypot(location.x - other.x, location.y - other.y) < 35));
}

const normalizeName = (name: string) => name.toLowerCase().replace(/[’]/g, "'").trim();
const isUnnamedNpc = (name?: string) => !name || /^npc #\d+$/i.test(name);

function findNpcMarker(location: QuestStepLocation, name: string, points: MapPoint[]) {
  const npcId = location.name?.match(/^npc #(\d+)$/i)?.[1];
  return points.filter((point) => ["npc", "quest", "dungeon-quest", "repeatable-quest",
    "merchant", "innkeeper", "profession-trainer",
    "class-trainer", "repair-vendor", "banker", "stable-master"].includes(point.category)
    && Math.hypot(point.x - location.x, point.y - location.y) <= 100
    && (npcId && "entityId" in point && point.entityId === npcId
      || normalizeName(point.name) === normalizeName(name)
      || "sourceName" in point && typeof point.sourceName === "string"
        && normalizeName(point.sourceName) === normalizeName(name)))
    .sort((left, right) => Math.hypot(left.x - location.x, left.y - location.y)
      - Math.hypot(right.x - location.x, right.y - location.y))[0];
}

export default function MapQuestSteps({ questId, markerId, mapId, mapPoints, pickupName, handInName, questObjective,
  questMarkers, onOpenMap }: {
  questId: string;
  markerId: string;
  mapId: string;
  mapPoints: MapPoint[];
  pickupName?: string;
  handInName?: string;
  questObjective?: string;
  questMarkers: Record<string, string>;
  onOpenMap: (mapId: string, markerId: string) => void;
}) {
  const { t } = useTranslation();
  const gameText = useGameText();
  const [catalog, setCatalog] = useState<QuestStepsCatalog>();
  useEffect(() => {
    let active = true;
    void loadCatalog().then((value) => { if (active) setCatalog(value); })
      .catch((error: unknown) => console.error("Failed to load quest steps", error));
    return () => { active = false; };
  }, []);
  const quest = catalog?.quests[questId];
  if (!quest) return null;

  const showLocation = (location: QuestStepLocation, name: string, stepKey: string) => {
    const marker = stepKey === "pickup" || stepKey === "handIn"
      ? findNpcMarker(location, name, mapPoints) : undefined;
    const directedMarker = !marker && stepKey !== "pickup" ? findDirectedStepMarker({
      kind: stepKey === "handIn" ? "handIn" : "objective", location,
      label: name, questObjective, handInName,
      handInLocations: quest.handIn,
    }, mapPoints) : undefined;
    const target = marker ?? directedMarker;
    if (target) {
      onOpenMap(mapId, target.id);
      return;
    }
    requestMapDestinationInMain("azeroth", {
      name, x: location.x, y: location.y, returnTo: { mapId, markerId },
    });
  };
  const localizedNpcName = (location: QuestStepLocation, name: string, stepKey: string) =>
    stepKey === "pickup" || stepKey === "handIn"
      ? findNpcMarker(location, name, mapPoints)?.name ?? name : name;
  const locationButton = (location: QuestStepLocation, label: string, stepKey: string, key: string) =>
    <button key={key} type="button" onClick={() => showLocation(location, label, stepKey)}
      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left text-[12px] text-zinc-100 transition-colors hover:border-accent/55 hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-accent">
      <span className="min-w-0 leading-snug">{localizedNpcName(location, label, stepKey)}<span className="ml-2 text-subtle">{gameText(location.zone)} · {location.zoneX}, {location.zoneY}</span></span>
      <MapPin size={14} className="shrink-0 text-accent" aria-hidden="true" />
    </button>;
  const chain = (ids: string[]) => ids.filter((id) => questMarkers[id] && catalog?.quests[id]?.title);
  const earlier = chain(quest.earlier);
  const following = chain(quest.following);
  const steps = [
    { key: "pickup", label: t("map.foreverQuest.pickup"), locations: distinctLocations(quest.pickup),
      name: isUnnamedNpc(quest.pickup[0]?.name) ? pickupName : quest.pickup[0]?.name },
    ...quest.objectives.map((objective, index) => ({ key: `objective-${index}`,
      label: objective.name || t("map.foreverQuest.objective"), locations: distinctLocations(objective.locations), name: objective.name })),
    { key: "handIn", label: t("map.foreverQuest.handIn"), locations: distinctLocations(quest.handIn),
      name: isUnnamedNpc(quest.handIn[0]?.name) ? handInName : quest.handIn[0]?.name },
  ].filter(({ locations }) => locations.length);
  if (!steps.length && !earlier.length && !following.length) return null;

  return <section className="mt-4 border-t border-border pt-4" aria-label={t("map.foreverQuest.mapSteps")}>
    <h3 className="text-[13px] font-semibold text-zinc-100">{t("map.foreverQuest.mapSteps")}</h3>
    <div className="mt-3 space-y-3">
      {steps.map((step, index) => <div key={step.key} className="space-y-1.5">
        <p className="map-micro-label">{index + 1}. {step.label}{step.name && step.name !== step.label
          ? ` · ${localizedNpcName(step.locations[0], step.name, step.key)}` : ""}</p>
        {step.locations.map((location, locationIndex) => locationButton(location,
          step.name || step.label, step.key, `${step.key}-${locationIndex}`))}
      </div>)}
    </div>
    {(earlier.length > 0 || following.length > 0) && <div className="mt-4 space-y-2 border-t border-border pt-4">
      {[{ ids: earlier, label: t("map.foreverQuest.earlier") },
        { ids: following, label: t("map.foreverQuest.following") }].flatMap(({ ids, label }) => ids.map((id) =>
        <button key={`${label}-${id}`} type="button" onClick={() => onOpenMap(mapId, questMarkers[id])}
          className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left text-[12px] text-zinc-100 transition-colors hover:border-accent/55 hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-accent">
          <span className="min-w-0"><span className="text-subtle">{label}:</span> {gameText(catalog?.quests[id]?.title ?? "", `Quest:${id}:0`)}</span>
          <ArrowRight size={14} className="shrink-0 text-accent" aria-hidden="true" />
        </button>))}
    </div>}
  </section>;
}
