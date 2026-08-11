// Headless verification for M2-10 SELECT (delete after use).
// Pattern from .verify-guides.mjs: real mouse drags + window.__substrata rig.
// Needs `npm run dev` on :3000.
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

const vt = await page.evaluate(() => window.__substrata.vt());
const rect = await page.evaluate(() => {
  const r = document.querySelector("canvas.upper-canvas").getBoundingClientRect();
  return { left: r.left, top: r.top };
});
const toPage = (sx, sy) => ({ x: rect.left + sx * vt[0] + vt[4], y: rect.top + sy * vt[3] + vt[5] });
const check = (label, detail, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  [${detail}]`);
  if (!ok) failures++;
};
const sel = () => page.evaluate(() => window.__substrata.pixelSelection());
const layers = () => page.evaluate(() => window.__substrata.layers());
const sample = async (sx, sy) => {
  const p = toPage(sx, sy);
  return page.evaluate(([x, y]) => window.__substrata.samplePixel(x, y), [p.x - rect.left, p.y - rect.top]);
};
const near = (px, rgba, tol = 12) => !!px && rgba.every((v, i) => Math.abs(px[i] - v) <= tol);
const undo = async () => {
  await page.keyboard.down("Meta");
  await page.keyboard.press("z");
  await page.keyboard.up("Meta");
  await sleep(350);
};
const drag = async (x0, y0, x1, y1) => {
  const a = toPage(x0, y0);
  const b = toPage(x1, y1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await sleep(250);
};
const clickScene = async (sx, sy) => {
  const p = toPage(sx, sy);
  await page.mouse.click(p.x, p.y);
  await sleep(250);
};
// The popup renders only once the canvas has reported an anchor for THIS
// selection (selection-popup keys the anchor by epoch), so wait for it rather
// than assuming the frame already landed.
const popupReady = (action = "extract") =>
  page.waitForSelector(`[data-select-action="${action}"]`, { visible: true, timeout: 5000 });
const popupClick = async (action) => {
  await popupReady(action);
  await page.click(`[data-select-action="${action}"]`);
  await sleep(350);
};

// ── 1) marquee: select / clear / escape ──────────────────────────────────────
await page.evaluate(() => window.__substrata.setTool("select", "select"));
await drag(200, 200, 700, 600);
let s = await sel();
check("marquee: bounds match the drag", JSON.stringify(s?.bounds), s && Math.abs(s.bounds.x - 200) <= 3 && Math.abs(s.bounds.w - 500) <= 3 && Math.abs(s.bounds.h - 400) <= 3);
check("marquee: area = w×h", s?.area, s && Math.abs(s.area - 500 * 400) <= 2000);
await clickScene(1500, 1000);
s = await sel();
check("marquee: bare click clears", String(s), s === null);
await drag(200, 200, 700, 600);
await page.keyboard.press("Escape");
await sleep(200);
s = await sel();
check("marquee: Escape clears", String(s), s === null);

// ── 1b) gutter marquee: a drag entirely OUTSIDE the artboard selects nothing ─
// (regression: TypedArray.fill's negative end is length-relative — this used
// to select nearly the whole artboard)
await drag(-30, -5, -4, 12);
s = await sel();
check("marquee: gutter drag selects nothing", String(s), s === null);

// ── 2) invert / grow / shrink (store ops over the artboard domain) ──────────
await drag(200, 200, 700, 600);
const base = (await sel()).area;
await page.evaluate(() => window.__substrata.selectOps.invert());
s = await sel();
check("invert: area = artboard − rect", s?.area, s && Math.abs(s.area - (2000 * 1500 - base)) <= 4000);
await page.evaluate(() => window.__substrata.selectOps.invert());
await page.evaluate(() => window.__substrata.selectOps.grow());
s = await sel();
check("grow: area increases", s?.area, s && s.area > base);
await page.evaluate(() => window.__substrata.selectOps.shrink());
s = await sel();
check("grow→shrink: returns ≈ original", s?.area, s && Math.abs(s.area - base) <= base * 0.02);
await page.evaluate(() => window.__substrata.selectOps.deselect());

// ── 3) lasso: triangle ≈ half its bbox ───────────────────────────────────────
await page.evaluate(() => window.__substrata.setTool("select", "lasso"));
{
  // top-left quadrant — the empty-scene starter card (2026-07-08) floats over
  // the artboard centre and rightly catches pointerdowns aimed at its buttons
  const a = toPage(300, 300);
  const b = toPage(700, 300);
  const c = toPage(300, 700);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.move(c.x, c.y, { steps: 10 });
  await page.mouse.up();
  await sleep(300);
}
s = await sel();
check("lasso: triangle area ≈ ½ bbox", s?.area, s && Math.abs(s.area - (400 * 400) / 2) <= 400 * 400 * 0.06);
await page.keyboard.press("Escape");
await sleep(150);

// ── 4) wand: flood vs global on a two-square raster ──────────────────────────
// one raster layer, two disjoint 300×200 green squares (canvas 1000×800)
await page.evaluate(() =>
  window.__substrata.addRaster(
    1000,
    800,
    [
      { x: 0, y: 0, w: 300, h: 200, colour: "#3e6b33" },
      { x: 700, y: 600, w: 300, h: 200, colour: "#3e6b33" },
    ],
    { x: 1000, y: 750 },
  ),
);
await sleep(500);
let ls = await layers();
check("wand setup: raster imported", ls.length, ls.length === 1);
await page.evaluate((id) => window.__substrata.select([id]), ls[0].id);
await page.evaluate(() => window.__substrata.setTool("select", "wand"));
await sleep(150);
// raster is centred at (1000,750): its top-left square spans scene (500,350)+(300×200)
await clickScene(600, 400);
s = await sel();
check("wand flood: one square selected", s?.area, s && Math.abs(s.area - 300 * 200) <= 1500);
await page.evaluate(() => window.__substrata.toolSettings("select", { wandMode: "global" }));
await clickScene(600, 400);
s = await sel();
check("wand global: both squares selected", s?.area, s && Math.abs(s.area - 2 * 300 * 200) <= 3000);
await page.evaluate(() => window.__substrata.toolSettings("select", { wandMode: "flood" }));

// ── 4b) magnetic lasso: points snap onto the square's hard edge ──────────────
await page.evaluate(() => {
  window.__substrata.setTool("select", "lasso");
  window.__substrata.toolSettings("select", { magnetic: true, sensitivity: 100 });
});
{
  // trace a sloppy box ~10px OUTSIDE the top-left square (scene 500,350 → 800,550);
  // with a 20px snap radius the points should pull onto the edge
  const pts = [
    [490, 340],
    [810, 340],
    [810, 560],
    [490, 560],
  ].map(([x, y]) => toPage(x, y));
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 12 });
  await page.mouse.up();
  await sleep(300);
}
s = await sel();
check(
  "magnetic: bounds hug the square edges",
  JSON.stringify(s?.bounds),
  s &&
    Math.abs(s.bounds.x - 500) <= 4 &&
    Math.abs(s.bounds.y - 350) <= 4 &&
    Math.abs(s.bounds.x + s.bounds.w - 800) <= 4 &&
    Math.abs(s.bounds.y + s.bounds.h - 550) <= 4,
);
await page.evaluate(() => window.__substrata.toolSettings("select", { magnetic: false }));
await page.keyboard.press("Escape");
await sleep(150);

// ── 5) extract via the popup (default action) ─────────────────────────────────
await page.evaluate(() => window.__substrata.setTool("select", "select"));
await drag(550, 380, 750, 500); // inside the top-left green square
const popupVisible = await popupReady().then(
  (h) => !!h,
  () => false,
);
check("popup: appears with a live selection", String(popupVisible), popupVisible);
await popupClick("extract");
ls = await layers();
check("extract: new layer above the source", ls.map((l) => l.name).join(","), ls.length === 2);
const extracted = ls[1];
check("extract: lands where it was", JSON.stringify(extracted?.scene), extracted && Math.abs(extracted.scene.x - 650) <= 1.5 && Math.abs(extracted.scene.y - 440) <= 1.5);
await undo();
ls = await layers();
check("extract: ONE undo removes it", ls.length, ls.length === 1);

// ── 6) cut: hole + new layer, ONE undo restores both ─────────────────────────
await page.evaluate((id) => window.__substrata.select([id]), ls[0].id);
await drag(550, 380, 750, 500);
let before = await sample(650, 440);
check("cut setup: pixels are green", before?.join(","), near(before, [62, 107, 51, 255]));
await popupClick("cut");
ls = await layers();
check("cut: extracted layer added", ls.length, ls.length === 2);
// delete the extracted copy — the source's HOLE must show through (artboard white)
await page.evaluate((id) => window.__substrata.select([id]), ls[1].id);
await page.keyboard.press("Backspace");
await sleep(350);
let px = await sample(650, 440);
check("cut: hole punched in the source", px?.join(","), near(px, [255, 255, 255, 255]));
await undo(); // restore the deleted copy
await undo(); // revert the cut itself
ls = await layers();
px = await sample(650, 440);
check("cut: undo×2 restores source pixels", `${ls.length} ${px?.join(",")}`, ls.length === 1 && near(px, [62, 107, 51, 255]));

// ── 7) popup gates on raster; tool switch clears ─────────────────────────────
await page.evaluate(() => {
  window.__substrata.setTool("pieces", "primitives");
  window.__substrata.toolSettings("pieces", { shape: "rectangle", fill: "#cc2222" });
});
await drag(1300, 200, 1600, 400);
await page.evaluate(() => window.__substrata.setTool("select", "select"));
await drag(1350, 250, 1500, 350); // over the shape layer (it's now active)
await popupReady();
const disabled = await page.$eval('[data-select-action="extract"]', (el) => el.disabled);
check("gate: extract disabled on a shape layer", String(disabled), disabled === true);
await page.evaluate(() => window.__substrata.setTool("move"));
await sleep(200);
s = await sel();
check("lifecycle: leaving SELECT clears the mask", String(s), s === null);

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
