// Generates the favicon and PWA app icons (192 px, 512 px) from the logo paths.
// Run: npm run icons
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const src = readFileSync(new URL("../src/components/brand/logo.tsx", import.meta.url), "utf8");
const sPath = src.match(/LOGO_S_PATH = "([^"]+)"/)[1];
const spark = src.match(/LOGO_SPARK_PATH =\s*"([^"]+)"/)[1];

const svg = (radius) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${radius}" fill="#4F46E5"/>
  <path d="${sPath}" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${spark}" fill="#FBBF24"/>
</svg>`;

mkdirSync(new URL("../public/icons/", import.meta.url), { recursive: true });
writeFileSync(new URL("../src/app/icon.svg", import.meta.url), svg(16));

// App icons are full-bleed squares; the OS applies its own rounding (maskable).
for (const size of [192, 512]) {
  await sharp(Buffer.from(svg(0)))
    .resize(size, size)
    .png()
    .toFile(new URL(`../public/icons/icon-${size}.png`, import.meta.url).pathname);
}
await sharp(Buffer.from(svg(0))).resize(180, 180).png().toFile(new URL("../src/app/apple-icon.png", import.meta.url).pathname);
console.log("Icons written.");
