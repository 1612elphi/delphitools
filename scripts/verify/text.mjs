// Headless verification for M2 TEXT (delete after use).
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
const clickScene = async (sx, sy, opts) => {
  const p = toPage(sx, sy);
  await page.mouse.click(p.x, p.y, opts);
  await sleep(350);
};

// any red-ish ink within a small scene-space grid (glyphs are sparse)
const inkNear = async (sx, sy, rgb, span = 40) => {
  for (let dx = -span; dx <= span; dx += 10) {
    for (let dy = -span; dy <= span; dy += 10) {
      const px = await sample(sx + dx, sy + dy);
      if (near(px, rgb, 60)) return true;
    }
  }
  return false;
};

// 1) PILL style: click-to-type, plate + contrast ink render.
await page.evaluate(() => {
  window.__substrata.setTool("text", "text");
  window.__substrata.toolSettings("text", { fontFamily: "sans", fontSize: 120, style: "regular" });
  window.__substrata.colour("#3e6b33"); // accent for new text
});
await clickScene(800, 600);
await page.keyboard.type("HELLO", { delay: 30 });
// MID-EDIT style application (Ruby 2026-07-06): while still editing, style
// props must render immediately — flip regular→pill via the doc op and
// expect the plate to appear around the live text.
await page.evaluate(() => {
  const id = window.__substrata.layers()[0].id;
  window.__substrata.textProps(id, {
    fill: "#f4f1ea",
    stroke: null,
    plate: { shape: "pill", colour: "#3e6b33", padding: 42 },
  });
});
await sleep(400);
// text grows LEFT-ANCHORED while editing, so scan a band for the plate
let midEditHit = false;
for (let x = 800; x <= 1250 && !midEditHit; x += 25) {
  midEditHit = near(await sample(x, 600 - 95), [62, 107, 51]);
}
check("mid-edit: plate renders while editing", "band-scan", midEditHit);
await page.keyboard.press("Escape");
await sleep(400);
await page.evaluate(() => window.__substrata.select([]));
await sleep(150);
let ls = await layers();
check("text: one layer, named by content", ls.map((l) => l.name).join(","), ls.length === 1 && ls[0].name === "HELLO");
// the exit commit adopts the VISUAL centre — sample relative to the doc's
const c0 = ls[0].scene;
let px = await sample(c0.x - 80, c0.y - 95); // plate padding band, off borders/handles/stem
check("pill: plate colour above the glyphs", px, near(px, [62, 107, 51]));
check(
  "pill: contrast ink present",
  "grid",
  await inkNear(c0.x, c0.y, [244, 241, 234]),
);

// 2) accent recolour through the colour sink (style re-expresses).
await page.evaluate((id) => window.__substrata.select([id]), ls[0].id);
await sleep(200);
await page.evaluate(() => window.__substrata.colour("#cc2200"));
await sleep(350);
px = await sample(c0.x - 80, c0.y - 95);
check("sink: plate recoloured via accent", px, near(px, [204, 34, 0]));
await undo();
px = await sample(c0.x - 80, c0.y - 95);
check("sink: one undo restores plate colour", px, near(px, [62, 107, 51]));

// 3) style switch via rig-less doc op path is covered by the sink; test REGULAR creation.
await page.evaluate(() => {
  window.__substrata.select([]);
  window.__substrata.setTool("text", "text");
  window.__substrata.toolSettings("text", { fontSize: 200, style: "regular" });
  window.__substrata.colour("#cc2200");
});
await clickScene(600, 250);
await page.keyboard.type("H", { delay: 30 });
await page.keyboard.press("Escape");
await sleep(400);
ls = await layers();
check("regular: second layer named H", ls.length, ls.length === 2 && ls[1].name === "H");
check("regular: red glyph ink on canvas", "grid", await inkNear(600, 250, [204, 34, 0], 60));

// 4) edit round-trip: dbl-click the layer's ACTUAL centre (the exit commit
// adopted the visual position), typing updates doc on exit.
await page.evaluate(() => window.__substrata.setTool("move"));
const hc = ls[1].scene;
await clickScene(hc.x, hc.y, { clickCount: 2 });
await page.keyboard.type("I", { delay: 30 });
await page.keyboard.press("Escape");
await sleep(400);
ls = await layers();
check("edit: content committed on exit", ls[1]?.name, ls[1]?.name.includes("I") && ls[1]?.name.includes("H"));

// 5) abandoned empty text creates nothing lasting.
await page.evaluate(() => window.__substrata.setTool("text", "text"));
await clickScene(1300, 1000);
await page.keyboard.press("Escape");
await sleep(400);
ls = await layers();
check("abandon: empty text layer removed", ls.length, ls.length === 2);

// 6) outline style renders stroke-only ink.
await page.evaluate(() => {
  window.__substrata.setTool("text", "text"); // one-shot reverted after the abandon
  window.__substrata.toolSettings("text", { fontSize: 200, style: "outline" });
  window.__substrata.colour("#0044cc");
});
await clickScene(1000, 950);
await page.keyboard.type("O", { delay: 30 });
await page.keyboard.press("Escape");
await sleep(400);
check("outline: blue stroke ink present", "grid", await inkNear(1000, 950, [0, 68, 204], 70));

await page.evaluate(() => window.__substrata.select([]));
await sleep(200);
await page.screenshot({ path: `${OUT}/text-eyeball.png` });

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
