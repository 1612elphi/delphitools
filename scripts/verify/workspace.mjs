// Headless verification for the round-3 workspace: omnibar units, float/mini/clamp panels, edge docking.
// Pattern from .verify-review-fixes.mjs. Needs `npm run dev` on :3000.
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
// pre-pin Layers to the rail so a module header (with grip) is on screen
await page.evaluateOnNewDocument(() => {
  localStorage.setItem("substrata:layout:pinned", JSON.stringify(["layers"]));
  localStorage.setItem("substrata:layout:moduleDock", JSON.stringify({ layers: "rail" }));
});
await page.goto(URL, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.__substrata, { timeout: 20000 });
await sleep(800);

const check = (label, detail, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  [${detail}]`);
  if (!ok) failures++;
};

// ── 1. Workspace menu: dock rows gone, Guides has an icon ─────────────────────
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("nav button")].find((b) => b.textContent?.trim() === "Workspace");
  btn?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  btn?.click();
});
await sleep(250);
const menu = await page.evaluate(() => {
  const root = document.querySelector("[data-menu-root] .shadow-lg");
  const textAll = root?.textContent ?? "";
  const guidesCell = root?.querySelector('span[title="Guides"]');
  return {
    hasDockModules: textAll.includes("Dock modules"),
    hasOmnibarRow: textAll.includes("Omnibar"),
    hasRailRow: /Rail/.test(textAll),
    guidesHasIcon: !!guidesCell?.querySelector("svg"),
    hasZoom: textAll.includes("Zoom"),
    hasGuides: textAll.includes("Guides"),
  };
});
check("menu: Dock-modules section removed", JSON.stringify(menu), !menu.hasDockModules && !menu.hasOmnibarRow && !menu.hasRailRow);
check("menu: Zoom + Guides rows remain", `zoom=${menu.hasZoom} guides=${menu.hasGuides}`, menu.hasZoom && menu.hasGuides);
check("menu: Guides seg cell has an icon", String(menu.guidesHasIcon), menu.guidesHasIcon === true);
await page.keyboard.press("Escape");
await page.evaluate(() => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
await sleep(200);

// ── 2. UX pass (bar still horizontal): four units · flush · inline settings ──
const ux = await page.evaluate(() => {
  const dock = document.querySelector("div.pointer-events-none.absolute.z-40");
  const units = [...(dock?.querySelectorAll(":scope .pointer-events-auto.shadow-lg") ?? [])]
    .filter((el) => !el.querySelector(".pointer-events-auto.shadow-lg")); // leaf boxes only
  const toolsUnit = units[0];
  const byTitle = (t) => [...(toolsUnit?.querySelectorAll("button[title]") ?? [])].find((b) => b.title === t);
  const active = toolsUnit?.querySelector("button[aria-pressed='true']");
  const big = dock?.querySelector("button.size-12 span[style*='background-color']");
  const heights = units.map((u) => Math.round(u.getBoundingClientRect().height));
  return {
    unitCount: units.length,
    subtools: !!byTitle("Primitives") && !!byTitle("Lasso") && !!byTitle("Crop"),
    flush: active ? Math.round(active.getBoundingClientRect().height) : -1,
    barH: toolsUnit ? Math.round(toolsUnit.getBoundingClientRect().height) : -1,
    bigColour: !!big,
    uniform: heights.every((h) => h === heights[0]),
  };
});
// 4 omnibar units (tools/settings/panels/colour) — the rail is pre-pinned and
// counted separately by its own box, hence the leaf filter + >= check on 4
check("ux: four separated units (+rail)", `${ux.unitCount} boxes`, ux.unitCount >= 4 && ux.unitCount <= 5);
check("ux: subtools flat in tools unit", String(ux.subtools), ux.subtools === true);
check("ux: selected tool flush (fills bar height)", `${ux.flush}px of ${ux.barH}px`, ux.flush > 0 && ux.flush === ux.barH - 2);
check("ux: units uniformly high", String(ux.uniform), ux.uniform === true);
// settings unit: contextual trigger shows the subtool name; click pins the module
const unitLabel = await page.evaluate(() => document.querySelector("[data-tool-unit]")?.textContent ?? "");
check("ux: contextual unit names the active subtool", unitLabel.slice(0, 20), unitLabel.includes("Move"));
await page.evaluate(() => document.querySelector("[data-tool-unit]")?.click());
await sleep(400);
const settingsPinned = await page.evaluate(() => {
  const boxes = [...document.querySelectorAll(".shadow-lg")];
  return boxes.some((u) => u.textContent?.includes("Transform") && u.textContent?.includes("Nudge"));
});
check("ux: contextual unit pins the tool module", String(settingsPinned), settingsPinned === true);
await page.evaluate(() => document.querySelector("[data-tool-unit]")?.click());
await sleep(300);
// chips: select a layer with the move tool → X/Y chips appear at a glance
await page.evaluate(() =>
  window.__substrata.addRaster(120, 90, [{ x: 0, y: 0, w: 120, h: 90, colour: "#3e6b33" }], { x: 640, y: 480 }),
);
await sleep(600);
const chipText = await page.evaluate(() => document.querySelector("[data-tool-unit]")?.textContent ?? "");
check("ux: live chips at a glance (X/Y)", chipText.slice(0, 24), /X\s*640/.test(chipText) && /Y\s*480/.test(chipText));

// ── 2b. shortcuts + flyouts + inlined arrange ────────────────────────────────
const pressed = async (title) =>
  page.evaluate((t) => [...document.querySelectorAll("button[title]")].find((b) => b.title === t)?.getAttribute("aria-pressed"), title);
await page.keyboard.press("l");
await sleep(150);
check("keys: L activates Lasso directly", String(await pressed("Lasso")), (await pressed("Lasso")) === "true");
await page.keyboard.press("u");
await sleep(150);
check("keys: U activates Primitives directly", String(await pressed("Primitives")), (await pressed("Primitives")) === "true");
await page.keyboard.press("v");
await sleep(150);

// flyout: hover the Primitives button → shape menu blooms; click Star
const primBtn = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button[title]")].find((x) => x.title === "Primitives");
  const r = b?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
});
await page.mouse.move(primBtn.x, primBtn.y);
await sleep(400); // bloom transition
const starVisible = await page.evaluate(() => {
  // collapsed blooms keep layout — only the OPEN bloom's children are
  // interactive (computed pointer-events inherits auto from the hover state)
  const star = [...document.querySelectorAll("button[title='Star']")].find(
    (b) => b.getBoundingClientRect().height > 0 && getComputedStyle(b).pointerEvents !== "none",
  );
  if (!star) return null;
  const r = star.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
check("flyout: primitives shape menu blooms on hover", JSON.stringify(starVisible), !!starVisible);
if (starVisible) {
  await page.mouse.click(starVisible.x, starVisible.y);
  await sleep(200);
  const starPicked = await page.evaluate(
    () => [...document.querySelectorAll("button[title='Star']")].some((b) => b.getAttribute("aria-pressed") === "true"),
  );
  const primArmed = await pressed("Primitives");
  check("flyout: picking Star sets shape + arms subtool", `star=${starPicked} armed=${primArmed}`, starPicked && primArmed === "true");
}
const arrangeInline = await page.evaluate(
  () => [...document.querySelectorAll("button[title]")].some((b) => b.title === "Arrange"),
);
check("panels: Arrange inlined (no More toggle)", String(arrangeInline), arrangeInline === true);
const moreGone = await page.evaluate(
  () => ![...document.querySelectorAll("button")].some((b) => b.title === "More tools"),
);
check("panels: overflow toggle removed", String(moreGone), moreGone === true);
check("ux: full-height colour swatch unit", String(ux.bigColour), ux.bigColour === true);

// ── 2c. round-3 float: drag out of the rail → floats · mini/hover · clamp ────
const gripRect = await page.evaluate(() => {
  const grip = [...document.querySelectorAll("span.cursor-grab")].find((el) => {
    const header = el.parentElement;
    return header && header.textContent?.toUpperCase().includes("LAYERS");
  });
  if (!grip) return null;
  const r = grip.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
check("float: layers module grip found", JSON.stringify(gripRect), !!gripRect);

if (gripRect) {
  await page.mouse.move(gripRect.x, gripRect.y);
  await page.mouse.down();
  await page.mouse.move(gripRect.x + 40, gripRect.y - 40, { steps: 4 }); // past threshold → zone appears
  await sleep(200);
  const zonesUp = await page.evaluate(() => document.querySelectorAll("[data-dock-zone]").length);
  check("float: only the rail zone appears mid-drag", `${zonesUp} zone`, zonesUp === 1);
  // drop on open canvas, well away from the rail zone
  await page.mouse.move(420, 260, { steps: 6 });
  await sleep(150);
  await page.mouse.up();
  await sleep(500);
  const floated = await page.evaluate(() => {
    const el = document.querySelector("[data-float-panel='layers']");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), h: Math.round(r.height) };
  });
  check("float: panel floats near the drop point", JSON.stringify(floated), !!floated && Math.abs(floated.x - 410) < 30 && Math.abs(floated.y - 250) < 60);
  // pointer landed on the panel → full; move away → MINI (header-only)
  await page.mouse.move(1200, 700, { steps: 4 });
  await sleep(300);
  const miniH = await page.evaluate(() => Math.round(document.querySelector("[data-float-panel='layers']")?.getBoundingClientRect().height ?? -1));
  check("float: idle panel goes mini (header-only)", `${miniH}px`, miniH > 0 && miniH < 44);
  // hover → expands to the full panel in place
  await page.mouse.move(floated.x + 60, floated.y + 12, { steps: 4 });
  await sleep(300);
  const fullState = await page.evaluate(() => {
    const el = document.querySelector("[data-float-panel='layers']");
    return { h: Math.round(el?.getBoundingClientRect().height ?? -1), body: el?.textContent?.includes("Upload") ?? false };
  });
  check("float: hover expands to the full panel", JSON.stringify(fullState), fullState.h > 120 && fullState.body === true);
  // clamp: click the clamp toggle, move away → stays full
  await page.evaluate(() => document.querySelector("[data-float-panel='layers'] button[title='Pin open']")?.click());
  await sleep(150);
  await page.mouse.move(1200, 700, { steps: 4 });
  await sleep(300);
  const clampedH = await page.evaluate(() => Math.round(document.querySelector("[data-float-panel='layers']")?.getBoundingClientRect().height ?? -1));
  check("float: pin holds it full-size when idle", `${clampedH}px`, clampedH > 120);
  // unclamp → mini again
  await page.mouse.move(floated.x + 60, floated.y + 12, { steps: 4 });
  await sleep(200);
  await page.evaluate(() => document.querySelector("[data-float-panel='layers'] button[title='Unpin']")?.click());
  await page.mouse.move(1200, 700, { steps: 4 });
  await sleep(300);
  const unclampedH = await page.evaluate(() => Math.round(document.querySelector("[data-float-panel='layers']")?.getBoundingClientRect().height ?? -1));
  check("float: unpin returns to mini", `${unclampedH}px`, unclampedH > 0 && unclampedH < 44);
  // drag the floating panel onto the rail zone → re-docks
  const floatGrip = await page.evaluate(() => {
    const grip = document.querySelector("[data-float-panel='layers'] span.cursor-grab");
    const r = grip?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  });
  await page.mouse.move(floatGrip.x, floatGrip.y);
  await page.mouse.down();
  await page.mouse.move(floatGrip.x + 30, floatGrip.y + 30, { steps: 4 });
  await sleep(200);
  const railZone = await page.evaluate(() => {
    const z = document.querySelector("[data-dock-zone='rail']");
    const r = z?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  });
  await page.mouse.move(railZone.x, railZone.y, { steps: 6 });
  await sleep(150);
  await page.mouse.up();
  await sleep(500);
  const redocked = await page.evaluate(() => {
    const floatGone = !document.querySelector("[data-float-panel='layers']");
    const railHasLayers = [...document.querySelectorAll(".shadow-lg")].some(
      (u) => u.textContent?.toUpperCase().includes("LAYERS") && u.textContent?.includes("Upload"),
    );
    return { floatGone, railHasLayers };
  });
  check("float: drop on rail zone re-docks", JSON.stringify(redocked), redocked.floatGone && redocked.railHasLayers);
}

// ── 3. omnibar drag → left edge ───────────────────────────────────────────────
const omniGrip = await page.evaluate(() => {
  const bar = document.querySelector(".pointer-events-auto.border.shadow-lg");
  const grip = bar?.querySelector("span.cursor-grab");
  if (!grip) return null;
  const r = grip.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
check("drag: omnibar grip found", JSON.stringify(omniGrip), !!omniGrip);
if (omniGrip) {
  await page.mouse.move(omniGrip.x, omniGrip.y);
  await page.mouse.down();
  await page.mouse.move(omniGrip.x + 30, omniGrip.y - 60, { steps: 4 });
  await sleep(200);
  const edgeZones = await page.evaluate(() => document.querySelectorAll("[data-dock-zone]").length);
  check("drag: four edge zones for omnibar", `${edgeZones} zones`, edgeZones === 4);
  const leftZone = await page.evaluate(() => {
    const z = document.querySelector('[data-dock-zone="left"]');
    const r = z?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  });
  await page.mouse.move(leftZone.x, leftZone.y, { steps: 6 });
  await sleep(150);
  await page.mouse.up();
  await sleep(500);
  const vertical = await page.evaluate(() => {
    const bar = document.querySelector(".pointer-events-auto.border.shadow-lg");
    return bar?.className.includes("flex-col") && bar.getBoundingClientRect().left < 200;
  });
  check("drag: omnibar re-docked to left edge (vertical)", String(vertical), vertical === true);
}

// ── 4. fit centres in the FREE area, not under the chrome ────────────────────
// Regression: fitView used to centre in the raw canvas element, so the artboard
// sat under the omnibar dock (and behind the ruler bands) on every fit.
const fitGeom = async () => {
  await page.evaluate(() => document.querySelector('button[title*="Fit"], button[aria-label*="Fit"]')?.click());
  await sleep(300);
  return page.evaluate(() => {
    const vt = window.__substrata.vt();
    const el = document.querySelector("canvas");
    const box = el.getBoundingClientRect();
    // default scene: 2000 × 1500
    const art = { left: vt[4], top: vt[5], right: vt[4] + 2000 * vt[0], bottom: vt[5] + 1500 * vt[3] };
    const free = { top: 22, right: box.width, bottom: box.height, left: 22 };
    for (const dock of document.querySelectorAll(".sub-omni-dock, .sub-omni-rail-dock")) {
      const r = dock.getBoundingClientRect();
      if (dock.classList.contains("is-top")) free.top = Math.max(free.top, r.height);
      else if (dock.classList.contains("is-bottom")) free.bottom = Math.min(free.bottom, box.height - r.height);
      else if (dock.classList.contains("is-left")) free.left = Math.max(free.left, r.width);
      else if (dock.classList.contains("is-right")) free.right = Math.min(free.right, box.width - r.width);
    }
    return { art, free };
  });
};

for (const [where, geom] of [["left-docked omnibar", await fitGeom()]]) {
  const { art, free } = geom;
  const inside = art.left >= free.left - 1 && art.right <= free.right + 1 && art.top >= free.top - 1 && art.bottom <= free.bottom + 1;
  const dx = (art.left - free.left) - (free.right - art.right);
  const dy = (art.top - free.top) - (free.bottom - art.bottom);
  check(`fit (${where}): artboard clears the chrome`, JSON.stringify({ art, free }), inside);
  check(`fit (${where}): centred in the free area`, `dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}`, Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5);
}

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
