import type { PlannerMapSourcePoint } from '../store/planner-map-source-store'

const WORLD_DIAMETER = 21_000

interface ResourcePointView {
  zoom: number
  mapSize: number
  panX: number
  panY: number
  viewportWidth: number
  viewportHeight: number
}

/** Cull saved pins by the viewport; never replace actual world positions by representatives. */
export function selectVisibleResourcePoints(points: PlannerMapSourcePoint[], view: ResourcePointView): PlannerMapSourcePoint[] {
  const visible: PlannerMapSourcePoint[] = []
  for (const point of points) {
    const screenX = view.viewportWidth / 2 + view.panX + (point.x / WORLD_DIAMETER) * view.mapSize * view.zoom
    const screenY = view.viewportHeight / 2 + view.panY - (point.z / WORLD_DIAMETER) * view.mapSize * view.zoom
    if (screenX < -40 || screenX > view.viewportWidth + 40 || screenY < -40 || screenY > view.viewportHeight + 40) continue
    visible.push(point)
  }
  return visible
}
