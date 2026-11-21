type Rect = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>

const overlaps = (first: Rect, second: Rect) =>
  first.left < second.right && first.right > second.left &&
  first.top < second.bottom && first.bottom > second.top

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum))

/** Keep a map click in place unless the opened detail panel covers its marker or label. */
export function selectionLandingOffset(
  viewport: Rect,
  panel: Rect,
  marker: Rect,
  tooltip: Rect | null,
  panelGap: number,
): { x: number; y: number } | null {
  if (!overlaps(marker, panel) && (!tooltip || !overlaps(tooltip, panel))) return null

  const markerRadius = Math.max(21, marker.width / 2 + 3)
  const tooltipHalfWidth = (tooltip?.width ?? 0) / 2
  const horizontalClearance = Math.max(markerRadius, tooltipHalfWidth) + 16
  const desiredX = clamp(
    panel.right - viewport.left + Math.max(panelGap, tooltipHalfWidth + 16),
    horizontalClearance,
    viewport.width - horizontalClearance,
  )
  const desiredY = clamp(
    panel.top - viewport.top + panel.height / 2,
    markerRadius + (tooltip?.height ?? 0) + 16,
    viewport.height - markerRadius - 16,
  )
  return { x: desiredX - viewport.width / 2, y: desiredY - viewport.height / 2 }
}
