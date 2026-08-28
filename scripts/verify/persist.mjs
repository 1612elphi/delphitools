// headless can't drive file pickers
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
page.on("dialog", (d) => d.accept());
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
const guides = () => page.evaluate(() => window.__substrata.guides());
const sample = async (sx, sy) => {
  const p = toPage(sx, sy);
  return page.evaluate(([x, y]) => window.__substrata.samplePixel(x, y), [p.x - rect.left, p.y - rect.top]);
};
const near = (px, rgba, tol = 12) => !!px && rgba.every((v, i) => Math.abs(px[i] - v) <= tol);
const drag = async (x0, y0, x1, y1) => {
  const a = toPage(x0, y0);
  const b = toPage(x1, y1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await sleep(300);
};

await page.evaluate(() =>
  window.__substrata.addRaster(600, 400, [{ x: 0, y: 0, w: 600, h: 400, colour: "#2244cc" }], { x: 500, y: 400 }),
);
await sleep(400);
await page.evaluate(() => {
  window.__substrata.setTool("pieces", "pieces");
  window.__substrata.toolSettings("pieces", { symbolId: "heart", fill: "#3e6b33" });
});
await drag(1200, 800, 1600, 1200);
// page coords, not scene
const t = toPage(900, 700);
await page.mouse.move(rect.left + 10, t.y);
await page.mouse.down();
await page.mouse.move(t.x, t.y, { steps: 8 });
await page.mouse.up();
await sleep(300);
const beforeLayers = await layers();
const beforeGuides = await guides();
check("setup: raster + heart + guide", `${beforeLayers.length}L ${beforeGuides.length}G`, beforeLayers.length === 2 && beforeGuides.length === 1);

const bytes = await page.evaluate(() => window.__substrata.packScene());
check("pack: plausible zip", `${bytes?.length}B`, Array.isArray(bytes) && bytes.length > 1000);
check("pack: zip magic", bytes?.slice(0, 2).join(","), bytes[0] === 0x50 && bytes[1] === 0x4b);

await page.evaluate(() => {
  const ids = window.__substrata.layers().map((l) => l.id);
  window.__substrata.select(ids);
});
await page.keyboard.press("Backspace");
await sleep(300);
check("destroy: layers gone", (await layers()).length, (await layers()).length === 0);
await page.evaluate((b) => window.__substrata.unpackScene(b), bytes);
await sleep(600);
const afterLayers = await layers();
const afterGuides = await guides();
check("unpack: layers restored", afterLayers.map((l) => l.name).join(","), afterLayers.length === 2 && afterLayers[1].name === "Heart");
check("unpack: guide restored at x≈900", afterGuides[0]?.pos, afterGuides.length === 1 && Math.abs(afterGuides[0].pos - 900) <= 1);
let px = await sample(500, 400);
check("unpack: raster pixels restored", px?.join(","), near(px, [34, 68, 204, 255]));
px = await sample(1200 + (70 / 256) * 400 - 200 + 200, 800 + (110 / 256) * 400); // lobe
check("unpack: heart renders", px?.join(","), near(px, [62, 107, 51, 255]));

await page.keyboard.down("Meta");
await page.keyboard.press("z");
await page.keyboard.up("Meta");
await sleep(300);
check("open: history starts fresh (undo no-ops)", (await layers()).length, (await layers()).length === 2);

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
