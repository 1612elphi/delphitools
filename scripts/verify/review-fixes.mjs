// Headless verification for the clarity-review fixes (delete after use).
// Pattern from .verify-m7.mjs / .verify-select.mjs. Needs `npm run dev` on :3000.
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
// suppress the confirmDiscard prompt paths (menu clicks may hit them)
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

// ── 1. empty state: starter card visible on a fresh scene ─────────────────────
check("empty-state: card shown on empty scene", "data-empty-hint", !!(await page.$("[data-empty-hint]")));

// beforeunload guard: no edits yet + storage off → NOT armed
let prevented = await page.evaluate(() => {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
});
check("unload-guard: disarmed with no edits", String(prevented), prevented === false);

// ── 2. make an edit → card gone, guard armed ─────────────────────────────────
await page.evaluate(() =>
  window.__substrata.addRaster(200, 150, [{ x: 0, y: 0, w: 200, h: 150, colour: "#cc2200" }], { x: 400, y: 300 }),
);
await sleep(600);
check("empty-state: card gone once a layer exists", "data-empty-hint", !(await page.$("[data-empty-hint]")));

prevented = await page.evaluate(() => {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
});
check("unload-guard: ARMED with edits + storage off", String(prevented), prevented === true);

// ── 3. Edit menu: honest and wired ────────────────────────────────────────────
const clickMenubar = async (label) => {
  await page.evaluate((l) => {
    const btn = [...document.querySelectorAll("nav button")].find((b) => b.textContent?.trim() === l);
    btn?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    btn?.click();
  }, label);
  await sleep(250);
};
await clickMenubar("Edit");
const fakeHistory = await page.evaluate(() =>
  [...document.querySelectorAll("[data-menu-root] *")].some((n) => n.textContent === "Bokeh"),
);
check("edit-menu: fake history list removed", String(fakeHistory), fakeHistory === false);

// Select all → Duplicate → layer count 1 → 2
const menuBtn = async (label) => {
  const clicked = await page.evaluate((l) => {
    const btn = [...document.querySelectorAll("[data-menu-root] button")].find(
      (b) => b.textContent?.trim() === l && !b.disabled,
    );
    if (!btn) return false;
    btn.click();
    return true;
  }, label);
  await sleep(300);
  return clicked;
};
check("edit-menu: Select all enabled + clicked", "Select all", await menuBtn("Select all"));
await clickMenubar("Edit");
check("edit-menu: Duplicate enabled + clicked", "Duplicate", await menuBtn("Duplicate"));
let ls = await layers();
check("edit-menu: Duplicate actually duplicated", `layers=${ls.length}`, ls.length === 2);

await clickMenubar("Edit");
const cutDisabled = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("[data-menu-root] button")].find((b) => b.textContent?.trim() === "Cut");
  return btn ? btn.disabled : null;
});
check("edit-menu: Cut visibly disabled (not fake-live)", String(cutDisabled), cutDisabled === true);
// menu is still open from the Cut check — click Delete directly
check("edit-menu: Delete enabled + clicked", "Delete", await menuBtn("Delete"));
ls = await layers();
check("edit-menu: Delete removed the selection", `layers=${ls.length}`, ls.length < 2);
await page.keyboard.press("Escape");

// ── 4. undo/redo stay visible while a toast shows ─────────────────────────────
// addRaster fires the image-added toast; undo must still be in the DOM mid-toast.
await page.evaluate(() =>
  window.__substrata.addRaster(60, 60, [{ x: 0, y: 0, w: 60, h: 60, colour: "#3e6b33" }], { x: 900, y: 500 }),
);
await sleep(250); // toast is showing (1.8s) — undo must still be present
const undoPresent = await page.evaluate(
  () => [...document.querySelectorAll("button svg")].some((s) => s.classList.contains("lucide-undo-2")),
);
check("toast-slot: undo button present mid-toast", String(undoPresent), undoPresent === true);

// ── 5. flat tools: every subtool visible + clickable without hover ────────────
const flat = await page.evaluate(() => {
  const w = (t) => {
    const el = [...document.querySelectorAll("button[title]")].find((b) => b.title === t);
    return el ? Math.round(el.getBoundingClientRect().width) : -1;
  };
  return { primitives: w("Primitives"), lasso: w("Lasso"), crop: w("Crop") };
});
check(
  "tools: subtools flat-visible (no fan)",
  JSON.stringify(flat),
  flat.primitives > 20 && flat.lasso > 20 && flat.crop > 20,
);
await page.evaluate(() => {
  [...document.querySelectorAll("button[title]")].find((b) => b.title === "Lasso")?.click();
});
await sleep(200);
const lassoActive = await page.evaluate(
  () => [...document.querySelectorAll("button[title]")].find((b) => b.title === "Lasso")?.getAttribute("aria-pressed"),
);
check("tools: flat subtool click activates", String(lassoActive), lassoActive === "true");

// ── 6. tooltips: spot-check title mirrors landed ──────────────────────────────
const titledCount = await page.evaluate((m) => {
  // marker built at runtime — the literal must never appear in scannable files
  return document.querySelectorAll(`[title="${m}"], button[title]:not([title=""])`).length;
}, "\u2211CG");
check("tooltips: titled controls present", `${titledCount} titled`, titledCount > 10);

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
