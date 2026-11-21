import { useEffect } from "react";
import { useMapExperience } from "../map-experience/map-experience";

/**
 * Receives GEP-driven messages forwarded from the background page and turns them
 * into UI actions. Currently: `gep_boss_fight` (a Nightreign final-night boss
 * encounter, see overwolf-utils/gep) opens the selected Nightlord's page.
 *
 * Renders nothing. Mounted only in the main window (dashboard-window), inside the
 * MapExperienceProvider, so the auto-open lands where the user asked for it.
 */
const GepBridge = () => {
  const { openNightlordDetail } = useMapExperience();

  useEffect(() => {
    if (typeof overwolf === "undefined" || !overwolf.windows?.onMessageReceived) return;
    const onMessage = (message: { id: string; content?: unknown }) => {
      if (message.id === "gep_boss_fight") openNightlordDetail();
    };
    overwolf.windows.onMessageReceived.addListener(onMessage);
    return () => overwolf.windows.onMessageReceived.removeListener(onMessage);
  }, [openNightlordDetail]);

  return null;
};

export default GepBridge;
