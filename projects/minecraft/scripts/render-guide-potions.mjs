import { execFileSync } from "node:child_process";
import sharp from "sharp";

export async function renderGuidePotions(zip, config, save) {
  const cache = `node_modules/.cache/guide-client-${config.java.version}.jar`;
  const disassemble = name => execFileSync("javap", ["-classpath", cache, "-c", "-p", name], { encoding: "utf8" }).split("static {};")[1];
  const fields = code => [...code.matchAll(/([\s\S]*?)putstatic[^\n]*\/\/ Field ([A-Z_]+):/g)];
  const colors = new Map(fields(disassemble(config.effectClass)).map(([, body, name]) => [name, Number(body.match(/\/\/ int (\d+)/)?.[1])]));
  const overlay = await sharp(zip[`assets/${config.namespace}/textures/${config.overlayTexture}.png`]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  for (const [, body, type] of fields(disassemble(config.potionClass))) {
    const effects = [...body.matchAll(/\/MobEffects\.([A-Z_]+):([^]*?)invokespecial[^\n]*MobEffectInstance/g)];
    const channels = [0, 0, 0]; let weights = 0;
    for (const [, name, operands] of effects) {
      const color = colors.get(name);
      if (!Number.isFinite(color)) throw new Error(`Missing effect color: ${name}`);
      const weight = 1 + Number(operands.match(/iconst_(\d)/)?.[1] ?? 0);
      [16, 8, 0].forEach((shift, i) => { channels[i] += (color >> shift & 255) * weight; }); weights += weight;
    }
    const rgb = weights ? channels.map(value => Math.floor(value / weights)) : [16, 8, 0].map(shift => config.baseColor >> shift & 255);
    const tinted = Buffer.from(overlay.data);
    for (let pixel = 0; pixel < tinted.length; pixel += 4) for (let channel = 0; channel < 3; channel++) tinted[pixel + channel] = tinted[pixel + channel] * rgb[channel] / 255;
    const liquid = await sharp(tinted, { raw: { width: overlay.info.width, height: overlay.info.height, channels: 4 } }).png().toBuffer();
    for (const container of config.containers) {
      const bottle = zip[`assets/${config.namespace}/textures/item/${container}.png`];
      const image = await sharp(liquid).composite([{ input: bottle }]).png().toBuffer();
      await save(`${container}/${type.toLowerCase()}`, image); count++;
    }
  }
  return count;
}
