import type { PointerEvent, MouseEvent } from "react";

export default function MapNativeHitShape({ path, size, scale, onEnter, onLeave, onClick, onContextMenu }: {
  path: string;
  size: number;
  scale: number;
  onEnter: (target: Element) => void;
  onLeave: () => void;
  onClick: (event: MouseEvent<SVGPathElement>) => void;
  onContextMenu?: (event: MouseEvent<SVGPathElement>) => void;
}) {
  const capture = (event: PointerEvent<SVGPathElement>) => event.currentTarget.setPointerCapture(event.pointerId);
  return <svg className="map-native-hit-shape" viewBox="0 0 64 64" aria-hidden="true"
    style={{ width: size, height: size, transform: `translate(-50%, -50%) scale(${scale})` }}>
    <path d={path} fill="transparent" style={{ pointerEvents: "visiblePainted", cursor: "pointer" }}
      data-map-marker-control onPointerDown={capture}
      onPointerEnter={(event) => onEnter(event.currentTarget)} onPointerLeave={onLeave}
      onClick={onClick} onContextMenu={onContextMenu} />
  </svg>;
}
