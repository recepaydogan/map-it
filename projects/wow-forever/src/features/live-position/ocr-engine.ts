import { createWorker, OEM, PSM, type Worker } from "tesseract.js";
import { COORDINATE_ROW, findOcrPanel, parseOcrCoordinates, readOcrFacing, readOcrMetadata } from "./ocr-panel";

export async function loadPositionOcr(onError: (error: unknown) => void): Promise<Worker> {
  const root = new URL("./assets/position-ocr/", location.href);
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: new URL("worker.min.js", root).href,
    corePath: new URL("tesseract-core-lstm.wasm.js", root).href,
    langPath: root.href,
    workerBlobURL: false,
    cacheMethod: "none",
    errorHandler: onError,
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: "XY0123456789. " });
    return worker;
  } catch (error) {
    await worker.terminate();
    throw error;
  }
}

export function createOcrFrameReader() {
  const atlasCrop = document.createElement("canvas");
  const raw = atlasCrop.getContext("2d", { willReadFrequently: true })!;
  const scaled = document.createElement("canvas");
  scaled.width = 4 * COORDINATE_ROW.width;
  scaled.height = 4 * COORDINATE_ROW.height;
  const ctx = scaled.getContext("2d", { willReadFrequently: true })!;
  const coordinateMask = new Uint8Array(scaled.width * scaled.height);
  let cropVersion = 0;
  let recognizedText: string | null = null;
  let previous: ReturnType<typeof findOcrPanel> = null;

  function prepare(frame: ImageData) {
    const panel = previous = findOcrPanel(frame, previous);
    if (!panel) return null;
    const metadata = readOcrMetadata(frame, panel);
    if (!metadata) return null;

    const x = Math.round(panel.x + COORDINATE_ROW.x * panel.scaleX);
    const y = Math.round(panel.y + COORDINATE_ROW.y * panel.scaleY);
    const width = Math.round(COORDINATE_ROW.width * panel.scaleX);
    const height = Math.round(COORDINATE_ROW.height * panel.scaleY);
    if (atlasCrop.width !== width) atlasCrop.width = width;
    if (atlasCrop.height !== height) atlasCrop.height = height;
    raw.putImageData(frame, -x, -y, x, y, width, height);
    ctx.drawImage(atlasCrop, 0, 0, scaled.width, scaled.height);
    const pixels = ctx.getImageData(0, 0, scaled.width, scaled.height);
    let changed = false;
    for (let i = 0; i < coordinateMask.length; i++) {
      const offset = i * 4;
      const value = pixels.data[offset + 1]! >= 125 ? 0 : 255;
      if (coordinateMask[i] !== value) changed = true;
      coordinateMask[i] = value;
      pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = value;
    }
    if (changed) {
      cropVersion++;
      recognizedText = null;
    }
    if (recognizedText === null) ctx.putImageData(pixels, 0, 0);
    return { packed: metadata, facing: readOcrFacing(frame, panel, metadata) };
  }

  return {
    prepare,
    async recognize(worker: Worker, metadata: NonNullable<ReturnType<typeof prepare>>) {
      // A stationary player's digits remain identical while the heartbeat and facing change.
      const version = cropVersion;
      const text = recognizedText ?? (await worker.recognize(scaled)).data.text;
      const sample = parseOcrCoordinates(text, metadata.packed);
      if (sample && version === cropVersion) recognizedText = text;
      return sample && { ...sample, facing: metadata.facing };
    },
  };
}
