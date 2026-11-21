export const OCR_PANEL = { width: 148, height: 64, border: 3 } as const;
export const COORDINATE_ROW = { x: 8, y: 40, width: 132, height: 19 } as const;

interface PanelBounds { x: number; y: number; scaleX: number; scaleY: number }

export interface OcrPositionSample {
  map: number;
  x: number;
  y: number;
  heartbeat: number;
}

export function packPositionMetadata(map: number, x: number, y: number, heartbeat: number) {
  const check = (map * 13 + x * 31 + y * 17 + heartbeat * 7) % 97;
  return (map << 14) | (heartbeat << 7) | check;
}

export function parseOcrCoordinates(text: string, packed: number): OcrPositionSample | null {
  const map = packed >>> 14;
  const heartbeat = (packed >>> 7) & 127;
  const check = packed & 127;
  if (map === 0 || map > 99999 || heartbeat >= 100 || check >= 97) return null;
  const row = text.replace(/\s/g, "");
  const match = /^X?(\d{1,3})\.?(\d{2})Y(\d{1,3})\.?(\d{2})$/.exec(row)
    ?? /^X?(\d{1,3})\.(\d{2})(\d{1,3})\.(\d{2})$/.exec(row);
  if (!match) return null;
  const x = Number(match[1]) * 100 + Number(match[2]);
  const y = Number(match[3]) * 100 + Number(match[4]);
  if (x > 10000 || y > 10000 || packed !== packPositionMetadata(map, x, y, heartbeat)) return null;
  return { map, x: x / 100, y: y / 100, heartbeat };
}

/** Locate the card by its continuous slate outline. Check the last area first. */
export function findOcrPanel(frame: ImageData, previous: PanelBounds | null): PanelBounds | null {
  const { data, width, height } = frame;
  const isBorder = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const offset = (y * width + x) * 4;
    return Math.abs(data[offset]! - 64) <= 11
      && Math.abs(data[offset + 1]! - 74) <= 10 && Math.abs(data[offset + 2]! - 85) <= 11;
  };
  const scaleFromRun = (left: number, right: number) => (right - left + 1) / OCR_PANEL.width;
  const checkRun = (left: number, row: number, right: number) => {
    const scaleX = scaleFromRun(left, right);
    if (scaleX < 0.38 || scaleX > 3) return null;
    const inset = Math.round(12 * scaleX);
    const rail = (y: number) => isBorder(left + inset, y) && isBorder(right - inset, y);

    let top = row;
    while (row - top < 9 && rail(top - 1)) top--;
    let topEnd = row;
    while (topEnd - top < 9 && rail(topEnd + 1)) topEnd++;
    if (topEnd - top + 1 > Math.ceil(OCR_PANEL.border * scaleX) + 1) return null;
    const topCenter = (top + topEnd) / 2;
    const expectedBottom = topCenter + (OCR_PANEL.height - OCR_PANEL.border) * scaleX;
    const tolerance = Math.ceil(2 + scaleX);
    for (let bottom = Math.round(expectedBottom) - tolerance; bottom <= expectedBottom + tolerance; bottom++) {
      if (!rail(bottom)) continue;
      let bottomEnd = bottom;
      while (bottomEnd - bottom < 9 && rail(bottomEnd + 1)) bottomEnd++;
      if (bottomEnd - bottom + 1 > Math.ceil(OCR_PANEL.border * scaleX) + 1) continue;
      const scaleY = ((bottom + bottomEnd) / 2 - topCenter) / (OCR_PANEL.height - OCR_PANEL.border);
      const y = topCenter + 0.5 - OCR_PANEL.border * scaleY / 2;
      const panel = { x: left, y, scaleX, scaleY };
      if (y >= -1 && y + OCR_PANEL.height * scaleY <= height + 1 && readOcrMetadata(frame, panel)) return panel;
    }
    return null;
  };
  const expandRun = (x: number, y: number) => {
    let left = x, right = x;
    while (x - left <= 450 && isBorder(left - 1, y)) left--;
    while (right - x <= 450 && isBorder(right + 1, y)) right++;
    return { left, right };
  };

  if (previous) {
    const x = Math.round(previous.x + OCR_PANEL.width * previous.scaleX / 2);
    const targetY = Math.round(previous.y + OCR_PANEL.border * previous.scaleY / 2);
    for (let y = targetY - 1; y <= targetY + 1; y++) {
      if (!isBorder(x, y)) continue;
      const { left, right } = expandRun(x, y);
      const panel = checkRun(left, y, right);
      if (panel) return panel;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x += 2) {
      if (!isBorder(x, y)) continue;
      const { left, right } = expandRun(x, y);
      const panel = checkRun(left, y, right);
      if (panel) return panel;
      x = right;
    }
  }
  return null;
}

function pixelOffset(frame: ImageData, panel: PanelBounds, x: number, y: number) {
  const col = Math.floor(panel.x + x * panel.scaleX);
  const row = Math.floor(panel.y + y * panel.scaleY);
  return col >= 0 && row >= 0 && col < frame.width && row < frame.height ? (row * frame.width + col) * 4 : -1;
}

export function readOcrMetadata(frame: ImageData, panel: PanelBounds) {
  const green = (x: number, y: number) => {
    const i = pixelOffset(frame, panel, x, y);
    return i < 0 ? -1000 : frame.data[i + 1]!;
  };
  const reference = green(15, OCR_PANEL.border / 2);
  let packed = 0;
  for (let i = 0; i < 31; i++) {
    const x = i < 16 ? 1.5 : OCR_PANEL.width - 1.5;
    const y = 4 + (i % 16 + 0.5) * 3.5;
    const delta = green(x, y) - reference;
    if (Math.abs(delta) < 6 || Math.abs(delta) > 30) return 0;
    if (delta > 0) packed |= 1 << i;
  }
  const map = packed >>> 14;
  return map > 0 && map <= 99999 && ((packed >>> 7) & 127) < 100 && (packed & 127) < 97 ? packed : 0;
}

export function readOcrFacing(frame: ImageData, panel: PanelBounds, positionCode: number) {
  const tint = (x: number) => {
    const i = pixelOffset(frame, panel, x, OCR_PANEL.border / 2);
    return i < 0 ? NaN : frame.data[i]! - frame.data[i + 2]!;
  };
  const reference = tint(15);
  let code = 0;
  for (let i = 0; i < 14; i++) {
    const delta = tint(26 + (i + 0.5) * 7) - reference;
    // Older or directionless panels have a solid stroke.
    if (!(Math.abs(delta) >= 7 && Math.abs(delta) <= 21)) return null;
    if (delta > 0) code |= 1 << i;
  }
  const degrees = code & 511;
  return degrees < 360 && (code >>> 9) === (degrees * 11 + positionCode) % 31 ? degrees : null;
}

/** WoW counts radians counterclockwise from north. Atlas axes face east and south. */
export function facingToWorldVector(degrees: number | null) {
  if (degrees === null) return { dx: 0, dy: 0 };
  const angle = degrees * Math.PI / 180;
  return { dx: -Math.sin(angle), dy: -Math.cos(angle) };
}
