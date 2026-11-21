export const FOUND_BADGE_FILL = "#34d399";
export const FOUND_BADGE_OUTLINE = "#0b0b0e";

export function paintMapMarkerFoundBadge(context: CanvasRenderingContext2D, x: number, y: number, markerSize: number) {
  const scale = Math.min(1, markerSize / 32);
  const centerX = x + markerSize / 2 - scale;
  const centerY = y + markerSize / 2 - scale;
  context.save();
  context.translate(centerX, centerY);
  context.scale(scale, scale);
  context.beginPath();
  context.arc(0, 0, 7, 0, Math.PI * 2);
  context.fillStyle = FOUND_BADGE_FILL;
  context.shadowColor = "rgba(0, 0, 0, 0.55)";
  context.shadowBlur = 3;
  context.shadowOffsetY = 1;
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = FOUND_BADGE_OUTLINE;
  context.stroke();
  context.shadowColor = "transparent";
  context.beginPath();
  context.moveTo(-3.5, 0);
  context.lineTo(-0.8, 2.7);
  context.lineTo(4, -3);
  context.lineWidth = 2;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke();
  context.restore();
}
