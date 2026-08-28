// real mouse events, not rig
import puppeteer from "puppeteer-core";

const URL = process.env.EDITOR_URL ?? "http://localhost:3000/editor";
const OUT = process.env.OUT ?? "/tmp";
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
// pin inspector for screenshot
await page.evaluateOnNewDocument(() => {
  localStorage.setItem("substrata:layout:pinned", JSON.stringify(["inspector"]));
});
await page.goto(URL, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.__substrata, { timeout: 20000 });
await sleep(400);

const vt = await page.evaluate(() => window.__substrata.vt());
const rect = await page.evaluate(() => {
  const r = document.querySelector("canvas.upper-canvas").getBoundingClientRect();
  return { left: r.left, top: r.top };
});
// scene→page, scene→canvas
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

const setTool = (tool, sub) => page.evaluate(([t, s]) => window.__substrata.setTool(t, s), [tool, sub]);
// one-shot, commit reverts tool
const pieces = async (patch) => {
  await setTool("pieces", "primitives");
  await page.evaluate((p) => window.__substrata.toolSettings("pieces", p), patch);
};
const layers = () => page.evaluate(() => window.__substrata.layers());
const drag = async (s0, s1, { shift = false, steps = 10 } = {}) => {
  const a = toPage(s0.x, s0.y);
  const b = toPage(s1.x, s1.y);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
  await sleep(200);
  // the fresh shape auto-selects — drop the selection so its handles/border
  // (drawn on the lower canvas at rest) can't sit under a sampled pixel
  await page.evaluate(() => window.__substrata.select([]));
  await sleep(150);
};
const undo = async () => {
  await page.keyboard.down("Meta");
  await page.keyboard.press("z");
  await page.keyboard.up("Meta");
  await sleep(300);
};

await setTool("pieces", "primitives");
const WHITE = [255, 255, 255];

await pieces({ shape: "rectangle", fill: "#ff0000", stroke: null, cornerRadius: 0 });
await drag({ x: 600, y: 500 }, { x: 1000, y: 700 });
let ls = await layers();
check("rect: one layer, named Rectangle", ls.map((l) => l.name).join(","), ls.length === 1 && ls[0].name === "Rectangle");
// tolerance: 1/zoom scene units
check("rect: centred at drag midpoint", JSON.stringify(ls[0]?.scene), ls[0] && Math.abs(ls[0].scene.x - 800) < 3 && Math.abs(ls[0].scene.y - 600) < 3);
let px = await sample(800, 600);
check("rect: fill at centre", px, near(px, [255, 0, 0]));
px = await sample(610, 510);
check("rect: sharp corner filled", px, near(px, [255, 0, 0]));
px = await sample(1030, 600);
check("rect: outside clean", px, near(px, WHITE));
await undo();
ls = await layers();
check("rect: ONE undo removes the whole draw", ls.length, ls.length === 0);

await setTool("pieces", "primitives");
await drag({ x: 600, y: 500 }, { x: 700, y: 650 }, { shift: true });
px = await sample(740, 640); // inside square, outside rect
check("rect+shift: square (start-anchored)", px, near(px, [255, 0, 0]));
await undo();

await pieces({ cornerRadius: 80 });
await drag({ x: 600, y: 500 }, { x: 1000, y: 700 });
px = await sample(610, 510);
check("rect: corner radius rounds the corner", px, near(px, WHITE));
px = await sample(800, 600);
check("rect: rounded still filled at centre", px, near(px, [255, 0, 0]));
await undo();
await pieces({ cornerRadius: 0 });

await pieces({ shape: "ellipse", fill: "#0000ff" });
await drag({ x: 600, y: 500 }, { x: 1000, y: 700 });
ls = await layers();
check("ellipse: layer named Ellipse", ls[0]?.name, ls[0]?.name === "Ellipse");
px = await sample(800, 600);
check("ellipse: fill at centre", px, near(px, [0, 0, 255]));
px = await sample(615, 512);
check("ellipse: bbox corner empty", px, near(px, WHITE));
await undo();

await pieces({ shape: "line", fill: "#ff0000", stroke: { colour: "#00aa00", width: 12 } });
await drag({ x: 600, y: 500 }, { x: 1000, y: 500 });
ls = await layers();
check("line: layer named Line", ls[0]?.name, ls[0]?.name === "Line");
px = await sample(800, 500);
check("line: stroke on the line", px, near(px, [0, 170, 0]));
px = await sample(800, 540);
check("line: clean off the line", px, near(px, WHITE));
await undo();
await setTool("pieces", "primitives");
await drag({ x: 600, y: 500 }, { x: 990, y: 560 }, { shift: true }); // ~9° snaps flat
px = await sample(950, 500);
check("line+shift: snapped horizontal", px, near(px, [0, 170, 0]));
await undo();

await pieces({ shape: "polygon", fill: "#e8b13c", stroke: null, sides: 6 });
await drag({ x: 800, y: 600 }, { x: 800, y: 500 }); // radius 100, vertex up
ls = await layers();
check("polygon: layer named Polygon", ls[0]?.name, ls[0]?.name === "Polygon");
px = await sample(800, 600);
check("polygon: fill at centre (drag start)", px, near(px, [232, 177, 60]));
px = await sample(800, 520);
check("polygon: top vertex region filled", px, near(px, [232, 177, 60]));
px = await sample(915, 600);
check("polygon: outside circumradius clean", px, near(px, WHITE));
await undo();

await pieces({ shape: "star", fill: "#cc00cc", starPoints: 5, starInnerRatio: 0.5 });
await drag({ x: 800, y: 600 }, { x: 800, y: 500 });
ls = await layers();
check("star: layer named Star", ls[0]?.name, ls[0]?.name === "Star");
px = await sample(800, 530);
check("star: top arm filled", px, near(px, [204, 0, 204]));
px = await sample(800, 675);
check("star: gap under centre empty (points-up)", px, near(px, WHITE));
px = await sample(800, 600);
check("star: centre filled", px, near(px, [204, 0, 204]));

await setTool("move");
const starId = (await layers())[0].id;
await page.evaluate((id) => window.__substrata.select([id]), starId);
await sleep(200);
// zoom sets absolute x
const beforeNudge = (await layers())[0].scene.x;
await page.keyboard.press("ArrowRight");
await sleep(250);
ls = await layers();
check("move: arrow nudge shifts the shape", ls[0]?.scene.x, Math.abs(ls[0].scene.x - beforeNudge - 1) < 0.5);
px = await sample(801, 600);
check("move: shape re-rendered at new spot", px, near(px, [204, 0, 204]));

await drag({ x: 200, y: 200 }, { x: 400, y: 350 });
ls = await layers();
check("move: dragging draws nothing", ls.length, ls.length === 1);

await setTool("pieces", "primitives");
const c = toPage(1400, 1100);
await page.mouse.click(c.x, c.y);
await sleep(250);
ls = await layers();
check("pieces: bare click draws nothing", ls.length, ls.length === 1);

await pieces({ shape: "rectangle", fill: "#ff0000", stroke: null, cornerRadius: 0 });
await drag({ x: 1100, y: 300 }, { x: 1500, y: 500 });
const rectId = (await layers()).find((l) => l.name === "Rectangle").id;
px = await sample(1110, 310);
check("edit: corner starts sharp", px, near(px, [255, 0, 0]));
await page.evaluate(
  ([id]) => window.__substrata.shapeParams(id, { shape: "rectangle", width: 400, height: 200, cornerRadius: 100 }),
  [rectId],
);
await sleep(300);
px = await sample(1110, 310);
check("edit: cornerRadius 100 rounds it away", px, near(px, WHITE));
px = await sample(1300, 400);
check("edit: centre still filled", px, near(px, [255, 0, 0]));
await undo();
px = await sample(1110, 310);
check("edit: param edit is ONE undo step", px, near(px, [255, 0, 0]));
await undo();

px = await sample(801, 675);
check("edit: star gap empty before", px, near(px, WHITE));
await page.evaluate(
  ([id]) => window.__substrata.shapeParams(id, { shape: "star", points: 5, outerRadius: 100, innerRadius: 90 }),
  [starId],
);
await sleep(300);
px = await sample(801, 675);
check("edit: inner 90% fills the gap (chunky star)", px, near(px, [204, 0, 204]));
await undo();
px = await sample(801, 675);
check("edit: undo restores pointy star", px, near(px, WHITE));

await pieces({ shape: "rectangle", fill: "#3e6b33", cornerRadius: 24 });
await drag({ x: 150, y: 200 }, { x: 500, y: 500 });
await pieces({ shape: "ellipse", fill: "#e8b13c" });
await drag({ x: 550, y: 200 }, { x: 900, y: 500 });
await pieces({ shape: "line", stroke: { colour: "#1d1d1d", width: 8 } });
await drag({ x: 950, y: 480 }, { x: 1300, y: 220 });
await pieces({ shape: "polygon", fill: "#cc00cc", sides: 5 });
await drag({ x: 500, y: 950 }, { x: 500, y: 780 });
// inspector eats pointer events
await pieces({ shape: "star", fill: "#0000cc", starPoints: 6 });
await drag({ x: 1350, y: 420 }, { x: 1350, y: 250 });
// show inspector shape section
const last = (await layers()).at(-1);
await page.evaluate((id) => window.__substrata.select([id]), last.id);
await sleep(400);
await page.screenshot({ path: `${OUT}/pieces-eyeball.png` });

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
