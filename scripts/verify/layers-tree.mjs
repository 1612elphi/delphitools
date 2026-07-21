// Headless verification for the Layers-tree pass: cross-parent moveLayer +
// effective (composed) group opacity. Ops-level — panel drag simulation
// through dnd-kit is brittle, so layer-ops are driven via window.__substrata.
// Rig pattern from .verify-select.mjs. Needs `npm run dev` on :3000.
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
const parents = async () => {
  const ls = await layers();
  return Object.fromEntries(ls.map((l) => [l.id, l.parent]));
};
const sample = async (sx, sy) => {
  const p = toPage(sx, sy);
  // settle first: reconcile paints on rAF, so a read straight after an op
  // races the render and samples the previous frame (flaked ~50%)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.evaluate(([x, y]) => window.__substrata.samplePixel(x, y), [p.x - rect.left, p.y - rect.top]);
};
const near = (px, rgba, tol = 8) => !!px && rgba.every((v, i) => Math.abs(px[i] - v) <= tol);
const undo = async () => {
  await page.keyboard.down("Meta");
  await page.keyboard.press("z");
  await page.keyboard.up("Meta");
  await sleep(350);
};
const drag = async (x0, y0, x1, y1) => {
  // every drag in this harness draws — re-arm per draw (shapes are one-shot
  // since 2026-07-11: a commit hands the tool back to MOVE)
  await page.evaluate(() => window.__substrata.setTool("pieces", "primitives"));
  const a = toPage(x0, y0);
  const b = toPage(x1, y1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await sleep(250);
};

// ── setup: three rects at the root (pieces drag-to-draw) ─────────────────────
await page.evaluate(() => {
  window.__substrata.setTool("pieces", "primitives");
  window.__substrata.toolSettings("pieces", { shape: "rectangle", fill: "#cc2222" });
});
await drag(100, 100, 300, 250);
await drag(350, 100, 550, 250);
await drag(600, 100, 800, 250);
let ls = await layers();
check("setup: three root rects", ls.map((l) => l.parent).join(","), ls.length === 3 && ls.every((l) => l.parent === null));
const [r1, r2, r3] = ls.map((l) => l.id);

// ── group two via the layer-ops path (the panel footer calls the same op) ────
const gid = await page.evaluate((ids) => window.__substrata.groupLayers(ids), [r1, r2]);
let p = await parents();
check("group: r1+r2 nest under the new group", `${p[r1]},${p[r2]},${p[r3]}`, !!gid && p[r1] === gid && p[r2] === gid && p[r3] === null);

// ── moveLayer INTO the group ─────────────────────────────────────────────────
await page.evaluate(([id, parent]) => window.__substrata.moveLayer(id, parent, 2), [r3, gid]);
p = await parents();
check("moveLayer: r3 moved INTO the group", p[r3], p[r3] === gid);

await undo();
p = await parents();
check("moveLayer in: ONE undo restores root", p[r3], p[r3] === null);

// ── moveLayer OUT to root (doc index 0 = bottom of the stack) ────────────────
await page.evaluate(([id, parent]) => window.__substrata.moveLayer(id, parent, 2), [r3, gid]); // re-nest
await page.evaluate((id) => window.__substrata.moveLayer(id, null, 0), r1);
p = await parents();
ls = await layers();
check("moveLayer: r1 moved OUT to root, bottom slot", `${p[r1]} first=${ls[0]?.id === r1}`, p[r1] === null && ls[0]?.id === r1);

await undo();
p = await parents();
check("moveLayer out: ONE undo re-nests", p[r1], p[r1] === gid);

// ── cycle guard: a group must never enter its own descendant ─────────────────
const g2 = await page.evaluate((ids) => window.__substrata.groupLayers(ids), [r1, r2]); // inner group inside gid
await page.evaluate(([id, parent]) => window.__substrata.moveLayer(id, parent, 0), [gid, g2]);
p = await parents();
check(
  "guard: group → own child no-ops",
  `${p[r1]},${p[r2]},${p[r3]} leaves=${Object.keys(p).length}`,
  p[r1] === g2 && p[r2] === g2 && p[r3] === gid && Object.keys(p).length === 3,
);

// ── effective group opacity: 0.5 × 0.5 composes to 0.25 over white ───────────
await page.evaluate(() => window.__substrata.toolSettings("pieces", { fill: "#000000" }));
await drag(1200, 900, 1600, 1200); // b1 — sampled at its centre (1400,1050)
await drag(200, 1200, 400, 1400); // b2 — a second member so the pair can group
ls = await layers();
const [b1, b2] = ls.slice(-2).map((l) => l.id);
const gOp = await page.evaluate((ids) => window.__substrata.groupLayers(ids), [b1, b2]);

await page.evaluate((id) => window.__substrata.setOpacity(id, 0.5), b1);
let px = await sample(1400, 1050);
check("opacity: child 0.5, group 1 → ≈ rgb(128)", px?.join(","), near(px, [128, 128, 128, 255]));

await page.evaluate((id) => window.__substrata.setOpacity(id, 0.5), gOp);
px = await sample(1400, 1050);
check("opacity: child 0.5 × group 0.5 → ≈ rgb(191)", px?.join(","), near(px, [191, 191, 191, 255]));

await undo();
px = await sample(1400, 1050);
check("opacity: ONE undo drops the group factor", px?.join(","), near(px, [128, 128, 128, 255]));

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
