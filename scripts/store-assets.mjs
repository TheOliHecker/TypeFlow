import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
await mkdir("release/store", { recursive: true });
for (const [width, height, name] of [
  [440, 280, "promo-440x280.png"],
  [1400, 560, "marquee-1400x560.png"],
]) {
  const scale = width / 440;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f1f5fc"/><g transform="scale(${scale})"><rect x="30" y="28" width="40" height="40" rx="10" fill="#2468df"/><g fill="white"><rect x="39" y="39" width="23" height="4" rx="2"/><rect x="39" y="47" width="17" height="4" rx="2"/><rect x="39" y="55" width="11" height="4" rx="2"/></g><text x="82" y="57" fill="#18242b" font-size="27" font-family="Arial" font-weight="bold">TypeFlow<tspan fill="#2468df">.</tspan></text><text x="30" y="119" fill="#18242b" font-family="Georgia" font-size="33">Your words.</text><text x="30" y="157" fill="#2468df" font-family="Georgia" font-size="33" font-style="italic">In motion.</text><text x="30" y="197" fill="#54677a" font-family="Arial" font-size="12">Google Docs · Draft evolution · Local recovery</text><path d="M290 132h100m-100 12h74m-74 12h48" stroke="#abc6f5" stroke-width="6" stroke-linecap="round"/></g></svg>`;
  await sharp(Buffer.from(svg))
    .removeAlpha()
    .png()
    .toFile(`release/store/${name}`);
}
console.log(
  "Store promotional assets generated. Screenshots come from the actual extension browser test.",
);
