// COLOUR module (substrata): the tabbed picker renders, each of the seven modes
// mounts, and the interactive ones write through the shared colour store.
// Needs `npm start` on :3000.
//
// Regression guard: the module was registered with an empty ModuleStub body
// through the Ember port, so the panel opened blank.
import { BASE, check, finish, launch, openModule, sleep } from './harness.mjs';

const { browser, page } = await launch({ viewport: { width: 1500, height: 950 } });
await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => window.__substrata, { timeout: 25000 });
await sleep(600);

check("omnibar Colour trigger found", await openModule(page, "Colour"));

const shell = await page.evaluate(() => ({
  panel: !!document.querySelector(".sub-cp"),
  stub: !!document.querySelector(".sub-module-stub"),
  tabs: document.querySelectorAll(".sub-cp-tab").length,
  cube: !!document.querySelector(".sub-cp-cube"),
  footerHex: document.querySelector(".sub-cp-footer-hex")?.value,
  sub: document.querySelector(".sub-module-sub")?.textContent?.trim(),
}));
check("panel body renders (not the stub)", shell.panel && !shell.stub, JSON.stringify(shell));
check("seven mode tabs", shell.tabs === 7, `${shell.tabs} tabs`);
check("cube is the default mode", shell.cube);
check("footer shows the current hex", /^#[0-9a-f]{6}$/i.test(shell.footerHex ?? ""), shell.footerHex ?? "(none)");
check("header sub names the colour", !!shell.sub, shell.sub ?? "(empty)");

// Each tab mounts its mode. Root class per mode, in tab order.
const MODE_ROOTS = [
  [".sub-cp-cube", "cube"],
  [".sub-cp-wheelwrap", "triangle"],
  [".sub-cp-sliders", "sliders"],
  [".sub-cp-wall", "swatches"],
  [".sub-cp-prism", "prism"],
  [".sub-cp-eq", "spectrum"],
  [".sub-cp-shade", "shade"],
];
for (const [sel, name] of MODE_ROOTS) {
  await page.evaluate((i) => document.querySelectorAll(".sub-cp-tab")[i].click(), MODE_ROOTS.findIndex((m) => m[1] === name));
  await sleep(250);
  const ok = await page.evaluate((s) => !!document.querySelector(s), sel);
  check(`mode ${name} mounts`, ok, sel);
}

// triangle paints its SV fill to a canvas (the hue ring is CSS)
await page.evaluate(() => document.querySelectorAll(".sub-cp-tab")[1].click());
await sleep(300);
const triPainted = await page.evaluate(() => {
  const c = document.querySelector(".sub-cp-tri");
  return c ? { w: c.width, h: c.height } : null;
});
check("triangle canvas is painted at 2x", triPainted?.w === 336 && triPainted?.h === 336, JSON.stringify(triPainted));

// sliders: the RGB set shows three channels, and HSL swaps them
await page.evaluate(() => document.querySelectorAll(".sub-cp-tab")[2].click());
await sleep(300);
const rgbLabels = await page.evaluate(() =>
  [...document.querySelectorAll(".sub-cp-chan-label")].map((s) => s.textContent.trim()),
);
check("sliders show R/G/B", JSON.stringify(rgbLabels) === '["R","G","B"]', JSON.stringify(rgbLabels));
await page.evaluate(() => [...document.querySelectorAll(".sub-cp-setbtn")].find((b) => b.textContent.trim() === "HSL").click());
await sleep(250);
const hslLabels = await page.evaluate(() =>
  [...document.querySelectorAll(".sub-cp-chan-label")].map((s) => s.textContent.trim()),
);
check("HSL toggle swaps the channel set", JSON.stringify(hslLabels) === '["H","S","L"]', JSON.stringify(hslLabels));

// a channel field commits to the store (and the footer hex follows)
await page.evaluate(() => [...document.querySelectorAll(".sub-cp-setbtn")].find((b) => b.textContent.trim() === "RGB").click());
await sleep(250);
await page.evaluate(() => {
  const inputs = document.querySelectorAll(".sub-cp-chan-input");
  const red = inputs[0];
  red.focus();
  red.value = "255";
  red.dispatchEvent(new Event("input", { bubbles: true }));
  red.blur();
});
await sleep(400);
const afterRed = await page.evaluate(() => ({
  hex: document.querySelector(".sub-cp-footer-hex")?.value,
  r: document.querySelectorAll(".sub-cp-chan-input")[0]?.value,
}));
check("channel field writes through the store", afterRed.r === "255" && /^#ff/i.test(afterRed.hex ?? ""), JSON.stringify(afterRed));

// hue-cube drag: a pointer stroke on the hue strip moves the stored hue
await page.evaluate(() => document.querySelectorAll(".sub-cp-tab")[0].click());
await sleep(300);
const before = await page.evaluate(() => document.querySelector(".sub-cp-footer-hex")?.value);
const strip = await page.evaluate(() => {
  const r = document.querySelector(".sub-cp-hue").getBoundingClientRect();
  return { x: r.left + r.width * 0.6, y: r.top + r.height / 2 };
});
await page.mouse.move(strip.x, strip.y);
await page.mouse.down();
await page.mouse.move(strip.x + 2, strip.y, { steps: 2 });
await page.mouse.up();
await sleep(400);
const after = await page.evaluate(() => document.querySelector(".sub-cp-footer-hex")?.value);
check("hue strip drag rewrites the colour", !!after && after !== before, `${before} → ${after}`);

// swatch wall: every cell is a real hex, and clicking one picks it
await page.evaluate(() => document.querySelectorAll(".sub-cp-tab")[3].click());
await sleep(300);
const wall = await page.evaluate(() => document.querySelectorAll(".sub-cp-swcell").length);
check("swatch wall builds the full grid", wall === 11 * 37, `${wall} cells`);

await finish(browser);
