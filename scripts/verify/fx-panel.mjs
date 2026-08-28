// needs `npm start` on :3000
// regression: empty ModuleStub body made panel open blank
import { BASE, check, finish, launch, openModule, sleep } from './harness.mjs';

const { browser, page } = await launch({ viewport: { width: 1500, height: 950 } });
await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => window.__substrata, { timeout: 25000 });
await sleep(600);

check("omnibar FX trigger found", await openModule(page, "FX"));
const gated = await page.evaluate(() => ({
  empty: !!document.querySelector(".sub-fx-empty"),
  pipeline: !!document.querySelector(".sub-fx-pipeline"),
  stub: !!document.querySelector(".sub-module-stub"),
}));
check("panel body renders (not the stub)", !gated.stub, JSON.stringify(gated));
check("no selection shows the gate hint", gated.empty && !gated.pipeline, JSON.stringify(gated));

await page.evaluate(() =>
  window.__substrata.addRaster(320, 200, [{ x: 0, y: 0, w: 320, h: 200, colour: "#3b6ea5" }], { x: 1000, y: 600 }),
);
await sleep(700);
const armed = await page.evaluate(() => ({
  add: document.querySelector(".sub-fx-add")?.textContent?.trim(),
  sub: document.querySelector(".sub-module-sub")?.textContent?.trim(),
}));
check("a raster selection arms the pipeline", armed.add === "Add Effect", JSON.stringify(armed));
check("header sub names the layer", !!armed.sub, armed.sub ?? "(empty)");

await page.evaluate(() => document.querySelector(".sub-fx-add").click());
await sleep(600);
const picker = await page.evaluate(() => {
  const cards = [...document.querySelectorAll(".sub-fx-pickcard")];
  return {
    cards: cards.length,
    heads: [...document.querySelectorAll(".sub-fx-pickhead-word")].map((s) => s.textContent),
    withIcon: cards.filter((c) => c.querySelector("svg")).length,
    labelled: cards.filter((c) => (c.querySelector(".sub-fx-picklabel")?.textContent ?? "").trim()).length,
  };
});
check("picker holds both groups", JSON.stringify(picker.heads) === '["Filters","Effects"]', JSON.stringify(picker.heads));
check("picker lists every registry type", picker.cards >= 29, `${picker.cards} cards`);
check("every card has a glyph", picker.withIcon === picker.cards, `${picker.withIcon}/${picker.cards}`);
check("every card has a label", picker.labelled === picker.cards, `${picker.labelled}/${picker.cards}`);

await page.evaluate(() => [...document.querySelectorAll(".sub-fx-pickcard")].find((b) => /bright/i.test(b.textContent)).click());
await sleep(700);
const added = await page.evaluate(() => ({
  blocks: document.querySelectorAll(".sub-fx-block").length,
  open: document.querySelectorAll(".sub-fx-body.is-open").length,
  sliders: document.querySelectorAll(".sub-fx-prow .sub-slider").length,
  filters: window.__substrata.layers().map((l) => l.filters),
}));
check("adding writes the filters stack", JSON.stringify(added.filters) === '[["brightness"]]', JSON.stringify(added.filters));
check("the new block opens itself", added.blocks === 1 && added.open === 1, JSON.stringify(added));
check("its slider param renders", added.sliders === 1);

await page.evaluate(() => {
  const s = document.querySelector(".sub-fx-prow .sub-slider");
  s.value = String(Number(s.max) * 0.75);
  s.dispatchEvent(new Event("input", { bubbles: true }));
  s.dispatchEvent(new Event("change", { bubbles: true }));
});
await sleep(400);
const slid = await page.evaluate(() => document.querySelector(".sub-fx-pvalue")?.textContent?.trim());
check("slider write round-trips through the doc", !!slid && slid !== "0", slid ?? "(none)");

await page.evaluate(() => document.querySelector(".sub-fx-add").click());
await sleep(500);
await page.evaluate(() => [...document.querySelectorAll(".sub-fx-pickcard")].find((b) => /drop shadow/i.test(b.textContent)).click());
await sleep(700);
const both = await page.evaluate(() => ({
  blocks: document.querySelectorAll(".sub-fx-block").length,
  divider: !!document.querySelector(".sub-fx-divider"),
  steppers: document.querySelectorAll(".sub-fx-stepper").length,
  colours: document.querySelectorAll(".sub-fx-colour").length,
  open: document.querySelectorAll(".sub-fx-body.is-open").length,
  effects: window.__substrata.layers().map((l) => l.effects),
}));
check("the effect lands in the effects stack", JSON.stringify(both.effects) === '[["drop-shadow"]]', JSON.stringify(both.effects));
check("the two zones are split by the divider", both.blocks === 2 && both.divider, JSON.stringify(both));
check("colour + stepper params render", both.colours === 1 && both.steppers >= 1, JSON.stringify(both));
check("the accordion stays single-open", both.open === 1, `${both.open} open`);

await page.evaluate(() => document.querySelector(".sub-fx-switch input").click());
await sleep(400);
const toggled = await page.evaluate(() => ({
  off: document.querySelectorAll(".sub-fx-block.is-off").length,
}));
check("the switch disables its block", toggled.off === 1, JSON.stringify(toggled));

await page.evaluate(() => document.querySelector('.sub-fx-ctl[aria-label="Remove"]').click());
await sleep(500);
const removed = await page.evaluate(() => ({
  blocks: document.querySelectorAll(".sub-fx-block").length,
  divider: !!document.querySelector(".sub-fx-divider"),
}));
check("remove drops the block and the divider", removed.blocks === 1 && !removed.divider, JSON.stringify(removed));

await finish(browser);
