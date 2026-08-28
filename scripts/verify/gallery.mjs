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

await page.evaluate(() => {
  window.__substrata.setTool("pieces", "pieces"); // gallery head sub
  window.__substrata.toolSettings("pieces", { symbolId: "heart", fill: "#3e6b33" });
});
await drag(600, 300, 1000, 700); // 400×400 box
let ls = await layers();
check("heart: layer named after the preset", ls[0]?.name, ls.length === 1 && ls[0].name === "Heart");
// grid(70,110) left lobe; grid(128,45) notch between lobes
let px = await sample(600 + (70 / 256) * 400, 300 + (110 / 256) * 400);
check("heart: lobe filled", px?.join(","), near(px, [62, 107, 51, 255]));
px = await sample(600 + (128 / 256) * 400, 300 + (45 / 256) * 400);
check("heart: notch shows background (real path, not a box)", px?.join(","), near(px, [255, 255, 255, 255]));
check("heart: centre-origin transform", JSON.stringify(ls[0]?.scene), Math.abs(ls[0].scene.x - 800) < 8 && Math.abs(ls[0].scene.y - 500) < 8);
await undo();
ls = await layers();
check("heart: ONE undo removes it", ls.length, ls.length === 0);

await page.evaluate(() => {
  window.__substrata.setTool("pieces", "pieces"); // reverts after heart use
  window.__substrata.toolSettings("pieces", { symbolId: "cog" });
});
await drag(400, 800, 800, 1200);
ls = await layers();
check("cog: layer named Cog", ls[0]?.name, ls.length === 1 && ls[0].name === "Cog");
// grid centre (128,128) = gear hole
px = await sample(400 + 200, 800 + 200);
check("cog: centre hole is background (nonzero winding)", px?.join(","), near(px, [255, 255, 255, 255]));
// grid(128,60) solid body; edges at y=40/y=88 — edge sampling catches AA
px = await sample(400 + 200, 800 + (60 / 256) * 400);
check("cog: tooth filled", px?.join(","), near(px, [62, 107, 51, 255]));

await page.evaluate(() => {
  window.__substrata.setTool("pieces", "primitives");
  window.__substrata.toolSettings("pieces", { shape: "rectangle", fill: "#cc2222" });
});
await drag(1200, 300, 1500, 500);
ls = await layers();
check("primitives: rectangle still draws", ls.map((l) => l.name).join(","), ls.length === 2 && ls[1].name === "Rectangle");

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
