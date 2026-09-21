import { chromium } from "playwright-core";
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const outDir = path.join(root, "public/module-images");
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["calendar", "crm", "finance", "dispute"];
const W = 1400, H = 933;

// Render at 2x for crisp downsample, then add a bloom pass (blurred copy screened back on top)
// so glowing reds bleed into their surroundings the way a rendered scene does.
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await page.goto("file://" + path.join(here, "module-art.html"), { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
for (const id of ids) {
  const png = await page.locator(`#${id}`).screenshot({ type: "png" });
  const base = sharp(png).resize(W, H, { kernel: "lanczos3" });
  const basePng = await base.clone().png().toBuffer();
  // Keep only bright highlights (mostly the neon reds/whites), then blur them for the bloom layers.
  const highlights = await sharp(basePng).linear(2.6, -300).png().toBuffer();
  const wide = await sharp(highlights).blur(26).linear(0.55, 0).png().toBuffer();
  const tight = await sharp(highlights).blur(5).linear(0.7, 0).png().toBuffer();
  const vignette = Buffer.from(`<svg width="${W}" height="${H}"><defs><radialGradient id="v" cx="50%" cy="50%" r="70%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".55"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#v)"/></svg>`);
  const out = path.join(outDir, `cyncro-${id}.webp`);
  await sharp(basePng)
    .composite([
      { input: wide, blend: "screen" },
      { input: tight, blend: "screen" },
      { input: vignette, blend: "over" },
    ])
    .webp({ quality: 86 })
    .toFile(out);
  const meta = await sharp(out).metadata();
  console.log(id, meta.width, meta.height);
}
await browser.close();
