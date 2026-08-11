// LOOKS module (substrata): the film-sim / LUT gallery populates with live
// thumbnails, picking a card writes the one film-sim filter, and the intensity
// slider follows. Needs `npm start` on :3000.
//
// Regression guard: the module was registered with an empty ModuleStub body
// through the Ember port, so the panel opened blank.
import { BASE, check, finish, launch, openModule, sleep } from './harness.mjs';

const { browser, page } = await launch({ viewport: { width: 1500, height: 950 } });
await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => window.__substrata, { timeout: 25000 });
await sleep(600);

// a raster layer for the gallery to grade — looks apply to pixels only
await page.evaluate(() =>
  window.__substrata.addRaster(
    320,
    200,
    [
      { x: 0, y: 0, w: 320, h: 200, colour: "#3b6ea5" },
      { x: 40, y: 40, w: 160, h: 120, colour: "#d9a441" },
    ],
    { x: 1000, y: 750 },
  ),
);
await sleep(600);

check("omnibar Looks trigger found", await openModule(page, "Looks"));
// LUT strips load async; the epoch subscription redraws each thumb as it lands
await sleep(2000);

const state = await page.evaluate(() => {
  const cards = [...document.querySelectorAll(".sub-look-card")];
  return {
    panel: !!document.querySelector(".sub-looks"),
    stub: !!document.querySelector(".sub-module-stub"),
    cards: cards.length,
    thumbs: cards.filter((c) => c.querySelector("img")).length,
    none: !!document.querySelector(".sub-look-none.is-active"),
    slider: !!document.querySelector(".sub-look-intensity .sub-slider"),
  };
});
check("panel body renders (not the stub)", state.panel && !state.stub, JSON.stringify(state));
check("gallery holds the whole shelf", state.cards >= 16, `${state.cards} cards`);
check("every card graded a live thumbnail", state.thumbs === state.cards, `${state.thumbs}/${state.cards}`);
check("None is active with no look set", state.none);
check("intensity slider present", state.slider);

await page.evaluate(() => document.querySelectorAll(".sub-look-card")[1].click());
await sleep(600);
const picked = await page.evaluate(() => ({
  sub: document.querySelector(".sub-module-sub")?.textContent?.trim(),
  active: document.querySelectorAll(".sub-look-card.is-active").length,
  none: !!document.querySelector(".sub-look-none.is-active"),
  disabled: document.querySelector(".sub-look-intensity .sub-slider")?.disabled,
  filters: window.__substrata.layers().map((l) => l.filters),
}));
check("picking a card sets exactly one active look", picked.active === 1 && !picked.none, JSON.stringify(picked));
check("the look is the one film-sim filter", JSON.stringify(picked.filters) === '[["film-sim"]]', JSON.stringify(picked.filters));
check("header sub names the look", !!picked.sub, picked.sub ?? "(empty)");
check("slider enables once a look is set", picked.disabled === false);

// intensity: input opens the transient, change settles it (one undo step)
await page.evaluate(() => {
  const s = document.querySelector(".sub-look-intensity .sub-slider");
  s.value = "40";
  s.dispatchEvent(new Event("input", { bubbles: true }));
  s.dispatchEvent(new Event("change", { bubbles: true }));
});
await sleep(400);
const intensity = await page.evaluate(() => document.querySelector(".sub-look-intensity-value")?.textContent?.trim());
check("intensity write round-trips through the doc", intensity === "40%", intensity ?? "(none)");

await page.evaluate(() => document.querySelector(".sub-look-none").click());
await sleep(500);
const cleared = await page.evaluate(() => ({
  none: !!document.querySelector(".sub-look-none.is-active"),
  filters: window.__substrata.layers().map((l) => l.filters),
}));
check("None clears the look", cleared.none && JSON.stringify(cleared.filters) === "[[]]", JSON.stringify(cleared));

await finish(browser);
