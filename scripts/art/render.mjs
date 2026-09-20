import { chromium } from "playwright-core";
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const outDir = path.join(root, "public/module-images");
const ids = ["calendar", "crm", "finance", "dispute"];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 933 }, deviceScaleFactor: 1 });
await page.goto("file://" + path.join(here, "module-art.html"), { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);
for (const id of ids) {
  const png = await page.locator(`#${id}`).screenshot({ type: "png" });
  const out = path.join(outDir, `cyncro-${id}.webp`);
  await sharp(png).webp({ quality: 84 }).toFile(out);
  const meta = await sharp(out).metadata();
  console.log(id, meta.width, meta.height, meta.size ?? "");
}
await browser.close();
