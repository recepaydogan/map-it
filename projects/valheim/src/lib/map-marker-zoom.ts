/** Keep map pins proportional as the world zooms out, with a readable floor. */
export const mapMarkerZoomScale = (zoom: number) =>
  Math.min(1, Math.max(0.6, Math.sqrt(zoom)))
