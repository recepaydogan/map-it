import type { MapPoint } from "./types";

interface StepLocation {
  name?: string;
  x: number;
  y: number;
}

interface DirectedStep {
  kind: "objective" | "handIn";
  location: StepLocation;
  label: string;
  questObjective?: string;
  handInName?: string;
  handInLocations: StepLocation[];
}

const NPC_CATEGORIES = new Set([
  "npc", "merchant", "innkeeper", "profession-trainer", "class-trainer",
  "repair-vendor", "banker", "stable-master",
]);
const MAX_MARKER_DISTANCE = 20;

const normalizeName = (value: string) => value.toLowerCase().replace(/[’]/g, "'").trim();
const sourceName = (point: MapPoint) => "sourceName" in point && typeof point.sourceName === "string"
  ? point.sourceName : point.name;
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function directsToPerson(text: string | undefined, name: string) {
  if (!text || !name) return false;
  const target = escapeRegex(normalizeName(name));
  return new RegExp(`\\b(?:learn|speak|talk|bring|deliver|report|return|meet|visit)\\b[^.!?]{0,120}\\b(?:from|with|to)\\s+${target}(?=$|[^a-z0-9])`)
    .test(normalizeName(text));
}

const distance = (location: StepLocation, point: MapPoint) =>
  Math.hypot(point.x - location.x, point.y - location.y);

function namesDirectedNpc(step: DirectedStep, point: MapPoint) {
  const originalName = sourceName(point);
  if (step.kind === "handIn") {
    return !step.location.name && !step.handInName
      && directsToPerson(step.questObjective, originalName);
  }
  if (directsToPerson(step.label, originalName)) return true;
  return /^objective\s+\d+(?:\s*×\s*\d+)?$/i.test(step.label)
    && !!step.handInName && [point.name, originalName].some((name) =>
      normalizeName(step.handInName!) === normalizeName(name))
    && directsToPerson(step.questObjective, originalName)
    && step.handInLocations.some((location) => distance(location, point) <= MAX_MARKER_DISTANCE);
}

export function findDirectedStepMarker(step: DirectedStep, points: MapPoint[]): MapPoint | undefined {
  const candidates = points.filter((point) => NPC_CATEGORIES.has(point.category)
    && distance(step.location, point) <= MAX_MARKER_DISTANCE
    && namesDirectedNpc(step, point));
  if (new Set(candidates.map((point) => normalizeName(sourceName(point)))).size !== 1) return undefined;
  return candidates.sort((left, right) => distance(step.location, left) - distance(step.location, right))[0];
}
