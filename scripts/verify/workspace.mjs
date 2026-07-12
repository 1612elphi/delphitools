// Headless verification for workspace drag-to-dock + menu slim-down (delete after use).
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

// ── 2. module drag: rail → right sidebar ─────────────────────────────────────
const gripRect = await page.evaluate(() => {
  const grip = [...document.querySelectorAll("span.cursor-grab")].find((el) => {
    const header = el.parentElement;
    return header && header.textContent?.toUpperCase().includes("LAYERS");
  });
  if (!grip) return null;
  const r = grip.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
check("drag: layers module grip found", JSON.stringify(gripRect), !!gripRect);

if (gripRect) {
  await page.mouse.move(gripRect.x, gripRect.y);
  await page.mouse.down();
  await page.mouse.move(gripRect.x + 40, gripRect.y - 40, { steps: 4 }); // past threshold → zones appear
  await sleep(200);
  const zonesUp = await page.evaluate(() => document.querySelectorAll("[data-dock-zone]").length);
  check("drag: drop zones appear mid-drag", `${zonesUp} zones`, zonesUp === 3);
  // drop on the RIGHT zone
  const target = await page.evaluate(() => {
    const z = document.querySelector('[data-dock-zone="right"]');
    if (!z) return null;
    const r = z.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await sleep(150);
  await page.mouse.up();
  await sleep(500);
  const docked = await page.evaluate(() => {
    const zonesGone = document.querySelectorAll("[data-dock-zone]").length === 0;
    const sidebars = [...document.querySelectorAll("div")].filter((d) => d.className.includes?.("border-l"));
    const inRight = sidebars.some((d) => d.textContent?.toUpperCase().includes("LAYERS"));
    return { zonesGone, inRight };
  });
  check("drag: zones clear after drop", String(docked.zonesGone), docked.zonesGone);
  check("drag: layers docked to right sidebar", String(docked.inRight), docked.inRight === true);
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

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
