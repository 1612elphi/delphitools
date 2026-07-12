// Headless pixel verification for the M3 effects engine (delete after use).
// Pattern from .repro-phantom.mjs: dev server /editor + window.__substrata rig.
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
await sleep(500);

// One solid 200x100 card (#3E6B33), dropped once.
await page.evaluate(async () => {
  const c = document.createElement("canvas");
  c.width = 200;
  c.height = 100;
  const g = c.getContext("2d");
  g.fillStyle = "#3E6B33";
  g.fillRect(0, 0, 200, 100);
  const blob = await new Promise((res) => c.toBlob(res, "image/png"));
  const dt = new DataTransfer();
  dt.items.add(new File([blob], "card.png", { type: "image/png" }));
  const wrap = document.querySelector("canvas.lower-canvas").closest("div.canvas-container").parentElement;
  wrap.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
});
await page.waitForFunction(() => window.__substrata.layers().length === 1, { timeout: 10000 });
await page.evaluate(() => window.__substrata.select([]));
await sleep(300);

const layer = await page.evaluate(() => window.__substrata.layers()[0]);
const vt = await page.evaluate(() => window.__substrata.vt());
const zoom = vt[0];
// scene point -> screen px relative to the canvas element
const toScreen = (sx, sy) => ({ x: sx * vt[0] + vt[4], y: sy * vt[3] + vt[5] });
const C = layer.scene; // centre of the 200x100 card in scene coords
const sample = async (sx, sy) => {
  const p = toScreen(sx, sy);
  return page.evaluate(([x, y]) => window.__substrata.samplePixel(x, y), [p.x, p.y]);
};
console.log("zoom:", zoom.toFixed(3), "centre:", C);

const near = (px, rgb, tol = 14) =>
  Math.abs(px[0] - rgb[0]) <= tol && Math.abs(px[1] - rgb[1]) <= tol && Math.abs(px[2] - rgb[2]) <= tol;
const check = (label, px, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  [${px.join(",")}]`);
  if (!ok) failures++;
};

const addEffect = (type, params) =>
  page.evaluate(([id, t, p]) => window.__substrata.effect(id, t, p), [layer.id, type, params]);
const undo = async () => {
  await page.keyboard.down("Meta");
  await page.keyboard.press("z");
  await page.keyboard.up("Meta");
  await sleep(350);
};

// Baseline: just outside the right edge = white artboard; centre = card green.
const R = C.x + 100; // right edge scene x
let px = await sample(R + 10, C.y);
check("baseline outside is white", px, near(px, [255, 255, 255]));
px = await sample(C.x, C.y);
check("baseline centre is card green", px, near(px, [62, 107, 51]));

// 1) drop-shadow: hard red shadow 20px right -> red strip beyond the edge; undo restores.
await addEffect("drop-shadow", { colour: "#ff0000", opacity: 100, blur: 0, offsetX: 20, offsetY: 0, spread: 0 });
await sleep(400);
px = await sample(R + 10, C.y);
check("drop-shadow: red at right+10", px, near(px, [255, 0, 0]));
px = await sample(R + 30, C.y);
check("drop-shadow: white past offset", px, near(px, [255, 255, 255]));
px = await sample(C.x, C.y);
check("drop-shadow: content untinted", px, near(px, [62, 107, 51]));
await undo();
px = await sample(R + 10, C.y);
check("undo removes shadow", px, near(px, [255, 255, 255]));

// 2) drop-shadow opacity 50 -> 50% red over white = (255,128,128).
await addEffect("drop-shadow", { colour: "#ff0000", opacity: 50, blur: 0, offsetX: 20, offsetY: 0, spread: 0 });
await sleep(400);
px = await sample(R + 10, C.y);
check("drop-shadow opacity 50%", px, near(px, [255, 128, 128], 16));
await undo();

// 3) drop-shadow spread only (no offset/blur) -> dilated red ring outside all edges.
await addEffect("drop-shadow", { colour: "#ff0000", opacity: 100, blur: 0, offsetX: 0, offsetY: 0, spread: 15 });
await sleep(400);
px = await sample(R + 7, C.y);
check("spread: red right of edge", px, near(px, [255, 0, 0]));
px = await sample(C.x, C.y - 50 - 7);
check("spread: red above edge", px, near(px, [255, 0, 0]));
await undo();

// 4) outer-glow: green tint just outside the edge, fading with distance.
await addEffect("outer-glow", { colour: "#00ff00", blur: 30, intensity: 100 });
await sleep(400);
px = await sample(R + 6, C.y);
check("outer-glow: green tint near edge", px, px[1] > 200 && px[0] < 200);
px = await sample(R + 90, C.y);
check("outer-glow: gone far out", px, near(px, [255, 255, 255]));
await undo();

// 5) stroke outer: solid blue band outside the edge.
await addEffect("stroke", { colour: "#0000ff", width: 12, position: "outer" });
await sleep(400);
px = await sample(R + 6, C.y);
check("stroke outer: blue outside", px, near(px, [0, 0, 255]));
px = await sample(C.x, C.y);
check("stroke outer: centre untouched", px, near(px, [62, 107, 51]));
await undo();

// 6) stroke inner: blue band inside the edge, outside stays white.
await addEffect("stroke", { colour: "#0000ff", width: 12, position: "inner" });
await sleep(400);
px = await sample(R - 6, C.y);
check("stroke inner: blue inside edge", px, near(px, [0, 0, 255]));
px = await sample(R + 6, C.y);
check("stroke inner: outside clean", px, near(px, [255, 255, 255]));
px = await sample(C.x, C.y);
check("stroke inner: centre untouched", px, near(px, [62, 107, 51]));
await undo();

// 7) inner-shadow offset -30: magenta strip inside the RIGHT edge, centre clean.
await addEffect("inner-shadow", { colour: "#ff00ff", opacity: 100, blur: 0, offsetX: -30, offsetY: 0 });
await sleep(400);
px = await sample(R - 10, C.y);
check("inner-shadow: field inside right edge", px, near(px, [255, 0, 255]));
px = await sample(C.x, C.y);
check("inner-shadow: centre clean", px, near(px, [62, 107, 51]));
px = await sample(R + 10, C.y);
check("inner-shadow: nothing outside", px, near(px, [255, 255, 255]));
await undo();

// 8) inner-glow: yellow lift just inside every edge.
await addEffect("inner-glow", { colour: "#ffff00", blur: 24, intensity: 100 });
await sleep(400);
px = await sample(R - 3, C.y);
check("inner-glow: yellow at inside edge", px, px[0] > 150 && px[2] < 120);
await undo();

// 9) colour-overlay: exact tint at centre, outside untouched.
await addEffect("colour-overlay", { colour: "#123456", opacity: 100 });
await sleep(400);
px = await sample(C.x, C.y);
check("overlay: exact colour at centre", px, near(px, [18, 52, 86], 6));
px = await sample(R + 10, C.y);
check("overlay: outside untouched", px, near(px, [255, 255, 255]));
await undo();

// 10) live transient param drag: blur slides while gesture active, one undo step.
const fxId = await addEffect("drop-shadow", { colour: "#ff0000", opacity: 100, blur: 0, offsetX: 40, offsetY: 0, spread: 0 });
await sleep(400);
px = await sample(R + 30, C.y);
check("pre-gesture: hard shadow at +30", px, near(px, [255, 0, 0]));
px = await sample(R + 110, C.y);
check("pre-gesture: white at +110 (offset 40 can't reach)", px, near(px, [255, 255, 255]));
await page.evaluate(
  ([id, fx]) => {
    window.__substrata.gesture.begin();
    window.__substrata.effectParam(id, fx, "offsetX", 120, true);
  },
  [layer.id, fxId],
);
await sleep(400);
px = await sample(R + 110, C.y);
check("transient: shadow reaches +110 mid-gesture", px, near(px, [255, 0, 0]));
await page.evaluate(() => window.__substrata.gesture.commit());
await sleep(400);
await undo(); // ONE undo: the whole gesture
px = await sample(R + 110, C.y);
check("gesture = one undo step (offset back)", px, near(px, [255, 255, 255]));
px = await sample(R + 30, C.y);
check("gesture undo restores pre-drag shadow", px, near(px, [255, 0, 0]));
await undo(); // remove the effect entirely
px = await sample(R + 30, C.y);
check("final undo clears effect", px, near(px, [255, 255, 255]));

// 11) stacking: shadow + overlay together; overlay must NOT tint the shadow.
await addEffect("drop-shadow", { colour: "#ff0000", opacity: 100, blur: 0, offsetX: 20, offsetY: 0, spread: 0 });
await addEffect("colour-overlay", { colour: "#123456", opacity: 100 });
await sleep(400);
px = await sample(R + 10, C.y);
check("stack: shadow stays pure red under overlay", px, near(px, [255, 0, 0]));
px = await sample(C.x, C.y);
check("stack: overlay tints content only", px, near(px, [18, 52, 86], 6));

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
