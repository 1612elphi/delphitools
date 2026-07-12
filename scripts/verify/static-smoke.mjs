// Deploy-reality smoke over the static export (delete after use).
// Every other harness ran against `npm run dev` — this one serves ./out with
// Cloudflare-Pages-like semantics (clean URLs, real MIME types) and verifies
// the PROD bundle: route sweep, /editor boot (no rig — real DOM events),
// drag-drop import, and the vendored JXL worker+wasm.
// Needs a fresh `npm run build` (out/).
import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = new URL("../../out", import.meta.url).pathname;
const PORT = 8799;
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain",
};
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  // Pages-style resolution: exact file → dir index → path.html → 404.html
  for (const cand of [path, join(path, "index.html"), `${path}.html`]) {
    try {
      const full = join(ROOT, cand);
      if ((await stat(full)).isFile()) {
        res.writeHead(200, { "content-type": MIME[extname(full)] ?? "application/octet-stream" });
        res.end(await readFile(full));
        return;
      }
    } catch {}
  }
  res.writeHead(404, { "content-type": "text/html" });
  res.end(await readFile(join(ROOT, "404.html")).catch(() => "404"));
});
await new Promise((r) => server.listen(PORT, r));
// SMOKE_BASE=https://<preview>.pages.dev reruns every check against a real
// deploy (route names still come from the local out/ listing)
const BASE = process.env.SMOKE_BASE ?? `http://localhost:${PORT}`;

let failures = 0;
const check = (label, detail, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  [${detail}]`);
  if (!ok) failures++;
};

// ── 1. HTTP sweep: home, editor, EVERY tool route, workers/wasm/luts/fonts
const toolPages = (await readdir(join(ROOT, "tools"))).filter((f) => f.endsWith(".html"));
let bad = [];
for (const f of toolPages) {
  const r = await fetch(`${BASE}/tools/${f.replace(/\.html$/, "")}`);
  if (r.status !== 200) bad.push(`${f}:${r.status}`);
}
check(`http: all ${toolPages.length} tool routes 200`, bad.join(",") || "clean", bad.length === 0);
for (const [path, wantType] of [
  ["/", "text/html"],
  ["/editor", "text/html"],
  ["/jxl/jxl-worker.js", "text/javascript"],
  ["/jxl/jxl_enc.js", "text/javascript"],
  ["/jxl/jxl_enc.wasm", "application/wasm"],
]) {
  const r = await fetch(`${BASE}${path}`);
  check(`http: ${path}`, `${r.status} ${r.headers.get("content-type")}`,
    r.status === 200 && r.headers.get("content-type") === wantType);
}
const luts = await readdir(join(ROOT, "substrata/luts")).catch(() => []);
const lutProbe = luts.length ? await fetch(`${BASE}/substrata/luts/${luts[0]}`) : { status: 0 };
check(`http: LUT strips present + served (${luts.length})`, `first=${lutProbe.status}`,
  luts.length >= 16 && lutProbe.status === 200);

// ── 2. PROD /editor boot: no rig — real browser, real events
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--window-size=1500,950"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1460, height: 900 });
const pageErrors = [];
const consoleErrors = [];
const failedReqs = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("response", (r) => r.status() >= 400 && failedReqs.push(`${r.status} ${r.url()}`));
page.on("requestfailed", (r) => r.failure()?.errorText !== "net::ERR_ABORTED" &&
  failedReqs.push(`${r.failure()?.errorText} ${r.url()}`));

await page.goto(`${BASE}/editor`, { waitUntil: "networkidle0" });
await page.waitForSelector("canvas.upper-canvas", { timeout: 20000 });
await new Promise((r) => setTimeout(r, 1500));
check("editor: prod bundle boots (fabric canvas mounts)", "canvas.upper-canvas", true);
const rigAbsent = await page.evaluate(() => window.__substrata === undefined);
check("editor: dev rig stripped from prod", String(!rigAbsent ? "LEAKED" : "absent"), rigAbsent);

// canvas ink census (device-px grid sample off the lower canvas)
const inkCount = () =>
  page.evaluate(() => {
    const c = document.querySelector("canvas.lower-canvas");
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] < 100 && d[i + 3] > 200) dark++;
    return dark;
  });
const inkBefore = await inkCount();

// real drag-drop import: dark 128×128 PNG onto the canvas wrap
await page.evaluate(async () => {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  x.fillStyle = "#1a1a1a";
  x.fillRect(0, 0, 128, 128);
  const blob = await new Promise((res) => c.toBlob(res, "image/png"));
  const dt = new DataTransfer();
  dt.items.add(new File([blob], "drop.png", { type: "image/png" }));
  const target = document.querySelector("canvas.upper-canvas");
  const r = target.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, dataTransfer: dt,
    clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  target.dispatchEvent(new DragEvent("dragover", opts));
  target.dispatchEvent(new DragEvent("drop", opts));
});
await new Promise((r) => setTimeout(r, 2000));
const inkAfter = await inkCount();
check("editor: drag-drop import renders pixels", `ink ${inkBefore} → ${inkAfter}`, inkAfter > inkBefore);

// ── 3. JXL worker probe (same origin): encode a 4×4 through the vendored wasm
const jxl = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const w = new Worker("/jxl/jxl-worker.js", { type: "module" });
      const t = setTimeout(() => resolve({ ok: false, error: "timeout 30s" }), 30000);
      w.onmessage = (e) => { clearTimeout(t); resolve({ ok: e.data.ok, bytes: e.data.bytes?.length, error: e.data.error }); };
      w.onerror = (e) => { clearTimeout(t); resolve({ ok: false, error: e.message ?? "worker error" }); };
      // mirrors JXL_ENCODE_DEFAULTS in lib/jxl.ts + export-encode's quality/lossless
      w.postMessage({ id: 1, data: new Uint8ClampedArray(4 * 4 * 4).fill(128), width: 4, height: 4,
        options: { effort: 7, progressive: false, epf: -1, lossyPalette: false, decodingSpeedTier: 0,
          photonNoiseIso: 0, lossyModular: false, quality: 90, lossless: false } });
    }),
);
check("jxl: vendored worker+wasm encode", JSON.stringify(jxl), jxl.ok === true && jxl.bytes > 0);

// ── 4. home + one tool page boot clean
for (const path of ["/", "/tools/image-converter"]) {
  const p = await browser.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await p.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));
  check(`boot: ${path} error-free`, errs.join(" | ") || "clean", errs.length === 0);
  await p.close();
}

check("editor: zero pageerrors", pageErrors.join(" | ") || "none", pageErrors.length === 0);
check("editor: zero console errors", consoleErrors.slice(0, 3).join(" | ") || "none", consoleErrors.length === 0);
check("editor: zero failed requests", failedReqs.slice(0, 5).join(" | ") || "none", failedReqs.length === 0);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
await browser.close();
server.close();
process.exit(failures ? 1 : 0);
