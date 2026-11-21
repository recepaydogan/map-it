import { ArrowUpRight, PanelTopOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapMechanismProfile, MapSearchIndexLocation } from "./types";

interface MapMechanismProfileSectionProps {
  profile: MapMechanismProfile;
  locations: MapSearchIndexLocation[];
  onSelect: (location: MapSearchIndexLocation) => void;
}

const MapMechanismProfileSection = ({ profile, locations, onSelect }: MapMechanismProfileSectionProps) => {
  const { t } = useTranslation();
  const locationsById = new Map<string, MapSearchIndexLocation[]>();
  for (const location of locations) {
    if (!location.contentId) continue;
    locationsById.set(location.contentId, [...(locationsById.get(location.contentId) ?? []), location]);
  }
  const controller = profile.role === "controller";
  const movementGroups = new Map<string, NonNullable<MapMechanismProfile["movements"]>>();
  for (const movement of profile.movements ?? []) {
    movementGroups.set(movement.action, [...(movementGroups.get(movement.action) ?? []), movement]);
  }
  const titleKey = profile.sequence
    ? profile.sequence.role === "step" ? "map.mechanism.sequenceTitle" : "map.mechanism.sequenceResultTitle"
    : profile.role === "moving-object" ? "map.mechanism.movementTitle"
      : controller ? "map.mechanism.controllerTitle" : "map.mechanism.targetTitle";
  return (
    <section className="map-dialogue-checks" aria-labelledby="map-mechanism-title">
      <div className="map-dialogue-section-heading">
        <PanelTopOpen size={14} aria-hidden="true" />
        <h4 id="map-mechanism-title">{t(titleKey)}</h4>
      </div>
      {profile.sequence && (
        <div className="mt-3">
          <h5 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
            {profile.sequence.title}
          </h5>
          <div className="mt-2 grid gap-1.5">
            {profile.sequence.steps.map((step) => {
              const stepLocations = locationsById.get(step.contentId) ?? [];
              const active = profile.sequence?.role === "step" && profile.sequence.currentStep === step.order;
              const content = (
                <>
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-[10px] font-semibold text-white/70">
                    {step.order}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[11px] font-semibold text-white">{stepLocations[0]?.name || step.title}</strong>
                    {step.clue && <span className="mt-1 block whitespace-pre-line text-[10px] leading-4 text-white/55">{step.clue}</span>}
                    {active && <span className="mt-0.5 block text-[10px] text-white/45">{t("map.mechanism.currentStep")}</span>}
                  </span>
                  {stepLocations.length > 0 && <ArrowUpRight size={13} className="shrink-0 text-white/45" aria-hidden="true" />}
                </>
              );
              return stepLocations.length > 0 ? (
                <button
                  key={`${profile.sequence?.puzzleId}:${step.order}`}
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-white/10 bg-white/[0.025] px-2.5 py-2 text-left transition-colors hover:border-white/20 hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  onClick={() => onSelect(stepLocations[0])}
                >
                  {content}
                </button>
              ) : (
                <div key={`${profile.sequence?.puzzleId}:${step.order}`} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-white/8 bg-white/[0.02] px-2.5 py-2">
                  {content}
                </div>
              );
            })}
          </div>
          {profile.sequence.solution && (
            <div className="mt-2 rounded-[var(--radius-md)] border border-white/10 bg-white/[0.025] px-2.5 py-2">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40">{t("map.mechanism.completedInscription")}</span>
              <strong className="mt-1 block whitespace-pre-line text-[11px] leading-5 text-white">{profile.sequence.solution}</strong>
            </div>
          )}
          <div className="mt-2 rounded-[var(--radius-md)] border border-white/10 bg-white/[0.025] px-2.5 py-2">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40">{t("map.mechanism.result")}</span>
            <strong className="mt-0.5 block text-[11px] text-white">{t(`map.mechanism.actions.${profile.sequence.result.action}`)}</strong>
          </div>
        </div>
      )}
      {movementGroups.size > 0 && (
        <div className="mt-3 grid gap-1.5">
          {[...movementGroups.entries()].map(([action, routes]) => {
            const destinationLocations = routes.flatMap(({ destinationContentId }) => locationsById.get(destinationContentId) ?? []);
            const content = (
              <>
                <span className="min-w-0 flex-1">
                  <strong className="block text-[11px] text-white">{t(`map.mechanism.actions.${action}`)}</strong>
                  <span className="mt-0.5 block text-[10px] text-white/45">
                    {t("map.mechanism.routeCount", { count: routes.length })}
                  </span>
                </span>
                {destinationLocations.length > 0 && <ArrowUpRight size={13} className="shrink-0 text-white/45" aria-hidden="true" />}
              </>
            );
            return destinationLocations.length > 0 ? (
              <button
                key={action}
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-white/10 bg-white/[0.025] px-2.5 py-2 text-left transition-colors hover:border-white/20 hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                onClick={() => onSelect(destinationLocations[0])}
              >
                {content}
              </button>
            ) : (
              <div key={action} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-white/8 bg-white/[0.02] px-2.5 py-2">
                {content}
              </div>
            );
          })}
        </div>
      )}
      {(profile.effects?.length ?? 0) > 0 && (
        <div className="mt-2 grid gap-1.5">
          {profile.effects?.map((effect) => (
            <div key={effect.effectId} className="rounded-[var(--radius-md)] border border-amber-200/20 bg-amber-200/[0.045] px-2.5 py-2">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-100/60">{t("map.mechanism.effect")}</span>
              <strong className="mt-0.5 block text-[11px] text-white">{t(`map.mechanism.actions.${effect.action}`)}</strong>
            </div>
          ))}
        </div>
      )}
      {profile.related.length > 0 && !profile.sequence && (
        <>
          <h5 className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
            {t(controller ? "map.mechanism.controls" : "map.mechanism.controlledBy")}
          </h5>
          <div className="mt-2 grid gap-1.5">
            {profile.related.flatMap((related) => {
              const relatedLocations = locationsById.get(related.contentId) ?? [];
              if (relatedLocations.length === 0) {
                return (
                  <div key={related.linkId} className="rounded-[var(--radius-md)] border border-white/8 bg-white/[0.025] px-2.5 py-2">
                    <strong className="block text-[11px] text-white">{related.title}</strong>
                    <span className="mt-0.5 block text-[10px] text-white/50">{t(`map.mechanism.actions.${related.action}`)}</span>
                  </div>
                );
              }
              return relatedLocations.map((location) => (
                <button
                  key={`${related.linkId}:${location.mapId}:${location.id}`}
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-cyan-200/20 bg-cyan-200/[0.045] px-2.5 py-2 text-left transition-colors hover:border-cyan-200/45 hover:bg-cyan-200/[0.075] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  onClick={() => onSelect(location)}
                >
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[11px] font-semibold text-white">{location.name || related.title}</strong>
                    <span className="mt-0.5 block truncate text-[10px] text-white/55">{location.mapName}</span>
                    <span className="mt-0.5 block text-[10px] text-cyan-100/60">{t(`map.mechanism.actions.${related.action}`)}</span>
                  </span>
                  <ArrowUpRight size={13} className="shrink-0 text-cyan-200" aria-hidden="true" />
                </button>
              ));
            })}
          </div>
        </>
      )}
    </section>
  );
};

export default MapMechanismProfileSection;
