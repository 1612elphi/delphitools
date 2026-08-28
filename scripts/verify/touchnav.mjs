import puppeteer from "puppeteer-core";

const URL = process.env.EDITOR_URL ?? "http://localhost:3000/editor";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (label, detail, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  [${detail}]`);
  if (!ok) failures++;
};

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--window-size=1500,950"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 2 });
const cdp = await page.createCDPSession();
await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await page.goto(URL, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.__substrata, { timeout: 20000 });
await sleep(500);

const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
const zoom = () => page.evaluate(() => window.__substrata.vt()[0]);
const pan = () => page.evaluate(() => window.__substrata.vt().slice(4));
const layerCount = () => page.evaluate(() => window.__substrata.layers().length);

// off-centre: dodge empty-scene card
await page.evaluate(() =>
  window.__substrata.addRaster(400, 300, [{ x: 0, y: 0, w: 400, h: 300, colour: "#88aacc" }], { x: 500, y: 350 }),
);
await sleep(600);
const raster = await page.evaluate(() => window.__substrata.layers()[0]);

// pinch out zooms about centroid
const z0 = await zoom();
await touch("touchStart", [{ x: 600, y: 400, id: 1 }]);
await sleep(30);
await touch("touchStart", [{ x: 600, y: 400, id: 1 }, { x: 700, y: 480, id: 2 }]);
await sleep(30);
for (let i = 1; i <= 10; i++) {
  await touch("touchMove", [
    { x: 600 - i * 8, y: 400 - i * 6, id: 1 },
    { x: 700 + i * 8, y: 480 + i * 6, id: 2 },
  ]);
  await sleep(16);
}
await touch("touchEnd", []);
await sleep(300);
const z1 = await zoom();
check("pinch out: zoom increased", `${z0.toFixed(3)} → ${z1.toFixed(3)}`, z1 > z0 * 1.5);

// two-finger drag pans
const p0 = await pan();
await touch("touchStart", [{ x: 500, y: 400, id: 1 }]);
await sleep(30);
await touch("touchStart", [{ x: 500, y: 400, id: 1 }, { x: 580, y: 420, id: 2 }]);
await sleep(30);
for (let i = 1; i <= 10; i++) {
  await touch("touchMove", [
    { x: 500 + i * 12, y: 400 + i * 5, id: 1 },
    { x: 580 + i * 12, y: 420 + i * 5, id: 2 },
  ]);
  await sleep(16);
}
await touch("touchEnd", []);
await sleep(300);
const p1 = await pan();
check("two-finger drag: viewport panned", `[${p0.map(Math.round)}] → [${p1.map(Math.round)}]`,
  Math.abs(p1[0] - p0[0]) > 60 && p1[0] > p0[0]);

// pinch on object: no nudge/undo
await page.evaluate((id) => window.__substrata.select([id]), raster.id);
await sleep(200);
const sceneBefore = await page.evaluate((id) => window.__substrata.layers().find((l) => l.id === id).scene, raster.id);
const undoBefore = await page.evaluate(() => window.__substrata.canUndoState?.() ?? null);
const objScreen = await page.evaluate((id) => window.__substrata.layers().find((l) => l.id === id).screen, raster.id);
await touch("touchStart", [{ x: objScreen.x, y: objScreen.y, id: 1 }]);
await sleep(20);
// finger 1 leads before finger 2 lands
await touch("touchMove", [{ x: objScreen.x + 6, y: objScreen.y + 4, id: 1 }]);
await sleep(20);
await touch("touchStart", [{ x: objScreen.x + 6, y: objScreen.y + 4, id: 1 }, { x: objScreen.x + 120, y: objScreen.y + 80, id: 2 }]);
await sleep(30);
for (let i = 1; i <= 8; i++) {
  await touch("touchMove", [
    { x: objScreen.x + 6 - i * 6, y: objScreen.y + 4 - i * 4, id: 1 },
    { x: objScreen.x + 120 + i * 6, y: objScreen.y + 80 + i * 4, id: 2 },
  ]);
  await sleep(16);
}
await touch("touchEnd", []);
await sleep(400);
const sceneAfter = await page.evaluate((id) => window.__substrata.layers().find((l) => l.id === id).scene, raster.id);
check(
  "pinch on object: transform cancelled (scene pos unchanged)",
  `(${sceneBefore.x},${sceneBefore.y}) → (${sceneAfter.x.toFixed(1)},${sceneAfter.y.toFixed(1)})`,
  Math.abs(sceneAfter.x - sceneBefore.x) < 0.5 && Math.abs(sceneAfter.y - sceneBefore.y) < 0.5,
);

// pinch under brush: no stroke
await page.evaluate(() => window.__substrata.setTool("pieces", "brush"));
await sleep(200);
const layersBefore = await layerCount();
await touch("touchStart", [{ x: 420, y: 320, id: 1 }]);
await sleep(20);
await touch("touchMove", [{ x: 440, y: 335, id: 1 }]);
await sleep(20);
await touch("touchStart", [{ x: 440, y: 335, id: 1 }, { x: 560, y: 400, id: 2 }]);
await sleep(30);
for (let i = 1; i <= 8; i++) {
  await touch("touchMove", [
    { x: 440 + i * 10, y: 335 + i * 4, id: 1 },
    { x: 560 + i * 10, y: 400 + i * 4, id: 2 },
  ]);
  await sleep(16);
}
await touch("touchEnd", []);
await sleep(400);
check("pinch under brush: no stroke committed", `${layersBefore} → ${await layerCount()}`,
  (await layerCount()) === layersBefore);

// single finger still draws
await touch("touchStart", [{ x: 400, y: 300, id: 1 }]);
for (let i = 1; i <= 10; i++) {
  await touch("touchMove", [{ x: 400 + i * 14, y: 300 + i * 8, id: 1 }]);
  await sleep(16);
}
await touch("touchEnd", []);
await sleep(400);
check("single finger: brush stroke commits", `${layersBefore} → ${await layerCount()}`,
  (await layerCount()) === layersBefore + 1);

// single-finger move drag works
await page.evaluate(() => window.__substrata.setTool("move", "move"));
await sleep(200);
await page.evaluate((id) => window.__substrata.select([id]), raster.id);
await sleep(200);
const s2 = await page.evaluate((id) => window.__substrata.layers().find((l) => l.id === id), raster.id);
await touch("touchStart", [{ x: s2.screen.x, y: s2.screen.y, id: 1 }]);
await sleep(30);
for (let i = 1; i <= 10; i++) {
  await touch("touchMove", [{ x: s2.screen.x + i * 10, y: s2.screen.y + i * 4, id: 1 }]);
  await sleep(16);
}
await touch("touchEnd", []);
await sleep(400);
const s3 = await page.evaluate((id) => window.__substrata.layers().find((l) => l.id === id).scene, raster.id);
check("single finger: MOVE drag commits", `(${s2.scene.x.toFixed(0)},${s2.scene.y.toFixed(0)}) → (${s3.x.toFixed(0)},${s3.y.toFixed(0)})`,
  Math.abs(s3.x - s2.scene.x) > 10);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
await browser.close();
process.exit(failures ? 1 : 0);
