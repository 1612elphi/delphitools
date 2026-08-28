// real rmbg-1.4 bake; complements m7.mjs which stubs the matte
// MECH = mechanics must pass; QUALITY = synthetic subject, informative
// needs npm run dev on :3000
import { tmpdir } from "node:os";
import puppeteer from "puppeteer-core";

const URL = process.env.EDITOR_URL ?? "http://localhost:3000/editor";
const PROFILE = `${tmpdir()}/substrata-matte-profile`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (label, detail, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  [${detail}]`);
  if (!ok) failures++;
};

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  userDataDir: PROFILE, // persists the model in the HTTP cache across runs
  args: ["--window-size=1500,950"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1460, height: 900 });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
await page.goto(URL, { waitUntil: "networkidle0" });
if (process.env.FORCE_WASM) {
  // qa escape hatch, bg-removal.ts reads it at pipeline creation
  await page.evaluate(() => localStorage.setItem("substrata:forceWasm", "1"));
  await page.reload({ waitUntil: "networkidle0" });
  console.log("… forceWasm set — exercising the WASM fallback path");
}
await page.waitForFunction(() => window.__substrata, { timeout: 20000 });
await sleep(400);

let vt = await page.evaluate(() => window.__substrata.vt());
const sample = async (sx, sy) =>
  page.evaluate(([x, y]) => window.__substrata.samplePixel(x, y), [sx * vt[0] + vt[4], sy * vt[3] + vt[5]]);
const near = (px, rgba, tol = 18) => !!px && rgba.every((v, i) => Math.abs(px[i] - v) <= tol);

// seed: 512×384 ground + dark blob, centred at (600,400)
await page.evaluate(() =>
  window.__substrata.addRaster(
    512,
    384,
    [
      { x: 0, y: 0, w: 512, h: 384, colour: "#e7e2d6" },
      { x: 196, y: 88, w: 120, h: 30, colour: "#2b2620" },
      { x: 176, y: 118, w: 160, h: 150, colour: "#2b2620" },
      { x: 196, y: 268, w: 120, h: 28, colour: "#2b2620" },
    ],
    { x: 600, y: 400 },
  ),
);
await sleep(700);
const raster = await page.evaluate(() => window.__substrata.layers().find((l) => l.kind === "raster"));
check("MECH seed: raster imported", JSON.stringify(raster?.scene ?? null), !!raster);

// ground truth: layer is 512×384 centred at (600,400) → scene x∈[344,856], y∈[208,592]
const preGround = await sample(380, 400);
const preSubject = await sample(600, 400);
check("MECH pre: ground pixel is the light beige", `[${preGround}]`, near(preGround, [231, 226, 214]));
check("MECH pre: subject pixel is dark", `[${preSubject}]`, near(preSubject, [43, 38, 32]));

// add effect → auto-bake (ensureMatte → hub download → pipeline)
await page.evaluate((id) => window.__substrata.effect(id, "remove-background"), raster.id);

console.log("… baking (real model; first run downloads ~44 MB)");
const t0 = Date.now();
let last = "";
let st = null;
while (Date.now() - t0 < 10 * 60 * 1000) {
  st = await page.evaluate((id) => window.__substrata.matte(id), raster.id);
  const line = JSON.stringify(st);
  if (line !== last) {
    console.log(`   ${Math.round((Date.now() - t0) / 1000)}s  ${line}`);
    last = line;
  }
  if (st?.status?.state === "done" || st?.status?.state === "error") break;
  await sleep(2000);
}
const secs = Math.round((Date.now() - t0) / 1000);
check("MECH bake: reached done", `${secs}s, ${JSON.stringify(st)}`, st?.status?.state === "done");
check("MECH bake: matte loaded", String(st?.loaded), st?.loaded === true);
check("MECH bake: device reported", st?.status?.device ?? "none", !!st?.status?.device);
await sleep(1200); // matteepoch recomposite

// composite pixel checks
await page.evaluate(() => window.__substrata.vt()).then((v) => (vt = v));
const postGround = await sample(380, 400);
const postSubject = await sample(600, 400);
// artboard bg is white; removed ground shows white or checker if transparent bg
const groundRemoved = !near(postGround, [231, 226, 214]);
check("QUALITY post: ground removed (pixel changed off beige)", `[${postGround}]`, groundRemoved);
check("QUALITY post: subject survives (still dark)", `[${postSubject}]`, near(postSubject, [43, 38, 32], 40));

check("MECH page: zero pageerrors end-to-end", pageErrors.join(" | ") || "none", pageErrors.length === 0);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
await browser.close();
process.exit(failures ? 1 : 0);
