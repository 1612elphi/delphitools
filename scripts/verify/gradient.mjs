// Headless verification for the Inspector gradient authoring UI (delete after use).
// Pins the Inspector to the right sidebar via localStorage BEFORE load, draws a
// rect with the real tool, then drives the actual Fill-row buttons and checks
// rendered pixels + undo granularity.
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
await page.evaluateOnNewDocument(() => {
  localStorage.setItem("substrata:layout:pinned", JSON.stringify(["inspector"]));
  localStorage.setItem("substrata:layout:moduleDock", JSON.stringify({ inspector: "right" }));
});
await page.goto(URL, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.__substrata, { timeout: 20000 });
await sleep(800); // layout hydration + sidebar slide-in settle before reading vt

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
const near = (px, rgb, tol = 20) =>
  Math.abs(px[0] - rgb[0]) <= tol && Math.abs(px[1] - rgb[1]) <= tol && Math.abs(px[2] - rgb[2]) <= tol;
const check = (label, got, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  [${Array.isArray(got) ? got.join(",") : got}]`);
  if (!ok) failures++;
};
const undo = async () => {
  await page.keyboard.down("Meta");
  await page.keyboard.press("z");
  await page.keyboard.up("Meta");
  await sleep(300);
};
const drag = async (s0, s1) => {
  const a = toPage(s0.x, s0.y);
  const b = toPage(s1.x, s1.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await sleep(350);
};

// ── inspector-panel DOM drivers (all in-page; scoped to the right sidebar) ──
const inPanel = `(() => document.querySelector("div.w-56.border-l"))`;
const clickBtn = async (text) => {
  const ok = await page.evaluate((t) => {
    const panel = document.querySelector("div.w-56.border-l");
    const b = [...panel.querySelectorAll("button")].find((x) => x.textContent.trim() === t);
    if (!b) return false;
    b.click();
    return true;
  }, text);
  if (!ok) console.log(`  (button "${text}" not found)`);
  await sleep(300);
  return ok;
};
const rowText = (label) =>
  page.evaluate((l) => {
    const panel = document.querySelector("div.w-56.border-l");
    const row = [...panel.querySelectorAll("div")].find(
      (d) => d.firstElementChild?.tagName === "SPAN" && d.firstElementChild.textContent === l,
    );
    return row ? row.textContent.replace(/\s+/g, " ").trim() : null;
  }, label);
// click the up (first) / down (second) chevron in a labelled Stepper row
const rowStep = async (label, dir, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.evaluate(
      ([l, d]) => {
        const panel = document.querySelector("div.w-56.border-l");
        const row = [...panel.querySelectorAll("div")].find(
          (x) => x.firstElementChild?.tagName === "SPAN" && x.firstElementChild.textContent === l,
        );
        row?.querySelectorAll("button")[d === "up" ? 0 : 1]?.click();
      },
      [label, dir],
    );
    await sleep(120);
  }
  await sleep(200);
};

const BASE = [204, 34, 0]; // #cc2200

// 1) draw a solid rect via the real tool; it stays selected → Inspector shows it.
await page.evaluate(() => {
  window.__substrata.setTool("pieces", "primitives");
  window.__substrata.toolSettings("pieces", { shape: "rectangle", fill: "#cc2200", stroke: null, cornerRadius: 0 });
});
await drag({ x: 600, y: 500 }, { x: 1000, y: 700 });
let px = await sample(800, 600);
check("baseline: solid rect drawn", px, near(px, BASE));

// 2) Fill row → Gradient: converts to a 2-stop linear (base → darker base), 0°.
check("ui: gradient button present", "click", await clickBtn("gradient"));
const left0 = await sample(610, 600);
check("gradient: left edge ≈ stop[0] (base colour)", left0, near(left0, BASE, 26));
px = await sample(960, 560); // clear of the mid-right selection handle at (1000,600)
check("gradient: far side darker, same hue-ish", px, px[0] < left0[0] - 30 && px[0] >= px[1] && px[0] >= px[2]);

// 3) the whole solid→gradient conversion is ONE undo step.
await undo();
px = await sample(960, 560);
check("gradient toggle = one undo step (flat again)", px, near(px, BASE));

// 4) re-enter gradient; Angle stepper 0→90 (6 clicks) = vertical ramp, top = stop[0].
await clickBtn("gradient");
await rowStep("Angle", "up", 6);
check("angle stepper reads 90°", await rowText("Angle"), (await rowText("Angle"))?.includes("90 °"));
const top = await sample(800, 515);
const bottom = await sample(800, 685);
check("angle 90°: top ≈ stop[0]", top, near(top, BASE, 30));
check("angle 90°: bottom darker than top", [top[0], bottom[0]], bottom[0] < top[0] - 40);

// 5) each stepper click was its own update → one undo rewinds 90° → 75°.
await undo();
check("one stepper click = one undo step (75°)", await rowText("Angle"), (await rowText("Angle"))?.includes("75 °"));
await rowStep("Angle", "up", 1); // back to 90 for the next checks

// 6) Radial: centred coords — centre ≈ stop[0], corners land past r2 (darker).
await clickBtn("radial");
px = await sample(800, 600);
check("radial: centre ≈ stop[0]", px, near(px, BASE, 26));
px = await sample(970, 665); // beyond the r2 ellipse, clear of the corner handle
check("radial: corner reaches the far stop", px, px[0] < BASE[0] - 40);

// 7) stops: add one (midpoint clone of the selected), select the LAST marker,
//    recolour it via the swatch input — two streamed events must settle to ONE
//    undo step (the transient mechanism).
check("stops: count starts 1/2", await rowText("Stop"), (await rowText("Stop"))?.includes("1/2"));
await rowStep("Stop", "up", 1); // Plus button is first in the Stop cell
check("stops: add → selected new stop 2/3", await rowText("Stop"), (await rowText("Stop"))?.includes("2/3"));
await page.evaluate(() => {
  const panel = document.querySelector("div.w-56.border-l");
  const markers = [...panel.querySelectorAll("button")].filter((b) => b.style.left);
  markers.sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left));
  markers[markers.length - 1].click();
});
await sleep(250);
check("stops: last marker click selects 3/3", await rowText("Stop"), (await rowText("Stop"))?.includes("3/3"));
const streamStop = async (hex) =>
  page.evaluate((h) => {
    const panel = document.querySelector("div.w-56.border-l");
    const input = panel.querySelector('input[type="color"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(input, h);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, hex);
await streamStop("#8800ff");
await sleep(120);
await streamStop("#0000ff");
await sleep(950); // > the 600ms settle pause → commitTransient
px = await sample(970, 665);
check("stop swatch: streamed picks recolour the outer stop blue", px, px[2] > 150 && px[0] < 90);
await undo();
px = await sample(970, 665);
check("stop swatch: the stream coalesced to ONE undo step", px, px[0] >= px[2]);

// 8) remove: back to 2 stops; the remove button hits its floor and disables.
await rowStep("Stop", "down", 1); // Minus button is second
check("stops: remove → 2 left", await rowText("Stop"), /\/2/.test((await rowText("Stop")) ?? ""));
const minusDisabled = await page.evaluate(() => {
  const panel = document.querySelector("div.w-56.border-l");
  const row = [...panel.querySelectorAll("div")].find(
    (d) => d.firstElementChild?.tagName === "SPAN" && d.firstElementChild.textContent === "Stop",
  );
  return row.querySelectorAll("button")[1].disabled;
});
check("stops: remove disabled at the 2-stop floor", minusDisabled, minusDisabled === true);

// 9) Solid switch-back adopts stop[0]'s colour as the flat fill.
await clickBtn("solid");
const c1 = await sample(800, 600);
const c2 = await sample(970, 665);
check("solid switch-back: flat stop[0] everywhere", [...c1, ...c2], near(c1, BASE) && near(c2, BASE));

// 10) ratified sink call unchanged: a flat pick REPLACES a gradient fill.
await clickBtn("gradient");
await page.evaluate(() => window.__substrata.colour("#0044cc"));
await sleep(400);
const s1 = await sample(610, 600);
const s2 = await sample(960, 560);
check("sink: flat pick replaces the gradient", [...s1, ...s2], near(s1, [0, 68, 204]) && near(s2, [0, 68, 204]));

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
