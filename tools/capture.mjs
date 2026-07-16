// Visual-gate harness — drives system Chromium on the real GPU, collects every
// console message + page error, and screenshots the experience at each stage
// (preloader → ENGAGE click → overture → flight). This is the conductor's eyes:
// run it after any look-affecting change, read the PNGs + the console dump.
//
//   node tools/capture.mjs <url> <outdir> [waitMsAfterEngage]
//
// Uses puppeteer-core against /usr/bin/chromium (Arch). Real wall-clock time
// (NOT --virtual-time-budget): WebGL/WebGPU shader compile + rAF need it.
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4174/';
const out = process.argv[3] ?? 'shots';
const flightWait = Number(process.argv[4] ?? 30000);
mkdirSync(out, { recursive: true });

const logs = [];
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=vulkan', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 12000)); // preloader compress + implode
await page.screenshot({ path: `${out}/1-preloader.png` });

// ENGAGE (silent — no audio context needed headless)
const engaged = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find((x) => /silent/i.test(x.textContent ?? '')) ?? btns[0];
  if (b) { b.click(); return b.textContent; }
  return null;
});
logs.push(`[harness] engage clicked: ${engaged}`);
await new Promise((r) => setTimeout(r, 8000)); // overture start
await page.screenshot({ path: `${out}/2-overture.png` });
await new Promise((r) => setTimeout(r, flightWait)); // overture → handover → flight
await page.screenshot({ path: `${out}/3-flight.png` });

writeFileSync(`${out}/console.log`, logs.join('\n') || '(no console output)');
await browser.close();
console.log(`captured → ${out}/{1-preloader,2-overture,3-flight}.png + console.log (${logs.length} lines)`);
