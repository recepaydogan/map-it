import pages from "../../../public/data/enshrouded/building-page-index.json";

export const BUILDING_NAVIGATION_EVENT = "enshrouded:open-building";
const pageNames = new Set(pages.map((name) => name.replace(/_/g, " ").toLowerCase()));
export const hasBuildingPage = (name: string | null | undefined) => Boolean(name
  && pageNames.has(name.replace(/_/g, " ").toLowerCase()));
