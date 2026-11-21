import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const brand = path.resolve(import.meta.dirname, '..', 'brand');
const layersDirectory = path.join(brand, 'store-tile-layers');
const layout = JSON.parse(await fs.readFile(path.join(layersDirectory, 'layout.json'), 'utf8'));
const textScale = layout.textScale ?? 1;
const ampersand = layout.layers.find((layer) => layer.name === 'ampersand');
const map = layout.layers.find((layer) => layer.name === 'map');
const guide = layout.layers.find((layer) => layer.name === 'guide');
const anchorX = ampersand.left + ampersand.width / 2;
const anchorY = Math.min(map.top, ampersand.top, guide.top);
const textWidths = Object.fromEntries([map, ampersand, guide].map((layer) => [
  layer.name, Math.round(layer.width * textScale),
]));
const ampersandLeft = Math.round(anchorX - textWidths.ampersand / 2);
const textPositions = {
  map: ampersandLeft - layout.gap - textWidths.map,
  ampersand: ampersandLeft,
  guide: ampersandLeft + textWidths.ampersand + layout.gap,
};

const overlays = await Promise.all(layout.layers.map(async (layer) => {
  const input = path.join(layersDirectory, `${layer.name}.png`);
  const decoration = layer.name.startsWith('decoration-');
  const scaleX = decoration ? (layout.decorationScaleX ?? 1) : textScale;
  const width = Math.round(layer.width * scaleX);
  const height = decoration ? layer.height : Math.round(layer.height * textScale);
  let pixels;

  if (layer.name === 'decoration-center' && width !== layer.width) {
    // Stretch the two rules while keeping the central diamond's proportions.
    const centerWidth = 64;
    const sourceLeft = Math.floor((layer.width - centerWidth) / 2);
    const targetLeft = Math.floor((width - centerWidth) / 2);
    const parts = await Promise.all([
      sharp(input).extract({ left: 0, top: 0, width: sourceLeft, height })
        .resize(targetLeft, height, { fit: 'fill' }).png().toBuffer(),
      sharp(input).extract({ left: sourceLeft, top: 0, width: centerWidth, height })
        .png().toBuffer(),
      sharp(input).extract({ left: sourceLeft + centerWidth, top: 0,
        width: layer.width - sourceLeft - centerWidth, height })
        .resize(width - targetLeft - centerWidth, height, { fit: 'fill' }).png().toBuffer(),
    ]);
    pixels = await sharp({ create: { width, height, channels: 4, background: '#00000000' } })
      .composite(parts.map((part, index) => ({ input: part, top: 0,
        left: [0, targetLeft, targetLeft + centerWidth][index] })))
      .png().toBuffer();
  } else {
    pixels = await sharp(input).resize(width, height, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  }

  const left = decoration
    ? (layer.name === 'decoration-center'
      ? layer.left + Math.floor(layer.width / 2) - Math.floor(width / 2)
      : Math.round(anchorX + (layer.left - anchorX) * scaleX))
    : textPositions[layer.name];
  const top = decoration
    ? layer.top + (layout.decorationOffsetY ?? 0)
    : anchorY + Math.round((layer.top - anchorY) * textScale);
  return {
    input: pixels,
    left: left + layout.offsetX + (decoration ? 0 : (layout.textOffsetX ?? 0)),
    top: top + layout.offsetY,
  };
}));

const artwork = await sharp(path.join(layersDirectory, 'background.png'))
  .composite(overlays)
  .png()
  .toBuffer();

await fs.writeFile(path.join(brand, `${layout.variant ?? 'store-tile-map-guide-v2'}-master.png`), artwork);
await fs.writeFile(path.join(brand, 'store-tile-artwork.png'), artwork);
console.log(`Built layered tile with text offset ${layout.offsetX + (layout.textOffsetX ?? 0)}px right and ${layout.offsetY}px down.`);
