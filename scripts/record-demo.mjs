import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const outputGif = resolve(projectRoot, "demo.gif");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const MARGIN = 16;
const FPS = 30;
const DPR = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function measureUI(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    colorScheme: "dark",
  });
  const page = await ctx.newPage();
  await page.goto(BASE_URL);
  await page.waitForFunction(() => {
    const panel = document.querySelector("div.transition-opacity");
    return panel && getComputedStyle(panel).opacity === "1";
  });
  await page.evaluate(() => document.fonts.ready);
  const rect = await page.evaluate(() => {
    const el = document.querySelector("div.transition-opacity");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height };
  });
  await ctx.close();
  return rect;
}

// Capture lossless PNG screenshots at the target FPS
function startCapture(page, frameDir) {
  let frame = 0;
  let stopped = false;
  const interval = 1000 / FPS;
  const captureStart = Date.now();
  const capture = async () => {
    while (!stopped) {
      const start = Date.now();
      const name = String(frame).padStart(5, "0");
      await page.screenshot({ path: join(frameDir, `${name}.png`) });
      frame++;
      const elapsed = Date.now() - start;
      if (!stopped && elapsed < interval) {
        await sleep(interval - elapsed);
      }
    }
  };
  const promise = capture();
  return {
    stop: async () => {
      stopped = true;
      await promise;
      const durationSecs = (Date.now() - captureStart) / 1000;
      const actualFps = frame / durationSecs;
      return { frame, actualFps };
    },
  };
}

async function main() {
  const browser = await chromium.launch();

  // First pass: measure the UI to determine tight viewport
  const uiSize = await measureUI(browser);
  if (!uiSize) {
    console.error("Could not measure UI.");
    await browser.close();
    process.exit(1);
  }

  // Viewport = UI content + equal margin on all sides (even dimensions)
  const vpWidth = Math.ceil((uiSize.width + MARGIN * 2) / 2) * 2;
  const vpHeight = Math.ceil((uiSize.height + MARGIN * 2) / 2) * 2;
  const outW = vpWidth * DPR;
  const outH = vpHeight * DPR;
  console.log(`Viewport: ${vpWidth}x${vpHeight}, Output: ${outW}x${outH} @ ${FPS}fps`);

  // Second pass: capture with the tight viewport at high DPI
  const context = await browser.newContext({
    viewport: { width: vpWidth, height: vpHeight },
    deviceScaleFactor: DPR,
    colorScheme: "dark",
  });

  const page = await context.newPage();
  await page.goto(BASE_URL);

  // Override page padding to match our margin for even spacing
  await page.evaluate((m) => {
    const container = document.querySelector(".min-h-screen");
    if (container) container.style.padding = `${m}px`;
  }, MARGIN);

  // Wait for hydration and fonts
  await page.waitForFunction(() => {
    const panel = document.querySelector("div.transition-opacity");
    return panel && getComputedStyle(panel).opacity === "1";
  });
  await page.evaluate(() => document.fonts.ready);
  await sleep(300);

  // Start capturing lossless frames
  const frameDir = mkdtempSync(join(tmpdir(), "demo-frames-"));
  const capture = startCapture(page, frameDir);

  // Brief pause so the viewer sees the UI before the first action
  await sleep(500);

  // Click the second language tab in the source (left) selector
  const languageRow = page.locator("div.flex.items-center.gap-3").first();
  const sourceSelector = languageRow.locator("> div.min-w-0.flex-1").first();
  const sourceTabs = sourceSelector.locator("button.rounded-2xl.text-\\[13px\\]");
  await sourceTabs.nth(1).click();
  await sleep(800);

  // Click the source textarea and type
  const textarea = page.locator("textarea");
  await textarea.click();
  await sleep(300);

  for (const char of "bonjour") {
    await textarea.press(char);
    await sleep(80 + Math.random() * 60);
  }

  // Wait for auto-translate debounce (500ms) + translation response
  await sleep(600);
  await page
    .locator(".grid > div:nth-child(2)")
    .locator("div.min-h-48")
    .filter({ hasNot: page.locator("span.text-zinc-300") })
    .filter({ hasNot: page.locator("span.text-zinc-400") })
    .waitFor({ state: "visible", timeout: 60000 });

  // Hold final frame briefly
  await sleep(500);

  const { frame: totalFrames, actualFps } = await capture.stop();
  await context.close();
  await browser.close();

  console.log(`Captured ${totalFrames} frames (${actualFps.toFixed(1)} actual fps)`);

  // Remove previous GIF to avoid stale output
  if (existsSync(outputGif)) rmSync(outputGif);

  // Assemble PNGs into GIF with optimized palette, using actual capture rate
  try {
    execSync(
      `ffmpeg -y -framerate ${actualFps.toFixed(2)} -i "${frameDir}/%05d.png" -vf "split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" "${outputGif}"`,
      { stdio: "inherit" }
    );
    console.log(`Saved: ${outputGif} (${outW}x${outH})`);
  } catch (err) {
    console.error("ffmpeg failed:", err.message);
  }

  // Clean up temp frames
  rmSync(frameDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
