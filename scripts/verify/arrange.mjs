// ARRANGE module (substrata): align to the artboard, distribute, rotate and
// flip over the whole selection, each as ONE undo step.
// Needs `npm start` on :3000.
//
// Regression guard: the module was registered with an empty ModuleStub body
// through the Ember port, so the panel opened blank.
import { BASE, check, finish, launch, openModule, sleep } from './harness.mjs';

const { browser, page } = await launch({ viewport: { width: 1500, height: 950 } });
await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => window.__substrata, { timeout: 25000 });
await sleep(600);

check("omnibar Arrange trigger found", await openModule(page, "Arrange"));

const gated = await page.evaluate(() => ({
  empty: !!document.querySelector(".sub-arr-empty"),
  rows: document.querySelectorAll(".sub-arr-row").length,
  stub: !!document.querySelector(".sub-module-stub"),
}));
check("panel body renders (not the stub)", !gated.stub, JSON.stringify(gated));
check("no selection shows the gate hint", gated.empty && gated.rows === 0, JSON.stringify(gated));

const add = (w, h, colour, at) =>
  page.evaluate(
    ([wd, ht, c, pos]) => window.__substrata.addRaster(wd, ht, [{ x: 0, y: 0, w: wd, h: ht, colour: c }], pos),
    [w, h, colour, at],
  );
await add(200, 100, "#3b6ea5", { x: 1400, y: 400 });
await sleep(500);

const armed = await page.evaluate(() => ({
  rows: document.querySelectorAll(".sub-arr-row").length,
  buttons: document.querySelectorAll(".sub-arr-btn").length,
  titles: [...document.querySelectorAll(".sub-arr-title")].map((s) => s.textContent.trim()),
  glyphs: [...document.querySelectorAll(".sub-arr-btn")].filter((b) => b.querySelector("svg")).length,
  disabled: [...document.querySelectorAll(".sub-arr-btn")].filter((b) => b.disabled).length,
}));
check("three sections render", JSON.stringify(armed.titles) === '["Align","Distribute","Rotate & flip"]', JSON.stringify(armed.titles));
check("twelve action cells", armed.buttons === 12, `${armed.buttons} cells`);
check("every cell has a glyph", armed.glyphs === 12, `${armed.glyphs}/12`);
// distribute needs 3+ sized layers; with one selected only its two cells grey out
check("distribute greys out under 3 layers", armed.disabled === 2, `${armed.disabled} disabled`);

const clickCell = async (aria) => {
  await page.evaluate((a) => document.querySelector(`.sub-arr-btn[aria-label="${a}"]`)?.click(), aria);
  await sleep(400);
};
const scene = async () => (await page.evaluate(() => window.__substrata.layers()))[0].scene;

// align left: a 200-wide layer lands with its centre at half its width
await clickCell("Left align");
let s = await scene();
check("left align snaps to the artboard edge", Math.abs(s.x - 100) < 0.5, JSON.stringify(s));

// centre align (hor) on the default 2000-wide artboard
await clickCell("Centre align (hor)");
s = await scene();
check("centre align (hor) snaps to the artboard middle", Math.abs(s.x - 1000) < 0.5, JSON.stringify(s));

await clickCell("Bottom align");
s = await scene();
check("bottom align snaps to the artboard foot", Math.abs(s.y - 1450) < 0.5, JSON.stringify(s));

// rotate is per-layer, around its own centre
await clickCell("Rotate right");
const angle = await page.evaluate(() => window.__substrata.selection().box?.angle);
check("rotate right turns the layer 90°", angle === 90, String(angle));

// flip is a toggle and the cell reflects it
await clickCell("Flip horizontal");
const flipped = await page.evaluate(() => ({
  active: !!document.querySelector('.sub-arr-btn[aria-label="Flip horizontal"]')?.classList.contains("is-active"),
}));
check("flip horizontal lights its cell", flipped.active, JSON.stringify(flipped));
await clickCell("Flip horizontal");
const unflipped = await page.evaluate(
  () => !document.querySelector('.sub-arr-btn[aria-label="Flip horizontal"]')?.classList.contains("is-active"),
);
check("flip toggles back off", unflipped);

// one undo per action: the bottom-align above moved exactly one layer
await page.keyboard.down("Meta");
await page.keyboard.press("z");
await page.keyboard.up("Meta");
await sleep(400);
const afterUndo = await page.evaluate(() => window.__substrata.selection().box?.angle);
check("each action is one undo step", afterUndo === 90, `angle=${afterUndo}`);

// three layers enable distribute, and it spreads their centres evenly
await add(100, 100, "#cc2200", { x: 300, y: 900 });
await add(100, 100, "#e8b13c", { x: 700, y: 900 });
await sleep(500);
await page.evaluate(() => window.__substrata.select(window.__substrata.layers().map((l) => l.id)));
await sleep(400);
const enabled = await page.evaluate(
  () => !document.querySelector('.sub-arr-btn[aria-label="Distribute horizontally"]')?.disabled,
);
check("distribute enables with 3 selected", enabled);
await clickCell("Distribute horizontally");
const xs = (await page.evaluate(() => window.__substrata.layers().map((l) => l.scene.x))).sort((a, b) => a - b);
const gaps = xs.slice(1).map((x, i) => x - xs[i]);
const even = gaps.length === 2 && Math.abs(gaps[0] - gaps[1]) < 0.5;
check("distribute spaces the centres evenly", even, `xs=${xs.map((x) => x.toFixed(1))} gaps=${gaps.map((g) => g.toFixed(1))}`);

await finish(browser);
