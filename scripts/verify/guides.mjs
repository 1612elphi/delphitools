// Headless verification for the rulers + drag-out guides pass (delete after use).
// Pattern from .verify-export.mjs: real mouse drags + window.__substrata rig.
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
const guides = () => page.evaluate(() => window.__substrata.guides());
const layers = () => page.evaluate(() => window.__substrata.layers());
const sampleTop = (x, y) => page.evaluate(([a, b]) => window.__substrata.sampleTop(a, b), [x, y]);
const undo = async () => {
  await page.keyboard.down("Meta");
  await page.keyboard.press("z");
  await page.keyboard.up("Meta");
  await sleep(300);
};
const dragMouse = async (x0, y0, x1, y1) => {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 8 });
  await page.mouse.up();
  await sleep(300);
};

// ── 1) rulers render on the top context ──────────────────────────────────────
let px = await sampleTop(400, 10); // inside the top band, away from corner/labels
check("rulers: top band paints opaque", px?.join(","), px?.[3] === 255);
px = await sampleTop(10, 400);
check("rulers: left band paints opaque", px?.join(","), px?.[3] === 255);
px = await sampleTop(400, 300); // canvas interior — overlay should be clear
check("rulers: interior overlay stays clear", px?.join(","), px?.[3] === 0);

// ── 2) drag out a VERTICAL guide from the left ruler ────────────────────────
const target = toPage(600, 700);
await dragMouse(rect.left + 10, target.y, target.x, target.y);
let gs = await guides();
check("drag-out: one vertical guide", JSON.stringify(gs), gs.length === 1 && gs[0].axis === "x");
check("drag-out: lands at scene x≈600", gs[0]?.pos, Math.abs(gs[0]?.pos - 600) <= 1);
px = await sampleTop(toPage(600, 700).x - rect.left, 500);
check("drag-out: guide line drawn on overlay", px?.join(","), px?.[3] > 0);

// one undo removes the guide
await undo();
gs = await guides();
check("drag-out: ONE undo removes it", gs.length, gs.length === 0);
await page.evaluate(() => {
  // redo via ⌘⇧Z path is exercised elsewhere; re-add for the next checks
});

// ── 3) drag out a HORIZONTAL guide from the top ruler ───────────────────────
const t2 = toPage(900, 500);
await dragMouse(t2.x, rect.top + 10, t2.x, t2.y);
gs = await guides();
check("drag-out: horizontal guide at y≈500", JSON.stringify(gs), gs.length === 1 && gs[0].axis === "y" && Math.abs(gs[0].pos - 500) <= 1);

// ── 4) corner drag creates nothing ───────────────────────────────────────────
await dragMouse(rect.left + 8, rect.top + 8, target.x, target.y);
gs = await guides();
check("corner: no guide from the corner box", gs.length, gs.length === 1);

// ── 5) move an existing guide (MOVE tool), ONE undo restores ─────────────────
await page.evaluate(() => window.__substrata.setTool("move"));
const yGuide = gs[0];
const from = toPage(700, yGuide.pos);
const to = toPage(700, 800);
await dragMouse(from.x, from.y, to.x, to.y);
gs = await guides();
check("move: guide dragged to y≈800", gs[0]?.pos, gs.length === 1 && Math.abs(gs[0].pos - 800) <= 1);
await undo();
gs = await guides();
check("move: ONE undo restores y≈500", gs[0]?.pos, gs.length === 1 && Math.abs(gs[0].pos - 500) <= 1);

// ── 6) drag back onto the ruler deletes; undo restores ──────────────────────
const g5 = toPage(700, gs[0].pos);
await dragMouse(g5.x, g5.y, g5.x, rect.top + 8);
gs = await guides();
check("delete: dropped on ruler removes guide", gs.length, gs.length === 0);
await undo();
gs = await guides();
check("delete: undo restores it", JSON.stringify(gs), gs.length === 1 && gs[0].axis === "y");

// ── 7) layers snap to guides ──────────────────────────────────────────────────
// vertical guide at x=600 again, then drag a rect so its left edge lands near it
const t7 = toPage(600, 700);
await dragMouse(rect.left + 10, t7.y, t7.x, t7.y);
await page.evaluate(() => {
  window.__substrata.setTool("pieces", "primitives");
  window.__substrata.toolSettings("pieces", { shape: "rectangle", fill: "#3e6b33" });
});
const a = toPage(900, 300);
const b = toPage(1100, 500);
await dragMouse(a.x, a.y, b.x, b.y);
await page.evaluate(() => window.__substrata.setTool("move"));
await sleep(150);
// drag the rect's centre so its LEFT edge (centre - 100) sits ~3px past the guide
const c1 = toPage(1000, 400);
const c2 = toPage(600 + 100 + 3 / vt[0], 400); // left edge lands 3 screen px off x=600
await dragMouse(c1.x, c1.y, c2.x, c2.y);
const ls = await layers();
const rectLayer = ls[ls.length - 1];
const leftEdge = rectLayer.scene.x - 100;
check("snap: rect left edge snapped to guide x=600", leftEdge.toFixed(2), Math.abs(leftEdge - 600) < 0.5);

// ── 8) draw tools don't fire from the ruler band (capture claim) ─────────────
await page.evaluate(() => window.__substrata.setTool("pieces", "primitives"));
const before = (await layers()).length;
const t8 = toPage(300, 900);
await dragMouse(rect.left + 10, t8.y, t8.x, t8.y);
const after8 = await layers();
gs = await guides();
check("claim: ruler drag in a draw tool adds a guide, not a shape", `layers ${after8.length} guides ${gs.length}`, after8.length === before && gs.length === 3);

// ── 8b) gap-pills render mid-drag (red distance pill between neighbours) ─────
{
  const startY = toPage(0, 400).y;
  const end = toPage(1000, 400);
  await page.mouse.move(rect.left + 10, startY);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await sleep(200);
  // dragging at x=1000 with a guide at x=600 → pill at scene midpoint 800
  const midX = toPage(800, 0).x - rect.left;
  const pillPx = await sampleTop(midX, end.y - rect.top);
  check("gap-pill: renders mid-drag, red-dominant", pillPx?.join(","), pillPx?.[3] > 0 && pillPx?.[0] > pillPx?.[2]);
  await page.mouse.up();
  await sleep(250);
}

// ── 9) prefs: guides visibility off hides + unsnaps; rulers off kills drag-out ─
await page.evaluate(() => window.__substrata.toggleGuidePref("guides"));
await sleep(200);
px = await sampleTop(toPage(600, 700).x - rect.left, 500);
check("pref: guides off → line not drawn", px?.join(","), px?.[3] === 0);
await page.evaluate(() => window.__substrata.toggleGuidePref("guides"));
await page.evaluate(() => window.__substrata.toggleGuidePref("rulers"));
await sleep(200);
px = await sampleTop(400, 10);
check("pref: rulers off → band not painted", px?.join(","), px?.[3] === 0);
const beforeG = (await guides()).length;
await dragMouse(rect.left + 10, t8.y, t8.x - 50, t8.y);
gs = await guides();
check("pref: rulers off → no drag-out", gs.length, gs.length === beforeG);
await page.evaluate(() => window.__substrata.toggleGuidePref("rulers"));

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
