import { BlockModel, Cull } from "deepslate";
import sharp from "sharp";

const blockStateModels = data => {
  const expand = value => (Array.isArray(value) ? value : [value]).filter(entry => typeof entry?.model === "string");
  if (data.variants) {
    const key = Object.keys(data.variants).sort((left, right) => left.localeCompare(right, "en", { numeric: true })).at(-1);
    return key === undefined ? [] : expand(data.variants[key]);
  }
  return (data.multipart ?? []).flatMap(part => expand(part.apply));
};

const createModelRenderer = (zip, namespace) => {
  const models = new Map(), textures = [], textureIds = new Map();
  const getModel = id => {
    const key = String(id).replace(`${namespace}:`, "");
    if (models.has(key)) return models.get(key);
    const bytes = zip[`assets/${namespace}/models/${key}.json`];
    const model = bytes ? BlockModel.fromJson(JSON.parse(new TextDecoder().decode(bytes))) : null;
    models.set(key, model);
    model?.flatten({ getBlockModel: getModel });
    return model;
  };
  const atlas = { getTextureUV(id) {
    const key = String(id).replace(`${namespace}:`, "");
    if (!textureIds.has(key)) { textureIds.set(key, textures.length); textures.push({ key }); }
    const index = textureIds.get(key);
    return [index * 2, 0, index * 2 + 1, 1];
  } };
  const render = async (modelIds, tint = () => [1, 1, 1]) => {
    const meshes = modelIds.map(getModel).filter(model => model?.elements?.length && !model.generationMarker)
      .map(model => ({ model, mesh: model.getMesh(atlas, Cull.none(), tint).transform(model.getDisplayTransform("gui")) }));
    if (!meshes.length) return null;
    for (const texture of textures) {
      if (texture.data) continue;
      const png = zip[`assets/${namespace}/textures/${texture.key}.png`];
      if (!png) throw new Error(`Missing model texture: ${texture.key}`);
      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      Object.assign(texture, { data, width: info.width, height: Math.min(info.width, info.height) });
    }
    const size = 64, pixels = Buffer.alloc(size * size * 4), depths = new Float64Array(size * size).fill(-Infinity);
    for (const { model, mesh } of meshes) for (const quad of mesh.quads.sort((a, b) => a.v1.pos.z - b.v1.pos.z)) {
      const normal = quad.normal();
      if (normal.z <= 0) continue;
      const shade = model.guiLight === "front" ? 1 : Math.min(1, 0.65 + 0.2 * normal.y + 0.15 * Math.abs(normal.x) + 0.2 * normal.z);
      const textureIndex = Math.floor((quad.v1.texture[0] + quad.v2.texture[0] + quad.v3.texture[0] + quad.v4.texture[0]) / 8);
      const texture = textures[textureIndex];
      const vertices = quad.vertices().map(v => ({ x: v.pos.x * 4, y: (16 - v.pos.y) * 4, z: v.pos.z,
        u: v.texture[0] - textureIndex * 2, v: v.texture[1], color: v.color }));
      for (const indices of [[0, 1, 2], [0, 2, 3]]) {
        const [a, b, c] = indices.map(i => vertices[i]);
        const area = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
        if (Math.abs(area) < 1e-6) continue;
        for (let y = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y))); y < Math.min(size, Math.ceil(Math.max(a.y, b.y, c.y))); y++) {
          for (let x = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x))); x < Math.min(size, Math.ceil(Math.max(a.x, b.x, c.x))); x++) {
            const wa = ((b.y - c.y) * (x + 0.5 - c.x) + (c.x - b.x) * (y + 0.5 - c.y)) / area;
            const wb = ((c.y - a.y) * (x + 0.5 - c.x) + (a.x - c.x) * (y + 0.5 - c.y)) / area, wc = 1 - wa - wb;
            if (Math.min(wa, wb, wc) < -1e-6) continue;
            const z = wa * a.z + wb * b.z + wc * c.z, pixel = y * size + x;
            if (z <= depths[pixel]) continue;
            const u = Math.max(0, Math.min(texture.width - 1, Math.floor((wa * a.u + wb * b.u + wc * c.u) * texture.width)));
            const v = Math.max(0, Math.min(texture.height - 1, Math.floor((wa * a.v + wb * b.v + wc * c.v) * texture.height)));
            const offset = (v * texture.width + u) * 4, alpha = texture.data[offset + 3] / 255;
            if (!alpha) continue;
            for (let channel = 0; channel < 3; channel++) pixels[pixel * 4 + channel] = texture.data[offset + channel] * a.color[channel] * shade * alpha + pixels[pixel * 4 + channel] * (1 - alpha);
            pixels[pixel * 4 + 3] = Math.max(pixels[pixel * 4 + 3], texture.data[offset + 3]);
            depths[pixel] = z;
          }
        }
      }
    }
    return pixels.some((value, index) => index % 4 === 3 && value)
      ? sharp(pixels, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer() : null;
  };
  return { getModel, render };
};

/** Render non-inventory block states that still appear as guide subjects. */
export async function renderGuideBlocks(zip, namespace, names, save) {
  const renderer = createModelRenderer(zip, namespace); let count = 0;
  for (const name of names) {
    const bytes = zip[`assets/${namespace}/blockstates/${name}.json`];
    if (!bytes) continue;
    const refs = blockStateModels(JSON.parse(new TextDecoder().decode(bytes)));
    const image = await renderer.render(refs.map(ref => ref.model));
    if (!image) continue;
    await save(name, image); count++;
  }
  return count;
}

/** Render source-authored inventory geometry without a browser or GPU dependency. */
export async function renderGuideModels(zip, namespace, save) {
  const models = new Map(), textures = [], textureIds = new Map();
  const getModel = id => {
    const key = String(id).replace(`${namespace}:`, "");
    if (models.has(key)) return models.get(key);
    const bytes = zip[`assets/${namespace}/models/${key}.json`];
    const model = bytes ? BlockModel.fromJson(JSON.parse(new TextDecoder().decode(bytes))) : null;
    models.set(key, model);
    model?.flatten({ getBlockModel: getModel });
    return model;
  };
  const atlas = { getTextureUV(id) {
    const key = String(id).replace(`${namespace}:`, "");
    if (!textureIds.has(key)) { textureIds.set(key, textures.length); textures.push({ key }); }
    const index = textureIds.get(key);
    return [index * 2, 0, index * 2 + 1, 1];
  } };
  let count = 0;
  for (const [path, bytes] of Object.entries(zip)) {
    if (!/\/items\/[^/]+\.json$/.test(path)) continue;
    const item = JSON.parse(new TextDecoder().decode(bytes)).model;
    if (!item?.model || typeof item.model !== "string") continue;
    const model = getModel(item.model);
    if (!model?.elements?.length || model.generationMarker) continue;
    const tint = index => {
      const value = item.tints?.[index]?.value ?? item.tints?.[index]?.default;
      return typeof value === "number" ? [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255] : [1, 1, 1];
    };
    const mesh = model.getMesh(atlas, Cull.none(), tint).transform(model.getDisplayTransform("gui"));
    for (const texture of textures) {
      if (texture.data) continue;
      const png = zip[`assets/${namespace}/textures/${texture.key}.png`];
      if (!png) throw new Error(`Missing model texture: ${texture.key}`);
      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      Object.assign(texture, { data, width: info.width, height: Math.min(info.width, info.height) });
    }
    const size = 64, pixels = Buffer.alloc(size * size * 4), depths = new Float64Array(size * size).fill(-Infinity);
    for (const quad of mesh.quads.sort((a, b) => a.v1.pos.z - b.v1.pos.z)) {
      const normal = quad.normal();
      if (normal.z <= 0) continue;
      const shade = model.guiLight === "front" ? 1 : Math.min(1, 0.65 + 0.2 * normal.y + 0.15 * Math.abs(normal.x) + 0.2 * normal.z);
      const textureIndex = Math.floor((quad.v1.texture[0] + quad.v2.texture[0] + quad.v3.texture[0] + quad.v4.texture[0]) / 8);
      const texture = textures[textureIndex];
      const vertices = quad.vertices().map(v => ({ x: v.pos.x * 4, y: (16 - v.pos.y) * 4, z: v.pos.z, u: v.texture[0] - textureIndex * 2, v: v.texture[1], color: v.color }));
      for (const indices of [[0, 1, 2], [0, 2, 3]]) {
        const [a, b, c] = indices.map(i => vertices[i]);
        const area = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
        if (Math.abs(area) < 1e-6) continue;
        for (let y = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y))); y < Math.min(size, Math.ceil(Math.max(a.y, b.y, c.y))); y++) {
          for (let x = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x))); x < Math.min(size, Math.ceil(Math.max(a.x, b.x, c.x))); x++) {
            const wa = ((b.y - c.y) * (x + 0.5 - c.x) + (c.x - b.x) * (y + 0.5 - c.y)) / area;
            const wb = ((c.y - a.y) * (x + 0.5 - c.x) + (a.x - c.x) * (y + 0.5 - c.y)) / area, wc = 1 - wa - wb;
            if (Math.min(wa, wb, wc) < -1e-6) continue;
            const z = wa * a.z + wb * b.z + wc * c.z, pixel = y * size + x;
            if (z <= depths[pixel]) continue;
            const u = Math.max(0, Math.min(texture.width - 1, Math.floor((wa * a.u + wb * b.u + wc * c.u) * texture.width)));
            const v = Math.max(0, Math.min(texture.height - 1, Math.floor((wa * a.v + wb * b.v + wc * c.v) * texture.height)));
            const offset = (v * texture.width + u) * 4, alpha = texture.data[offset + 3] / 255;
            if (!alpha) continue;
            for (let channel = 0; channel < 3; channel++) pixels[pixel * 4 + channel] = texture.data[offset + channel] * a.color[channel] * shade * alpha + pixels[pixel * 4 + channel] * (1 - alpha);
            pixels[pixel * 4 + 3] = Math.max(pixels[pixel * 4 + 3], texture.data[offset + 3]);
            depths[pixel] = z;
          }
        }
      }
    }
    if (!pixels.some((value, index) => index % 4 === 3 && value)) continue;
    await save(path.split("/items/")[1].slice(0, -5), await sharp(pixels, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer());
    count++;
  }
  return count;
}
