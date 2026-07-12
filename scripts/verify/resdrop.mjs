// Headless verification — touch-gesture resolution drop (delete after use).
// Emulates a DPR-2 touch device via CDP, drives a real touch drag, and
// asserts the fabric backing store drops to 1× mid-gesture, restores to
// retina after release, and never drops on a plain tap.
// Needs `npm run dev` on :3000.
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

const state = () =>
  page.evaluate(() => {
    const c = document.querySelector("canvas.lower-canvas");
    const wrap = c.parentElement.parentElement;
    return { backing: c.width, css: wrap.clientWidth, touchPoints: navigator.maxTouchPoints };
  });

let s = await state();
check("setup: touch device emulated", `maxTouchPoints=${s.touchPoints}`, s.touchPoints > 1);
check("rest: retina backing (css × 2)", `${s.backing} vs ${s.css}×2`, s.backing === s.css * 2);

// touch drag across the canvas: expect 1× mid-gesture
// (top-left quadrant — the empty-scene starter card owns the viewport centre)
const cx = 380;
const cy = 260;
const touch = (type, x, y) =>
  cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }],
  });
await touch("touchStart", cx, cy);
for (let i = 1; i <= 12; i++) {
  await touch("touchMove", cx + i * 12, cy + i * 4);
  await sleep(16);
}
s = await state();
check("mid-drag: backing dropped to 1×", `${s.backing} vs ${s.css}`, s.backing === s.css);
await touch("touchEnd", 0, 0);
await sleep(450); // 180ms grace + render
s = await state();
check("after release: retina restored", `${s.backing} vs ${s.css}×2`, s.backing === s.css * 2);

// plain tap: no movement → never drops
await touch("touchStart", cx, cy);
await sleep(80);
await touch("touchEnd", 0, 0);
await sleep(100);
s = await state();
check("tap: backing untouched", `${s.backing} vs ${s.css}×2`, s.backing === s.css * 2);

// consecutive strokes inside the grace window: no thrash (stays 1× between)
await touch("touchStart", cx, cy);
await touch("touchMove", cx + 30, cy + 10);
await sleep(30);
await touch("touchEnd", 0, 0);
await sleep(60); // inside the 180ms grace
await touch("touchStart", cx, cy + 40);
await touch("touchMove", cx + 30, cy + 50);
s = await state();
check("stroke chain: still 1× inside grace", `${s.backing} vs ${s.css}`, s.backing === s.css);
await touch("touchEnd", 0, 0);
await sleep(450);
s = await state();
check("chain end: retina restored", `${s.backing} vs ${s.css}×2`, s.backing === s.css * 2);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
await browser.close();
process.exit(failures ? 1 : 0);
