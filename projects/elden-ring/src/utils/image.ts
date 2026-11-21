/**
 * Turn a user-picked image file into a small, self-contained data URL suitable
 * for storing in localStorage and showing on a ~30px map pin.
 *
 * Uploads are downscaled (longest edge → `max`, default 96px — crisp on a retina
 * pin) and re-encoded as WebP so a multi-megabyte photo collapses to a few KB.
 * Everything is kept inline (no blob URLs) so a stored marker survives a reload
 * with no external reference.
 */
const MAX_INPUT_BYTES = 8 * 1024 * 1024; // reject huge files before decoding

export class ImageError extends Error {}

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new ImageError("Couldn't read that file."));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImageError("That file isn't a valid image."));
    img.src = src;
  });

export const fileToMarkerImage = async (file: File, max = 96): Promise<string> => {
  if (!file.type.startsWith("image/"))
    throw new ImageError("Please choose an image file.");
  if (file.size > MAX_INPUT_BYTES)
    throw new ImageError("Image is too large (max 8 MB).");

  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);

  const longest = Math.max(img.width, img.height) || 1;
  const scale = Math.min(1, max / longest);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageError("Couldn't process that image.");
  ctx.drawImage(img, 0, 0, w, h);

  // Prefer WebP for size; canvas falls back to PNG automatically if a browser
  // doesn't support WebP encoding (the returned string is still a valid data URL).
  return canvas.toDataURL("image/webp", 0.85);
};
