// M4 colour sinks
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
const toCanvas = (sx, sy) => ({ x: sx * vt[0] + vt[4], y: sy * vt[3] + vt[5] });
const toPage = (sx, sy) => {
  const p = toCanvas(sx, sy);
  return { x: rect.left + p.x, y: rect.top + p.y };
};
const sample = async (sx, sy) => {
  const p = toCanvas(sx, sy);
  return page.evaluate(([x, y]) => window.__substrata.samplePixel(x, y), [p.x, p.y]);
};
const near = (px, rgb, tol = 14) =>
  Math.abs(px[0] - rgb[0]) <= tol && Math.abs(px[1] - rgb[1]) <= tol && Math.abs(px[2] - rgb[2]) <= tol;
const check = (label, px, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  [${Array.isArray(px) ? px.join(",") : px}]`);
  if (!ok) failures++;
};
const layers = () => page.evaluate(() => window.__substrata.layers());
const undo = async () => {
  await page.keyboard.down("Meta");
  await page.keyboard.press("z");
  await page.keyboard.up("Meta");
  await sleep(300);
};
const drag = async (s0, s1) => {
  const a = toPage(s0.x, s0.y);
  const b = toPage(s1.x, s1.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await sleep(350);
};

// 1) rect stays selected
await page.evaluate(() => {
  window.__substrata.setTool("pieces", "primitives");
  window.__substrata.toolSettings("pieces", { shape: "rectangle", fill: "#3e6b33", stroke: null, cornerRadius: 0 });
});
await drag({ x: 600, y: 500 }, { x: 1000, y: 700 });
let px = await sample(800, 600);
check("baseline: rect drawn green", px, near(px, [62, 107, 51]));

// 2) pick recolours selected fill
await page.evaluate(() => window.__substrata.colour("#cc2200"));
await sleep(350);
px = await sample(800, 600);
check("sink: picked colour recolours the selected shape", px, near(px, [204, 34, 0]));

// 3) one undo restores fill
await undo();
px = await sample(800, 600);
check("sink: one undo restores previous fill", px, near(px, [62, 107, 51]));
let ls = await layers();
check("sink: the shape itself survives the undo", ls.length, ls.length === 1);

// 4) pick seeds next-draw fill
await page.evaluate(() => {
  window.__substrata.select([]);
  window.__substrata.setTool("pieces", "primitives"); // one-shot, reverted after draw 1
});
await sleep(150);
await drag({ x: 1100, y: 300 }, { x: 1400, y: 450 });
px = await sample(1250, 375);
check("sink: next draw uses the picked colour", px, near(px, [204, 34, 0]));

// 5) deselected: settings, no undo
await page.evaluate(() => window.__substrata.select([]));
await sleep(150);
await page.evaluate(() => window.__substrata.colour("#0044cc"));
await sleep(250);
px = await sample(800, 600);
check("sink: deselected shape untouched by a pick", px, near(px, [62, 107, 51]));
await undo();
ls = await layers();
check("sink: no phantom history entry from settings-only pick", ls.length, ls.length === 1);

// 6) freehand recolours via sink
await page.evaluate(() => {
  window.__substrata.setTool("pieces", "brush");
  window.__substrata.toolSettings("pieces", { brushSize: 36 });
});
await drag({ x: 500, y: 900 }, { x: 900, y: 900 }); // stays selected after commit
await page.evaluate(() => window.__substrata.colour("#7700aa"));
await sleep(350);
// sample avoids selection handles
px = await sample(620, 900);
check("sink: freehand stroke recolours", px, near(px, [119, 0, 170]));

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
