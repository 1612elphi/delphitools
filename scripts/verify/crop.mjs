// Headless verification for MOVE·Crop (non-destructive layer crop).
// Needs `npm run dev` on :3000. Untracked QA harness (delete after use).
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
const layers = () => page.evaluate(() => window.__substrata.layers());
const sample = async (sx, sy) => {
  const p = toPage(sx, sy);
  return page.evaluate(([x, y]) => window.__substrata.samplePixel(x, y), [p.x - rect.left, p.y - rect.top]);
};
const sampleTop = async (sx, sy) => {
  const p = toPage(sx, sy);
  return page.evaluate(([x, y]) => window.__substrata.sampleTop(x, y), [p.x - rect.left, p.y - rect.top]);
};
const near = (px, rgba, tol = 12) => !!px && rgba.every((v, i) => Math.abs(px[i] - v) <= tol);
const cropNear = (c, exp, tol = 2) =>
  !!c && ["x", "y", "w", "h"].every((k) => Math.abs(c[k] - exp[k]) <= tol);
const undo = async () => {
  await page.keyboard.down("Meta");
  await page.keyboard.press("z");
  await page.keyboard.up("Meta");
  await sleep(300);
};
const drag = async (x0, y0, x1, y1) => {
  const a = toPage(x0, y0);
  const b = toPage(x1, y1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await sleep(300);
};

const GREEN = [62, 107, 51, 255]; // #3e6b33
const WHITE = [255, 255, 255, 255];

// ── setup: a 400×300 rect shape at a known spot (centre 800,450) ─────────────
await page.evaluate(() => {
  window.__substrata.setTool("pieces", "primitives");
  window.__substrata.toolSettings("pieces", { shape: "rectangle", fill: "#3e6b33", stroke: null });
});
await drag(600, 300, 1000, 600);
let ls = await layers();
check("setup: rect shape drawn", `${ls[0]?.kind} crop=${JSON.stringify(ls[0]?.crop)}`, ls.length === 1 && ls[0].kind === "shape" && ls[0].crop === null);
const id = ls[0].id;

// ── 1) drag the LEFT edge handle inward 100 scene px ─────────────────────────
await page.evaluate((lid) => {
  window.__substrata.setTool("move", "crop");
  window.__substrata.select([lid]);
}, id);
await sleep(300);
// left edge midpoint of the (default full-dims) crop rect = scene (600, 450)
await drag(600, 450, 700, 450);
ls = await layers();
check("crop drag: left edge → crop {x:100,y:0,w:300,h:300}", JSON.stringify(ls[0]?.crop), cropNear(ls[0]?.crop, { x: 100, y: 0, w: 300, h: 300 }));
let px = await sample(650, 450);
check("crop drag: cropped-away strip shows artboard white", px?.join(","), near(px, WHITE));
px = await sample(850, 450);
check("crop drag: surviving region keeps the fill", px?.join(","), near(px, GREEN));
// overlay chrome: the dimmed veil covers the cropped-away strip (top context)
px = await sampleTop(650, 450);
check("overlay: veil drawn over the cropped-away strip", px?.join(","), !!px && px[3] > 40 && px[0] < 40);

// ── 2) ONE undo restores crop null (pixels back) ─────────────────────────────
await undo();
ls = await layers();
px = await sample(650, 450);
check("undo: one step restores crop null + pixels", `crop=${JSON.stringify(ls[0]?.crop)} px=${px?.join(",")}`, ls[0]?.crop === null && near(px, GREEN));

// ── 3) setCrop via the rig round-trips ───────────────────────────────────────
await page.evaluate((lid) => window.__substrata.setCrop(lid, { x: 50, y: 50, w: 200, h: 100 }), id);
await sleep(200);
ls = await layers();
check("rig: setCrop round-trips", JSON.stringify(ls[0]?.crop), cropNear(ls[0]?.crop, { x: 50, y: 50, w: 200, h: 100 }, 0));
await page.evaluate((lid) => window.__substrata.setCrop(lid, null), id);
await sleep(200);
ls = await layers();
px = await sample(650, 450);
check("rig: setCrop(null) clears", `crop=${JSON.stringify(ls[0]?.crop)} px=${px?.join(",")}`, ls[0]?.crop === null && near(px, GREEN));

// ── 4) crop persists across a MOVE of the layer ──────────────────────────────
await page.evaluate((lid) => {
  window.__substrata.setCrop(lid, { x: 100, y: 0, w: 300, h: 300 });
  window.__substrata.setTool("move", "move");
}, id);
await sleep(300);
await drag(850, 450, 1050, 450); // centre 800 → 1000 (snaps onto the artboard centreline)
ls = await layers();
check("move: crop survives the drag", `crop=${JSON.stringify(ls[0]?.crop)} scene=${JSON.stringify(ls[0]?.scene)}`, cropNear(ls[0]?.crop, { x: 100, y: 0, w: 300, h: 300 }, 0) && Math.abs(ls[0]?.scene.x - 1000) < 3);
// content now spans 800..1200; crop keeps 900..1200 visible
px = await sample(850, 450);
const pxIn = await sample(950, 450);
check("move: pixels stay cropped at the new spot", `strip=${px?.join(",")} kept=${pxIn?.join(",")}`, near(px, WHITE) && near(pxIn, GREEN));

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
