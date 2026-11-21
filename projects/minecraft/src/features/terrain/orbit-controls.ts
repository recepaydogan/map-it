import { orbitCamera, panOrbitCamera, zoomOrbitCamera } from "./orbit-camera.ts";
import type { OrbitCamera } from "./orbit-camera.ts";

export interface OrbitControlOptions {
  getCamera: () => OrbitCamera;
  setCamera: (camera: OrbitCamera) => void;
  onManualCamera: () => void;
  onPick: (x: number, y: number) => void;
  onReset: () => void;
}

/** All listeners are canvas-scoped; panel keys, text fields and the ad rail are untouched. */
export const bindOrbitControls = (canvas: HTMLCanvasElement, options: OrbitControlOptions): (() => void) => {
  let drag: { pointer: number; x: number; y: number; startX: number; startY: number; button: number; moved: boolean } | null = null;
  const down = (event: PointerEvent) => {
    if (!event.isPrimary || drag || ![0, 1, 2].includes(event.button)) return;
    event.preventDefault(); canvas.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId);
    drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, button: event.button, moved: false };
  };
  const move = (event: PointerEvent) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 3) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    drag.x = event.clientX; drag.y = event.clientY; drag.moved = true;
    const height = canvas.getBoundingClientRect().height;
    if (height <= 0) return;
    options.onManualCamera();
    options.setCamera(event.shiftKey || drag.button !== 0
      ? panOrbitCamera(options.getCamera(), dx, dy, height) : orbitCamera(options.getCamera(), dx, dy));
  };
  const up = (event: PointerEvent) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const selected = !drag.moved && drag.button === 0;
    drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (selected) {
      const rect = canvas.getBoundingClientRect();
      options.onPick(event.clientX - rect.left, event.clientY - rect.top);
    }
  };
  const cancel = () => { drag = null; };
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.getBoundingClientRect().height : 1;
    options.onManualCamera(); options.setCamera(zoomOrbitCamera(options.getCamera(), event.deltaY * multiplier));
  };
  const key = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Home") { event.preventDefault(); options.onManualCamera(); options.onReset(); return; }
    if (["+", "=", "-", "_"].includes(event.key)) {
      event.preventDefault(); options.onManualCamera();
      options.setCamera(zoomOrbitCamera(options.getCamera(), ["+", "="].includes(event.key) ? -100 : 100)); return;
    }
    const offsets: Record<string, readonly [number, number]> = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] };
    const offset = offsets[event.key];
    if (!offset) return;
    const height = canvas.getBoundingClientRect().height;
    if (height <= 0) return;
    event.preventDefault(); options.onManualCamera();
    options.setCamera(event.shiftKey ? panOrbitCamera(options.getCamera(), ...offset, height) : orbitCamera(options.getCamera(), ...offset));
  };
  const context = (event: MouseEvent) => event.preventDefault();
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", cancel); canvas.addEventListener("lostpointercapture", cancel);
  canvas.addEventListener("wheel", wheel, { passive: false }); canvas.addEventListener("keydown", key); canvas.addEventListener("contextmenu", context);
  return () => {
    if (drag && canvas.hasPointerCapture(drag.pointer)) canvas.releasePointerCapture(drag.pointer);
    drag = null;
    canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", cancel); canvas.removeEventListener("lostpointercapture", cancel);
    canvas.removeEventListener("wheel", wheel); canvas.removeEventListener("keydown", key); canvas.removeEventListener("contextmenu", context);
  };
};
