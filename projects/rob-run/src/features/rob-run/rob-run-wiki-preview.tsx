import type { ReactNode } from "react";
import MapItemPanel from "../map/map-item-panel";
import { requestMapPointInMain } from "../map/map-window-bridge";
import { ReferenceNavigationContext } from "../reference/reference-navigation-context";
import {
  openRobRunPreviewAsPage, RobRunPreviewRendererContext, useRobRunPreview, type RobRunPreviewTarget,
} from "./rob-run-catalog-navigation";
import RobRunEconomy from "./rob-run-economy";
import RobRunReferenceLists from "./rob-run-reference-lists";

function WikiPreview({ target }: { target: RobRunPreviewTarget }) {
  const preview = useRobRunPreview();
  switch (target.page) {
    case "items":
      return <ReferenceNavigationContext.Provider value={({ id, name }) =>
        (preview?.open ?? openRobRunPreviewAsPage)({ page: "items", id, name: name ?? id })}>
        <MapItemPanel itemId={target.id} onOpenMap={(mapId, markerId) => requestMapPointInMain(markerId, mapId)} />
      </ReferenceNavigationContext.Provider>;
    case "barters":
    case "shipments":
    case "loot":
      return <RobRunEconomy page={target.page} target={target} preview />;
    default:
      return <RobRunReferenceLists page={target.page} initialId={target.id} preview={{ vendorItemId: target.vendorItemId }} />;
  }
}

const renderPreview = (target: RobRunPreviewTarget) => <WikiPreview target={target} />;

export default function RobRunWikiPreviewProvider({ children }: { children: ReactNode }) {
  return <RobRunPreviewRendererContext.Provider value={renderPreview}>{children}</RobRunPreviewRendererContext.Provider>;
}
