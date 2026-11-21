// Prevents users from exfiltrating bundled assets via drag-out or
// "Save image as" from the in-app browser.
//
// Both blockers are scoped to asset elements only. Blocking dragstart
// unconditionally would break click delivery inside the Overwolf overlay
// window — global capture-phase preventDefault on dragstart interferes with
// how Overwolf's input pipeline routes mousedown -> click in its overlay
// renderer. Element-scoped filtering keeps clicks intact.

const ASSET_SELECTOR = "img, video, audio, svg, picture, canvas";

const hitsAsset = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(ASSET_SELECTOR) || target.querySelector(ASSET_SELECTOR));
};

let installed = false;

export const installAssetExportBlockers = (): void => {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener(
    "dragstart",
    (event) => {
      if (hitsAsset(event.target)) event.preventDefault();
    },
    { capture: true },
  );

  window.addEventListener(
    "contextmenu",
    (event) => {
      if (hitsAsset(event.target)) event.preventDefault();
    },
    { capture: true },
  );
};
