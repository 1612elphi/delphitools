// Headless verification for M3-15 rasterize (delete after use).
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

// ── 1) heart symbol → rasterize → pixel identity, kind flip, undo restores ───
await page.evaluate(() => {
  window.__substrata.setTool("pieces", "pieces");
  window.__substrata.toolSettings("pieces", { symbolId: "heart", fill: "#3e6b33" });
});
await drag(600, 300, 1000, 700);
let ls = await layers();
check("setup: heart is a shape layer", `${ls[0]?.kind} ${ls[0]?.name}`, ls.length === 1 && ls[0].kind === "shape");
const LOBE = [600 + (70 / 256) * 400, 300 + (110 / 256) * 400];
const NOTCH = [600 + (128 / 256) * 400, 300 + (45 / 256) * 400];
let before = await sample(...LOBE);

const ok = await page.evaluate((id) => window.__substrata.rasterize(id), ls[0].id);
await sleep(400);
ls = await layers();
check("rasterize: returns true, kind flips to raster", `${ok} ${ls[0]?.kind}`, ok === true && ls[0]?.kind === "raster");
check("rasterize: name survives", ls[0]?.name, ls[0]?.name === "Heart");
let px = await sample(...LOBE);
check("rasterize: lobe pixels identical", `${before?.join(",")} → ${px?.join(",")}`, near(px, before));
px = await sample(...NOTCH);
check("rasterize: notch alpha preserved (white shows)", px?.join(","), near(px, [255, 255, 255, 255]));
check("rasterize: centre unchanged", JSON.stringify(ls[0]?.scene), Math.abs(ls[0].scene.x - 800) < 2 && Math.abs(ls[0].scene.y - 500) < 2);

// filters now RENDER on it (they were raster-gated before)
await page.evaluate((id) => window.__substrata.fx(id, "invert"), ls[0].id);
await sleep(300);
px = await sample(...LOBE);
check("rasterize: invert filter moves pixels", px?.join(","), near(px, [255 - 62, 255 - 107, 255 - 51, 255]));
await undo(); // remove filter
await undo(); // revert rasterize
ls = await layers();
check("undo: vector layer restored", ls[0]?.kind, ls[0]?.kind === "shape");

// ── 2) freehand stroke rasterizes too ────────────────────────────────────────
await page.evaluate(() => {
  window.__substrata.setTool("pieces", "brush");
  window.__substrata.toolSettings("pieces", { fill: "#cc2222", brushSize: 36 });
});
await drag(400, 1000, 900, 1000);
ls = await layers();
const stroke = ls[ls.length - 1];
check("freehand: drawn", `${stroke?.kind} ${stroke?.name}`, stroke?.kind === "freehand");
await page.evaluate((id) => window.__substrata.rasterize(id), stroke.id);
await sleep(400);
ls = await layers();
px = await sample(650, 1000);
check("freehand: rasterized + pixels hold", `${ls[ls.length - 1]?.kind} ${px?.join(",")}`, ls[ls.length - 1]?.kind === "raster" && near(px, [204, 34, 34, 255]));

// ── 3) the context-menu path (right-click → Rasterize) ───────────────────────
await undo(); // back to freehand
ls = await layers();
await page.evaluate(() => window.__substrata.setTool("move")); // draw modes skip targeting
await sleep(150);
const p3 = toPage(650, 1000);
await page.mouse.click(p3.x, p3.y, { button: "right" });
await sleep(300);
const clicked = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll("button, [role=menuitem]"));
  const it = items.find((el) => el.textContent?.trim() === "Rasterize");
  if (!it) return false;
  it.click();
  return true;
});
await sleep(400);
ls = await layers();
check("menu: Rasterize item works", `${clicked} ${ls[ls.length - 1]?.kind}`, clicked && ls[ls.length - 1]?.kind === "raster");

// ── 4) raster layers can't re-rasterize ──────────────────────────────────────
const again = await page.evaluate((id) => window.__substrata.rasterize(id), ls[ls.length - 1].id);
check("gate: raster layer refuses", String(again), again === false);

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
