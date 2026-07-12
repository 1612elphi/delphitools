// Headless verification for TEXT object-level typography props (delete after use).
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
const check = (label, got, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  [${typeof got === "string" ? got : JSON.stringify(got)}]`);
  if (!ok) failures++;
};
const layers = () => page.evaluate(() => window.__substrata.layers());
const undo = async () => {
  await page.keyboard.down("Meta");
  await page.keyboard.press("z");
  await page.keyboard.up("Meta");
  await sleep(300);
};
const clickScene = async (sx, sy) => {
  const p = toCanvas(sx, sy);
  await page.mouse.click(rect.left + p.x, rect.top + p.y);
  await sleep(350);
};

// any red-ish ink inside a scene-space band (one in-page scan, canvas coords)
const bandInk = async (sx0, sx1, sy0, sy1) => {
  const a = toCanvas(sx0, sy0);
  const b = toCanvas(sx1, sy1);
  return page.evaluate(([x0, x1, y0, y1]) => {
    for (let x = x0; x <= x1; x += 5) {
      for (let y = y0; y <= y1; y += 5) {
        const px = window.__substrata.samplePixel(x, y);
        if (Math.abs(px[0] - 204) <= 60 && Math.abs(px[1] - 34) <= 60 && Math.abs(px[2] - 0) <= 60) return true;
      }
    }
    return false;
  }, [a.x, b.x, a.y, b.y]);
};

// 1) create a TWO-LINE text layer via the real tool path (short line over a
// long line — the only way align visibly moves anything on point text).
await page.evaluate(() => {
  window.__substrata.setTool("text", "text");
  window.__substrata.toolSettings("text", { fontFamily: "sans", fontSize: 120, style: "regular", align: "left" });
  window.__substrata.colour("#cc2200");
});
// off-centre — the empty-scene starter card (2026-07-08) owns the viewport
// centre on a fresh doc and eats the creation click; bands derive from the
// committed centre `c`, so the layer's position is otherwise free
await clickScene(600, 400);
await page.keyboard.type("II", { delay: 30 });
await page.keyboard.press("Enter");
await page.keyboard.type("MMMMMM", { delay: 30 });
await page.keyboard.press("Escape");
await sleep(400);
await page.evaluate(() => window.__substrata.select([])); // handles paint on the lower canvas at rest
await sleep(150);

const ls = await layers();
const id = ls[0]?.id;
const c = ls[0]?.scene;
const dump = () => page.evaluate((i) => window.__substrata.textDump(i), id);

// fresh layer: creation stamps align only; the other fields stay ABSENT
// (undefined drops in serialisation) — old docs restore untouched.
let d = await dump();
check(
  "fresh: align from settings, no other typography fields",
  d,
  ls.length === 1 && d.align === "left" && !("lineHeight" in d) && !("charSpacing" in d) && !("direction" in d),
);

// line 1 (the short "II") sits in the top half of the committed bbox
const y0 = c.y - 130;
const y1 = c.y - 15;
check("align left: short-line ink in the LEFT band", "band", await bandInk(c.x - 380, c.x - 140, y0, y1));
check("align left: RIGHT band empty at line 1", "band", !(await bandInk(c.x + 140, c.x + 380, y0, y1)));

// 2) align right — the short line's ink crosses to the right side.
await page.evaluate((i) => window.__substrata.textProps(i, { align: "right" }), id);
await sleep(350);
check("align right: LEFT band empty", "band", !(await bandInk(c.x - 380, c.x - 140, y0, y1)));
check("align right: short-line ink in the RIGHT band", "band", await bandInk(c.x + 140, c.x + 380, y0, y1));

// 3) the remaining three props round-trip the doc in ONE patch.
await page.evaluate(
  (i) => window.__substrata.textProps(i, { lineHeight: 2, charSpacing: 400, direction: "rtl" }),
  id,
);
await sleep(350);
d = await dump();
check(
  "doc round-trip: all four object-level props",
  d,
  d.align === "right" && d.lineHeight === 2 && d.charSpacing === 400 && d.direction === "rtl",
);

// 4) one undo = exactly the one patch (align survives, the trio reverts).
await undo();
d = await dump();
check(
  "undo: trio reverts in one step, align stays",
  d,
  d.align === "right" && !("lineHeight" in d) && !("charSpacing" in d) && !("direction" in d),
);

// 5) second undo restores the default alignment — ink returns to the left.
await undo();
d = await dump();
check(
  "undo: align back to left, ink returns to the LEFT band",
  d,
  d.align === "left" && (await bandInk(c.x - 380, c.x - 140, y0, y1)),
);

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
