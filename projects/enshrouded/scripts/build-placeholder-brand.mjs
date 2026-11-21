import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const brand = path.resolve(import.meta.dirname, "..", "brand");
await mkdir(brand, { recursive: true });

const icon = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#1a3933"/><stop offset="1" stop-color="#0a1518"/></linearGradient></defs>
  <rect width="512" height="512" rx="92" fill="url(#bg)"/>
  <path d="M68 174c94-70 190-33 284-110M47 278c107-74 203-28 348-117M68 383c113-73 225-39 380-130" fill="none" stroke="#50766a" stroke-width="16" opacity=".55"/>
  <path d="M256 124c-75 0-136 61-136 136 0 96 136 191 136 191s136-95 136-191c0-75-61-136-136-136z" fill="#d9b868" stroke="#f4d992" stroke-width="9"/>
  <circle cx="256" cy="257" r="51" fill="#18312d"/>
</svg>`);
const backdrop = (width, height) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#17352f"/><stop offset=".55" stop-color="#102523"/><stop offset="1" stop-color="#0a1518"/></linearGradient></defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <g fill="none" stroke="#497367" stroke-width="7" opacity=".27">
    <path d="M-100 170C300-40 510 460 930 170S1600 80 ${width + 100} 250"/>
    <path d="M-100 280C300 70 510 570 930 280S1600 190 ${width + 100} 360"/>
    <path d="M-100 390C300 180 510 680 930 390S1600 300 ${width + 100} 470"/>
  </g>
</svg>`);

await sharp(icon).png().toFile(path.join(brand, "icon-master.png"));
await sharp(icon).png().toFile(path.join(brand, "appstore-icon-master.png"));
await sharp(backdrop(1920, 560)).png().toFile(path.join(brand, "hero-source-v1.png"));
await sharp(backdrop(1032, 792)).png().toFile(path.join(brand, "store-tile-artwork.png"));
console.log("Created neutral Enshrouded Companion brand inputs.");
