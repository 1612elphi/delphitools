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

const stroke = async (waypoints) => {
  const [first, ...rest] = waypoints.map(([x, y]) => toPage(x, y));
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const p of rest) await page.mouse.move(p.x, p.y, { steps: 8 });
  await page.mouse.up();
  await sleep(350);
  await page.evaluate(() => window.__substrata.select([]));
  await sleep(150);
};

const WHITE = [255, 255, 255];

await page.evaluate(() => {
  window.__substrata.setTool("pieces", "brush");
  window.__substrata.toolSettings("pieces", { fill: "#3e6b33", brushSize: 36 });
});
await stroke([[500, 600], [700, 600], [900, 600]]);
let ls = await layers();
check("brush: one layer named Brush", ls.map((l) => l.name).join(","), ls.length === 1 && ls[0].name === "Brush");
let px = await sample(700, 600);
check("brush: filled on the stroke", px, near(px, [62, 107, 51]));
px = await sample(700, 640);
check("brush: clean beside the stroke", px, near(px, WHITE));
check(
  "brush: centre-normalised transform (x≈700)",
  JSON.stringify(ls[0].scene),
  Math.abs(ls[0].scene.x - 700) < 8 && Math.abs(ls[0].scene.y - 600) < 8,
);
await undo();
ls = await layers();
check("brush: ONE undo removes the stroke", ls.length, ls.length === 0);

await page.evaluate(() => {
  window.__substrata.setTool("pieces", "pencil");
  window.__substrata.toolSettings("pieces", { fill: "#cc00cc", pencilSize: 8 });
});
await stroke([[500, 300], [700, 300], [900, 300]]);
ls = await layers();
check("pencil: layer named Pencil", ls[0]?.name, ls.length === 1 && ls[0].name === "Pencil");
px = await sample(700, 300);
check("pencil: filled on the stroke", px, near(px, [204, 0, 204]));
px = await sample(700, 315);
check("pencil: thin — clean 15px off-line", px, near(px, WHITE));

await page.evaluate(() => window.__substrata.setTool("move"));
const id = (await layers())[0].id;
await page.evaluate((lid) => window.__substrata.select([lid]), id);
await sleep(200);
await page.keyboard.press("ArrowRight");
await sleep(250);
ls = await layers();
check("move: nudge shifts the stroke", ls[0]?.scene.x, Math.abs(ls[0].scene.x - 701) < 8);

await page.evaluate(() => window.__substrata.setTool("pieces", "brush"));
const tap = toPage(1400, 1100);
await page.mouse.click(tap.x, tap.y);
await sleep(250);
ls = await layers();
check("brush: bare tap draws nothing", ls.length, ls.length === 1);

await page.evaluate(() => window.__substrata.toolSettings("pieces", { fill: "#e8b13c", brushSize: 28 }));
await stroke([[400, 800], [550, 700], [700, 900], [850, 700], [1000, 900], [1150, 750]]);
await page.screenshot({ path: `${OUT}/freehand-eyeball.png` });

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
