// Headless verification for M7 — Remove Background bake + magic resize (delete after use).
// Pattern from .verify-select.mjs: window.__substrata rig + real drags.
// Needs `npm run dev` on :3000.
//
// The bg-removal checks use the rig's setMatte test seam (a synthetic matte)
// so NO model downloads happen headlessly — the ML pipeline itself (WebGPU
// fp16 / WASM fallback, matte quality) is Ruby's real-browser QA.
import puppeteer from "puppeteer-core";

const URL = process.env.EDITOR_URL ?? "http://localhost:3000/editor";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--window-size=1500,950"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1460, height: 900 });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto(URL, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.__substrata, { timeout: 20000 });
await sleep(400);

let vt = await page.evaluate(() => window.__substrata.vt());
const rect = await page.evaluate(() => {
  const r = document.querySelector("canvas.upper-canvas").getBoundingClientRect();
  return { left: r.left, top: r.top };
});
const check = (label, detail, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  [${detail}]`);
  if (!ok) failures++;
};
const layers = () => page.evaluate(() => window.__substrata.layers());
const refreshVt = async () => {
  vt = await page.evaluate(() => window.__substrata.vt());
};
const sample = async (sx, sy) =>
  page.evaluate(([x, y]) => window.__substrata.samplePixel(x, y), [sx * vt[0] + vt[4], sy * vt[3] + vt[5]]);
const near = (px, rgba, tol = 14) => !!px && rgba.every((v, i) => Math.abs(px[i] - v) <= tol);
const undo = async () => {
  await page.keyboard.down("Meta");
  await page.keyboard.press("z");
  await page.keyboard.up("Meta");
  await sleep(350);
};
const redo = async () => {
  await page.keyboard.down("Meta");
  await page.keyboard.down("Shift");
  await page.keyboard.press("z");
  await page.keyboard.up("Shift");
  await page.keyboard.up("Meta");
  await sleep(350);
};

// ── seed: a 400×300 raster, left half red / right half green, centred at (600, 400)
await page.evaluate(() =>
  window.__substrata.addRaster(
    400,
    300,
    [
      { x: 0, y: 0, w: 200, h: 300, colour: "#cc2200" },
      { x: 200, y: 0, w: 200, h: 300, colour: "#3e6b33" },
    ],
    { x: 600, y: 400 },
  ),
);
await sleep(600);
let ls = await layers();
const raster = ls.find((l) => l.kind === "raster");
check("seed: raster imported", JSON.stringify(raster?.scene), !!raster);

// ── REMOVE BACKGROUND (M7-1..5 wiring) ────────────────────────────────────────
// Matte FIRST (test seam), then the effect — so no model fetch ever kicks.
const matteSet = await page.evaluate(
  (id) => window.__substrata.setMatte(id, [{ x: 0, y: 0, w: 200, h: 300 }]),
  raster.id,
);
check("matte: test seam accepted", String(matteSet), matteSet === true);

await page.evaluate((id) => window.__substrata.effect(id, "remove-background"), raster.id);
await sleep(500);

// left half (opaque in matte) keeps red; right half (transparent) shows artboard white
let left = await sample(510, 400);
let right = await sample(690, 400);
check("cutout: matte-opaque half keeps pixels", `${left}`, near(left, [204, 34, 0, 255]));
check("cutout: matte-transparent half erased to artboard", `${right}`, near(right, [255, 255, 255, 255]));

const matteInfo = await page.evaluate((id) => window.__substrata.matte(id), raster.id);
check(
  "matte: status done, no model kicked",
  JSON.stringify(matteInfo?.status),
  matteInfo?.loaded === true && matteInfo?.status?.state === "done",
);

// undo removes the effect (one step) — original pixels restored, matte stays cached
await undo();
right = await sample(690, 400);
check("undo: effect off, right half back", `${right}`, near(right, [62, 107, 51, 255]));
const matteAfterUndo = await page.evaluate((id) => window.__substrata.matte(id), raster.id);
check("undo: matte cache untouched", String(matteAfterUndo?.loaded), matteAfterUndo?.loaded === true);

// redo re-applies instantly off the cache
await redo();
right = await sample(690, 400);
check("redo: cutout back from cache", `${right}`, near(right, [255, 255, 255, 255]));

// drop-shadow composes with the cutout (shadow of the cutout silhouette, not the full rect):
// with offset (60,0), blur 0: right of the REMAINING left half → shadow black;
// right of the original full rect → still artboard white.
await page.evaluate(
  (id) =>
    window.__substrata.effect(id, "drop-shadow", { colour: "#000000", opacity: 100, blur: 0, offsetX: 60, offsetY: 0, spread: 0 }),
  raster.id,
);
await sleep(500);
const shadowInCut = await sample(630, 400); // 30px right of the left half's edge (x=600)
const shadowFarRight = await sample(830, 400); // 30px right of the ORIGINAL right edge (x=800)
check("shadow: stamps cutout silhouette", `${shadowInCut}`, near(shadowInCut, [0, 0, 0, 255]));
check("shadow: no ghost of removed half", `${shadowFarRight}`, near(shadowFarRight, [255, 255, 255, 255]));
await undo(); // drop-shadow off
await undo(); // remove-background off — clean slate for magic resize

// ── MAGIC RESIZE (M7-8) — anchor + proportional ──────────────────────────────
// Three markers on the 2000×1500 artboard: left-anchored (600,400 → ax=0,ay=0.5? — 400>375
// so ay=0.5), centre (1000,750), right-bottom (1800,1300 → ax=1, ay=1).
await page.evaluate(() => {
  window.__substrata.setTool("pieces", "primitives");
  window.__substrata.toolSettings("pieces", { shape: "rectangle", fill: "#3e6b33", stroke: null, cornerRadius: 0 });
});
// centre marker via drag 900,650 → 1100,850 (centre 1000,750 = artboard centre)
{
  const a = { x: rect.left + 900 * vt[0] + vt[4], y: rect.top + 650 * vt[3] + vt[5] };
  const b = { x: rect.left + 1100 * vt[0] + vt[4], y: rect.top + 850 * vt[3] + vt[5] };
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await sleep(350);
}
// right-bottom marker via drag 1700,1200 → 1900,1400 (centre 1800,1300)
await page.evaluate(() => window.__substrata.setTool("pieces", "primitives")); // one-shot reverted after draw 1
{
  const a = { x: rect.left + 1700 * vt[0] + vt[4], y: rect.top + 1200 * vt[3] + vt[5] };
  const b = { x: rect.left + 1900 * vt[0] + vt[4], y: rect.top + 1400 * vt[3] + vt[5] };
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await sleep(350);
}
await page.keyboard.press("Escape");
await sleep(200);

ls = await layers();
const centreShape = ls.find((l) => l.kind === "shape" && Math.abs(l.scene.x - 1000) < 4 && Math.abs(l.scene.y - 750) < 4);
const cornerShape = ls.find((l) => l.kind === "shape" && Math.abs(l.scene.x - 1800) < 4 && Math.abs(l.scene.y - 1300) < 4);
check("seed: centre + corner markers placed", JSON.stringify(ls.map((l) => l.scene)), !!centreShape && !!cornerShape);

// 2000×1500 → 1000×750: s = 0.5
await page.evaluate(() => window.__substrata.resizeReflow(1000, 750));
await sleep(500);
await refreshVt(); // reflow path refits the viewport only via the modal; rig op doesn't — vt may still change on renders

ls = await layers();
const c2 = ls.find((l) => l.id === centreShape.id);
const k2 = ls.find((l) => l.id === cornerShape.id);
const r2 = ls.find((l) => l.id === raster.id);
// centre anchor (0.5): stays at new centre (500, 375)
check("reflow: centre marker stays centred", JSON.stringify(c2?.scene), !!c2 && Math.abs(c2.scene.x - 500) < 2 && Math.abs(c2.scene.y - 375) < 2);
// corner anchor (1,1): offset from (2000,1500) was (−200,−200) → ×0.5 → new (1000−100, 750−100)
check("reflow: corner marker re-anchors to corner", JSON.stringify(k2?.scene), !!k2 && Math.abs(k2.scene.x - 900) < 2 && Math.abs(k2.scene.y - 650) < 2);
// raster at (600,400): ax=0.5 (600 ∈ [500,1500]), ay=0.5 (400 ∈ [375,1125]) → (500+(600−1000)·0.5, 375+(400−750)·0.5) = (300, 200)
check("reflow: mid-zone layer proportional", JSON.stringify(r2?.scene), !!r2 && Math.abs(r2.scene.x - 300) < 2 && Math.abs(r2.scene.y - 200) < 2);

// one undo restores EVERYTHING (artboard + all transforms in one step)
await undo();
ls = await layers();
const c3 = ls.find((l) => l.id === centreShape.id);
const k3 = ls.find((l) => l.id === cornerShape.id);
check(
  "reflow: single undo restores all layers",
  JSON.stringify([c3?.scene, k3?.scene]),
  !!c3 && Math.abs(c3.scene.x - 1000) < 2 && Math.abs(c3.scene.y - 750) < 2 && !!k3 && Math.abs(k3.scene.x - 1800) < 2 && Math.abs(k3.scene.y - 1300) < 2,
);

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
