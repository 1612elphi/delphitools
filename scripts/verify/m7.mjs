// seamed matte, no model fetch
// needs `npm run dev` on :3000
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

let vt = await page.evaluate(() => window.__substrata.vt());
const rect = await page.evaluate(() => {
  const r = document.querySelector("canvas.upper-canvas").getBoundingClientRect();
  return { left: r.left, top: r.top };
});
const check = (label, detail, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  [${detail}]`);
  if (!ok) failures++;
};
const layers = () => page.evaluate(() => window.__substrata.layers());
const refreshVt = async () => {
  vt = await page.evaluate(() => window.__substrata.vt());
};
const sample = async (sx, sy) =>
  page.evaluate(([x, y]) => window.__substrata.samplePixel(x, y), [sx * vt[0] + vt[4], sy * vt[3] + vt[5]]);
const near = (px, rgba, tol = 14) => !!px && rgba.every((v, i) => Math.abs(px[i] - v) <= tol);
const undo = async () => {
  await page.keyboard.down("Meta");
  await page.keyboard.press("z");
  await page.keyboard.up("Meta");
  await sleep(350);
};
const redo = async () => {
  await page.keyboard.down("Meta");
  await page.keyboard.down("Shift");
  await page.keyboard.press("z");
  await page.keyboard.up("Shift");
  await page.keyboard.up("Meta");
  await sleep(350);
};

await page.evaluate(() =>
  window.__substrata.addRaster(
    400,
    300,
    [
      { x: 0, y: 0, w: 200, h: 300, colour: "#cc2200" },
      { x: 200, y: 0, w: 200, h: 300, colour: "#3e6b33" },
    ],
    { x: 600, y: 400 },
  ),
);
await sleep(600);
let ls = await layers();
const raster = ls.find((l) => l.kind === "raster");
check("seed: raster imported", JSON.stringify(raster?.scene), !!raster);

const matteSet = await page.evaluate(
  (id) => window.__substrata.setMatte(id, [{ x: 0, y: 0, w: 200, h: 300 }]),
  raster.id,
);
check("matte: test seam accepted", String(matteSet), matteSet === true);

await page.evaluate((id) => window.__substrata.effect(id, "remove-background"), raster.id);
await sleep(500);

let left = await sample(510, 400);
let right = await sample(690, 400);
check("cutout: matte-opaque half keeps pixels", `${left}`, near(left, [204, 34, 0, 255]));
check("cutout: matte-transparent half erased to artboard", `${right}`, near(right, [255, 255, 255, 255]));

const matteInfo = await page.evaluate((id) => window.__substrata.matte(id), raster.id);
check(
  "matte: status done, no model kicked",
  JSON.stringify(matteInfo?.status),
  matteInfo?.loaded === true && matteInfo?.status?.state === "done",
);

await undo();
right = await sample(690, 400);
check("undo: effect off, right half back", `${right}`, near(right, [62, 107, 51, 255]));
const matteAfterUndo = await page.evaluate((id) => window.__substrata.matte(id), raster.id);
check("undo: matte cache untouched", String(matteAfterUndo?.loaded), matteAfterUndo?.loaded === true);

await redo();
right = await sample(690, 400);
check("redo: cutout back from cache", `${right}`, near(right, [255, 255, 255, 255]));

await page.evaluate(
  (id) =>
    window.__substrata.effect(id, "drop-shadow", { colour: "#000000", opacity: 100, blur: 0, offsetX: 60, offsetY: 0, spread: 0 }),
  raster.id,
);
await sleep(500);
const shadowInCut = await sample(630, 400);
const shadowFarRight = await sample(830, 400);
check("shadow: stamps cutout silhouette", `${shadowInCut}`, near(shadowInCut, [0, 0, 0, 255]));
check("shadow: no ghost of removed half", `${shadowFarRight}`, near(shadowFarRight, [255, 255, 255, 255]));
await undo();
await undo();

await page.evaluate(() => {
  window.__substrata.setTool("pieces", "primitives");
  window.__substrata.toolSettings("pieces", { shape: "rectangle", fill: "#3e6b33", stroke: null, cornerRadius: 0 });
});
{
  const a = { x: rect.left + 900 * vt[0] + vt[4], y: rect.top + 650 * vt[3] + vt[5] };
  const b = { x: rect.left + 1100 * vt[0] + vt[4], y: rect.top + 850 * vt[3] + vt[5] };
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await sleep(350);
}
await page.evaluate(() => window.__substrata.setTool("pieces", "primitives"));
{
  const a = { x: rect.left + 1700 * vt[0] + vt[4], y: rect.top + 1200 * vt[3] + vt[5] };
  const b = { x: rect.left + 1900 * vt[0] + vt[4], y: rect.top + 1400 * vt[3] + vt[5] };
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await sleep(350);
}
await page.keyboard.press("Escape");
await sleep(200);

ls = await layers();
const centreShape = ls.find((l) => l.kind === "shape" && Math.abs(l.scene.x - 1000) < 4 && Math.abs(l.scene.y - 750) < 4);
const cornerShape = ls.find((l) => l.kind === "shape" && Math.abs(l.scene.x - 1800) < 4 && Math.abs(l.scene.y - 1300) < 4);
check("seed: centre + corner markers placed", JSON.stringify(ls.map((l) => l.scene)), !!centreShape && !!cornerShape);

await page.evaluate(() => window.__substrata.resizeReflow(1000, 750));
await sleep(500);
await refreshVt();

ls = await layers();
const c2 = ls.find((l) => l.id === centreShape.id);
const k2 = ls.find((l) => l.id === cornerShape.id);
const r2 = ls.find((l) => l.id === raster.id);
check("reflow: centre marker stays centred", JSON.stringify(c2?.scene), !!c2 && Math.abs(c2.scene.x - 500) < 2 && Math.abs(c2.scene.y - 375) < 2);
check("reflow: corner marker re-anchors to corner", JSON.stringify(k2?.scene), !!k2 && Math.abs(k2.scene.x - 900) < 2 && Math.abs(k2.scene.y - 650) < 2);
check("reflow: mid-zone layer proportional", JSON.stringify(r2?.scene), !!r2 && Math.abs(r2.scene.x - 300) < 2 && Math.abs(r2.scene.y - 200) < 2);

await undo();
ls = await layers();
const c3 = ls.find((l) => l.id === centreShape.id);
const k3 = ls.find((l) => l.id === cornerShape.id);
check(
  "reflow: single undo restores all layers",
  JSON.stringify([c3?.scene, k3?.scene]),
  !!c3 && Math.abs(c3.scene.x - 1000) < 2 && Math.abs(c3.scene.y - 750) < 2 && !!k3 && Math.abs(k3.scene.x - 1800) < 2 && Math.abs(k3.scene.y - 1300) < 2,
);

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
