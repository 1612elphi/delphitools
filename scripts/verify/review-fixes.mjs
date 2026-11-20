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
// accept confirmDiscard prompts
page.on("dialog", (d) => void d.accept());
await page.goto(URL, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.__substrata, { timeout: 20000 });
await sleep(400);

const check = (label, detail, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  [${detail}]`);
  if (!ok) failures++;
};
const layers = () => page.evaluate(() => window.__substrata.layers());
const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);

let prevented = await page.evaluate(() => {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
});
check("unload-guard: disarmed with no edits", String(prevented), prevented === false);

await page.evaluate(() =>
  window.__substrata.addRaster(200, 150, [{ x: 0, y: 0, w: 200, h: 150, colour: "#cc2200" }], { x: 400, y: 300 }),
);
await sleep(600);

prevented = await page.evaluate(() => {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
});
check("unload-guard: ARMED with edits + storage off", String(prevented), prevented === true);

await page.evaluate(() =>
  window.__substrata.addRaster(60, 60, [{ x: 0, y: 0, w: 60, h: 60, colour: "#3e6b33" }], { x: 900, y: 500 }),
);
await sleep(250); // toast lasts 1.8 s
const undoPresent = await page.evaluate(
  () => [...document.querySelectorAll("button svg")].some((s) => s.classList.contains("lucide-undo-2")),
);
check("toast-slot: undo button present mid-toast", String(undoPresent), undoPresent === true);

const titledCount = await page.evaluate((m) => {
  // never write marker literal
  return document.querySelectorAll(`[title="${m}"], button[title]:not([title=""])`).length;
}, "\u2211CG");
check("tooltips: titled controls present", `${titledCount} titled`, titledCount > 10);

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
