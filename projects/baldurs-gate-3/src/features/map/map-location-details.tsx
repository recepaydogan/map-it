import { MapPinned } from "lucide-react";
import { useTranslation } from "react-i18next";
import DetailBackLink from "../../components/detail-back-link";
import { getCategoryConfig, getPointAppearance, TRANSITION_CATEGORIES } from "./map-config";
import MapDetailActions from "./map-detail-actions";
import MapDetailHeader from "./map-detail-header";
import MapMarkerStylePicker from "./map-marker-style-picker";
import MapMarkerGroupPicker from "./map-marker-group-picker";
import MapGameplaySummary from "./map-gameplay-summary";
import MapCharacterProfileSummary from "./map-character-profile-summary";
import MapPartyMemberProfileSection from "./map-party-member-profile";
import MapConnectedLocations from "./map-connected-locations";
import MapLocationIntelligence from "./map-spoiler-content";
import MapVendorStock from "./map-vendor-stock";
import MapWaypointProfile from "./map-waypoint-profile";
import MapTransitionProfileSection from "./map-transition-profile";
import MapAccessProfileSection from "./map-access-profile";
import MapLootProfileSection from "./map-loot-profile";
import MapScenePossessions from "./map-scene-possessions";
import MapTrapProfileSection from "./map-trap-profile";
import MapHiddenPassageProfileSection from "./map-hidden-passage-profile";
import MapRecipeUnlockProfileSection from "./map-recipe-unlock-profile";
import MapReadableImpactProfileSection from "./map-readable-impact-profile";
import MapItemStoryImpactProfileSection from "./map-item-story-impact-profile";
import MapItemLocationProfileSection from "./map-item-location-profile";
import MapInspirationProfileSection from "./map-inspiration-profile";
import MapItemDatabaseFacts from "./map-item-database-facts";
import MapOwnershipProfileSection from "./map-ownership-profile";
import MapDiggableSecretProfileSection from "./map-diggable-secret-profile";
import MapMechanismProfileSection from "./map-mechanism-profile";
import MapStoryInteractionProfileSection from "./map-story-interaction-profile";
import MapStoryOwnershipZoneProfileSection from "./map-story-ownership-zone-profile";
import MapAdamantineForgeProfileSection from "./map-adamantine-forge-profile";
import MapSecretPuzzleProfileSection from "./map-secret-puzzle-profile";
import MapWyrmwayPuzzleProfileSection from "./map-wyrmway-puzzle-profile";
import MapCrechePuzzleProfileSection from "./map-creche-puzzle-profile";
import MapArcaneTowerTransportProfileSection from "./map-arcane-tower-transport-profile";
import MapSharEntrancePuzzleProfileSection from "./map-shar-entrance-puzzle-profile";
import MapBalthazarSecretRoomProfileSection from "./map-balthazar-secret-room-profile";
import MapMinscSluicePuzzleProfileSection from "./map-minsc-sluice-puzzle-profile";
import MapPuzzleCombinationProfileSection from "./map-puzzle-combination-profile";
import { getMapItemVisual, useMapItemVisuals } from "./use-map-item-visuals";
import { DEFAULT_MARKER_GROUP } from "./marker-group-config";
import ItemRarityBadges from "../items/item-rarity-badges";
import { CUSTOM_MARKER_CREATION_VISIBLE } from "./map-ui-features";
import type { ItemDatabaseEntry } from "../items/types";
import {
  isUserMapMarker,
  type MapContentEntity,
  type MapPoint,
  type MapSearchIndexLocation,
  type UserMarkerGroup,
  type UserMarkerStyleChange,
} from "./types";
import { usePointDraft } from "./use-point-draft";

interface MapLocationDetailsProps {
  mapId: string;
  point: MapPoint;
  content?: MapContentEntity;
  connectedLocations: MapSearchIndexLocation[];
  accessLocations: MapSearchIndexLocation[];
  partyMemberLocations: MapSearchIndexLocation[];
  itemOwnerLocations: MapSearchIndexLocation[];
  combinationLocations: MapSearchIndexLocation[];
  mechanismLocations: MapSearchIndexLocation[];
  questLocations: MapSearchIndexLocation[];
  completed: boolean;
  favorite: boolean;
  selectedLootItemId?: string;
  /** Label of the panel this one was drilled into from, when there is one. */
  parentLabel?: string;
  onBack: () => void;
  onNavigateBack?: () => void;
  onToggleCompleted: () => void;
  onToggleFavorite: () => void;
  onCenter: () => void;
  onOpenCombatProfile: () => void;
  onSelectMatchingLocation: (location: MapSearchIndexLocation) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onSaveCoordinate: () => void;
  onUpdateStyle: (change: UserMarkerStyleChange) => void;
  onUpdateGroup: (group: UserMarkerGroup) => void;
  onSelectLootItem: (item: ItemDatabaseEntry) => void;
  onSelectRelatedItem: (itemId: string) => void;
}

/**
 * The detail panel for one selected point — a shipped location, a personal
 * marker or a typed coordinate. Personal markers can be renamed, restyled,
 * regrouped and deleted here.
 */
const MapLocationDetails = ({
  mapId,
  point,
  content,
  connectedLocations,
  accessLocations,
  partyMemberLocations,
  itemOwnerLocations,
  combinationLocations,
  mechanismLocations,
  questLocations,
  completed,
  favorite,
  selectedLootItemId,
  parentLabel,
  onBack,
  onNavigateBack,
  onToggleCompleted,
  onToggleFavorite,
  onCenter,
  onOpenCombatProfile,
  onSelectMatchingLocation,
  onRename,
  onRemove,
  onSaveCoordinate,
  onUpdateStyle,
  onUpdateGroup,
  onSelectLootItem,
  onSelectRelatedItem,
}: MapLocationDetailsProps) => {
  const { t, i18n } = useTranslation();
  const appearance = getPointAppearance(point);
  const contentId = "contentId" in point ? point.contentId : undefined;
  const itemVisual = getMapItemVisual(useMapItemVisuals(), contentId);
  const category = getCategoryConfig(point.category);
  const categoryLabel = t(category.labelKey);
  const custom = isUserMapMarker(point);
  const coordinate = point.subtype === "coordinate";
  const language = (i18n.resolvedLanguage ?? i18n.language).split("-")[0];
  const localizedTitle = content?.localizedTitles?.[language]
    ?? content?.localizedTitles?.en
    ?? point.name;
  const description = ("description" in point ? point.description : undefined)
    ?? content?.localizedDescriptions?.[language]
    ?? content?.localizedDescriptions?.en
    // The game description block is no longer listed separately, so its body is
    // the last fallback for entities without a localized description.
    ?? content?.spoilerBlocks.find((block) => block.id.endsWith(":game-description"))?.body;
  const [draftName, setDraftName] = usePointDraft(point.id, localizedTitle);
  // Passages explain themselves through their destination, so the generic
  // connected-passage list would only repeat what the profile already names.
  const transition = TRANSITION_CATEGORIES.includes(point.category);
  const tradeStock = content?.vendor ?? content?.tradeInventory;

  return (
    <div className="map-location-details flex min-h-0 flex-1 flex-col overflow-hidden">
      {onNavigateBack && parentLabel && (
        <DetailBackLink label={parentLabel} onClick={onNavigateBack} />
      )}
      <MapDetailHeader
        title={custom ? (
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={() => onRename(draftName.trim() || localizedTitle)}
              className="map-name-input"
              aria-label={t("map.details.markerName")}
            />
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="min-w-0 truncate text-base font-semibold leading-tight text-white">{localizedTitle}</h2>
              {itemVisual && (
                <ItemRarityBadges
                  rarity={itemVisual.rarity}
                  className="shrink-0"
                />
              )}
            </div>
          )}
        label={categoryLabel}
        location={point.region}
        markerClass={appearance.markerClass}
        icon={appearance.icon}
        nativeIconPath={appearance.nativeIconPath}
        sprite={itemVisual?.sprite}
        tightTop={Boolean(onNavigateBack && parentLabel)}
        onClose={onBack}
      />

      <div className="scroll-slim min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="w-full min-w-0">
        <MapDetailActions
          custom={custom}
          completed={completed}
          favorite={favorite}
          onToggleCompleted={onToggleCompleted}
          onToggleFavorite={onToggleFavorite}
          onCenter={onCenter}
          onRemove={onRemove}
        />

        {content?.inspirations && <MapInspirationProfileSection profile={content.inspirations} />}

        {description && (
          <p className="px-4 pb-3.5 text-[13px] leading-relaxed text-subtle">{description}</p>
        )}

        {content?.sceneContext && (
          <p className="px-4 pb-3.5 text-[13px] leading-relaxed text-subtle">
            {content.sceneContext.localizedDescriptions[language] ?? content.sceneContext.localizedDescriptions.en}
          </p>
        )}

        {(content?.sceneContext && (content.sceneContext.equipmentChange || content.sceneContext.inventoryChange || Boolean(content.sceneContext.itemTransfers?.length))) && (
          <MapScenePossessions
            scene={content.sceneContext}
            selectedItemId={selectedLootItemId}
            onSelectItem={onSelectLootItem}
          />
        )}

        {(content?.deathLoot || content?.containerLoot) && (
          <MapLootProfileSection
            deathLoot={content.deathLoot}
            containerLoot={content.containerLoot}
            selectedItemId={selectedLootItemId}
            onSelectItem={onSelectLootItem}
          />
        )}

        {itemVisual && (
          <MapItemDatabaseFacts
            objectId={content?.id}
            templateId={content?.templateId}
            statsId={content?.statsId}
            title={content?.title ?? point.name}
            mode="facts"
            onSelectRelatedItem={onSelectRelatedItem}
          />
        )}

      {content?.gameplay && !itemVisual && <MapGameplaySummary gameplay={content.gameplay} />}

      {content?.partyMember && (
        <MapPartyMemberProfileSection
          profile={content.partyMember}
          locations={partyMemberLocations}
          onSelect={onSelectMatchingLocation}
        />
      )}

      {content?.gameplay?.combat && (
        <MapCharacterProfileSummary profile={content.gameplay.combat} onOpen={onOpenCombatProfile} />
      )}

      {tradeStock && (
        <MapVendorStock
          vendor={tradeStock}
          isVendor={Boolean(content?.vendor)}
          selectedItemId={selectedLootItemId}
          onSelectItem={onSelectLootItem}
        />
      )}

      {content?.trap && <MapTrapProfileSection profile={content.trap} />}

      {content?.hiddenPassage && <MapHiddenPassageProfileSection />}

      {content?.recipeUnlock && <MapRecipeUnlockProfileSection profile={content.recipeUnlock} />}

      {content?.readableImpact && <MapReadableImpactProfileSection profile={content.readableImpact} />}

      {content?.itemStoryImpact && <MapItemStoryImpactProfileSection profile={content.itemStoryImpact} />}
      {content?.ownership && <MapOwnershipProfileSection profile={content.ownership} />}

      {content?.diggableSecret && (
        <MapDiggableSecretProfileSection
          profile={content.diggableSecret}
          selectedItemId={selectedLootItemId}
          onSelectItem={onSelectLootItem}
        />
      )}

      {content?.mechanism && (
        <MapMechanismProfileSection
          profile={content.mechanism}
          locations={mechanismLocations}
          onSelect={onSelectMatchingLocation}
        />
      )}

      {content?.storyInteraction && <MapStoryInteractionProfileSection profile={content.storyInteraction} />}
      {content?.storyOwnershipZone && <MapStoryOwnershipZoneProfileSection profile={content.storyOwnershipZone} />}

      {content?.adamantineForge && <MapAdamantineForgeProfileSection profile={content.adamantineForge} />}

      {content?.secretPuzzle && <MapSecretPuzzleProfileSection profile={content.secretPuzzle} />}

      {content?.wyrmwayPuzzle && <MapWyrmwayPuzzleProfileSection profile={content.wyrmwayPuzzle} />}
      {content?.crechePuzzle && <MapCrechePuzzleProfileSection profile={content.crechePuzzle} />}
      {content?.arcaneTowerTransport && <MapArcaneTowerTransportProfileSection profile={content.arcaneTowerTransport} />}
      {content?.sharEntrancePuzzle && <MapSharEntrancePuzzleProfileSection profile={content.sharEntrancePuzzle} />}
      {content?.balthazarSecretRoom && <MapBalthazarSecretRoomProfileSection profile={content.balthazarSecretRoom} />}
      {content?.minscSluicePuzzle && <MapMinscSluicePuzzleProfileSection profile={content.minscSluicePuzzle} />}

      {content?.waypoint && <MapWaypointProfile waypoint={content.waypoint} />}

      {transition && (
        <MapTransitionProfileSection
          category={point.category}
          internalName={content?.internalName}
          destinations={connectedLocations}
          onSelect={onSelectMatchingLocation}
        />
      )}

      {content?.access && (
        <MapAccessProfileSection
          profile={content.access}
          locations={accessLocations}
          onSelect={onSelectMatchingLocation}
        />
      )}

      {content?.puzzleCombinations && (
        <MapPuzzleCombinationProfileSection
          profile={content.puzzleCombinations}
          locations={combinationLocations}
          onSelect={onSelectMatchingLocation}
        />
      )}

      {content && (
        <MapLocationIntelligence
          content={content}
          mapId={mapId}
          questLocations={questLocations}
          onSelectLocation={onSelectMatchingLocation}
        />
      )}

      {!transition && (
        <MapConnectedLocations locations={connectedLocations} onSelect={onSelectMatchingLocation} />
      )}

      {custom && (
        <>
          <MapMarkerStylePicker
            color={point.color ?? "sage"}
            icon={point.icon ?? "pin"}
            onChange={onUpdateStyle}
          />
          <MapMarkerGroupPicker
            group={point.group ?? DEFAULT_MARKER_GROUP}
            onChange={onUpdateGroup}
          />
        </>
      )}

      {CUSTOM_MARKER_CREATION_VISIBLE && coordinate && (
        <div className="px-4 pb-4 pt-2">
          {coordinate && (
            <button type="button" onClick={onSaveCoordinate} className="map-secondary-button">
              <MapPinned size={14} aria-hidden="true" />
              {t("map.details.saveAsMarker")}
            </button>
          )}
        </div>
      )}

      {itemVisual && (
        <MapItemDatabaseFacts
          objectId={content?.id}
          templateId={content?.templateId}
          statsId={content?.statsId}
          title={content?.title ?? point.name}
          mode="directions"
          itemLocation={content?.itemLocation}
          itemOwnerLocations={itemOwnerLocations}
          onSelectOwner={onSelectMatchingLocation}
        />
      )}

      {!itemVisual && content?.itemLocation && (
        <MapItemLocationProfileSection
          profile={content.itemLocation}
          locations={itemOwnerLocations}
          onSelect={onSelectMatchingLocation}
        />
      )}
        </div>
      </div>
    </div>
  );
};

export default MapLocationDetails;
