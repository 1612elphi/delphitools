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
await page.goto(URL, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.__substrata, { timeout: 20000 });
await sleep(400);

const vt = await page.evaluate(() => window.__substrata.vt());
const rect = await page.evaluate(() => {
  const r = document.querySelector("canvas.upper-canvas").getBoundingClientRect();
  return { left: r.left, top: r.top };
});
const toPage = (sx, sy) => ({ x: rect.left + sx * vt[0] + vt[4], y: rect.top + sy * vt[3] + vt[5] });
const check = (label, detail, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  [${detail}]`);
  if (!ok) failures++;
};
const layers = () => page.evaluate(() => window.__substrata.layers());
// probeAt: fractional output-image xy; result.probe: RGBA per point
const exportBlob = (opts, probeAt) =>
  page.evaluate((o, p) => window.__substrata.exportBlob(o, p), opts, probeAt);
const near = (px, rgba, tol = 12) => !!px && rgba.every((v, i) => Math.abs(px[i] - v) <= tol);

// scene-point → output fraction
const f = (sx, sy) => [sx / 2000, sy / 1500];

const clamp = await page.evaluate(() => {
  const r = window.__substrata.resolveDims;
  return {
    big: r(8000, 8000, 3, 16_777_216),
    pass: r(2000, 1500, 2, 16_777_216),
    exact: r(4096, 4096, 1, 16_777_216),
  };
});
check(
  "clamp: 8000² @3× fits the iOS budget",
  `${clamp.big.outW}×${clamp.big.outH} eff=${clamp.big.effectiveScale.toFixed(3)}`,
  clamp.big.downscaled && clamp.big.outW * clamp.big.outH <= 16_777_216 + 8200, // rounding slack
);
check(
  "clamp: small board passes through",
  `${clamp.pass.outW}×${clamp.pass.outH}`,
  !clamp.pass.downscaled && clamp.pass.outW === 4000 && clamp.pass.outH === 3000,
);
check("clamp: exact-budget board untouched", `${clamp.exact.outW}`, !clamp.exact.downscaled && clamp.exact.outW === 4096);

let r = await exportBlob({ format: "png", scale: 1 }, [f(10, 10)]);
check("png 1×: ok + dims + mime", `${r.ok} ${r.width}×${r.height} ${r.type}`, r.ok && r.width === 2000 && r.height === 1500 && r.type === "image/png");
check("png 1×: white background pixels", r.probe[0]?.join(","), near(r.probe[0], [255, 255, 255, 255]));
check("png 1×: filename", r.filename, /-2000x1500\.png$/.test(r.filename ?? ""));

await page.evaluate(() => {
  window.__substrata.setTool("pieces", "primitives");
  window.__substrata.toolSettings("pieces", { shape: "rectangle", fill: "#3e6b33" });
});
const drag = async (x0, y0, x1, y1) => {
  const a = toPage(x0, y0);
  const b = toPage(x1, y1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await sleep(300);
};
await drag(200, 200, 800, 800);
await page.evaluate(() => {
  window.__substrata.setTool("pieces", "primitives"); // one-shot reverted after draw 1
  window.__substrata.toolSettings("pieces", { fill: "#cc2222" });
});
await drag(1200, 400, 1700, 900);
await page.evaluate(() => window.__substrata.select([]));
await sleep(200);
const ls = await layers();
check("setup: two shape layers", ls.length, ls.length === 2);

const GREEN_AT = f(500, 500);
const RED_AT = f(1450, 650);
const CORNER = f(10, 10);

r = await exportBlob({ format: "png", scale: 1 }, [CORNER, GREEN_AT, RED_AT]);
check("png: green rect in output", r.probe[1]?.join(","), near(r.probe[1], [62, 107, 51, 255]));
check("png: red rect in output", r.probe[2]?.join(","), near(r.probe[2], [204, 34, 34, 255]));
check("png: corner still white", r.probe[0]?.join(","), near(r.probe[0], [255, 255, 255, 255]));
r = await exportBlob({ format: "png", scale: 2 }, [GREEN_AT]);
check("png 2×: dims double", `${r.width}×${r.height}`, r.ok && r.width === 4000 && r.height === 3000);
check("png 2×: content survives the scale", r.probe[0]?.join(","), near(r.probe[0], [62, 107, 51, 255]));

r = await exportBlob({ format: "jpeg", scale: 1, quality: 80 }, [GREEN_AT]);
check("jpeg: mime + content", `${r.type} ${r.size}B`, r.ok && r.type === "image/jpeg" && near(r.probe[0], [62, 107, 51, 255]));
r = await exportBlob({ format: "webp", scale: 1, quality: 80 }, [GREEN_AT]);
check("webp: mime + content", `${r.type} ${r.size}B`, r.ok && r.type === "image/webp" && near(r.probe[0], [62, 107, 51, 255]));
r = await exportBlob({ format: "jxl", scale: 1, quality: 80 });
check("jxl: worker encode round-trip", `${r.ok} ${r.type} ${r.size}B`, r.ok && r.type === "image/jxl" && r.size > 500);

// lower q → fewer bytes
const q90 = await exportBlob({ format: "jpeg", scale: 1, quality: 90 });
const q30 = await exportBlob({ format: "jpeg", scale: 1, quality: 30 });
check("jpeg: quality moves bytes", `${q30.size} < ${q90.size}`, q30.size < q90.size);

await page.evaluate((id) => window.__substrata.select([id]), ls[0].id);
await sleep(200);
r = await exportBlob({ format: "png", scale: 1, scope: "layer" }, [CORNER, GREEN_AT, RED_AT]);
check("solo: ok", `${r.ok}`, r.ok === true);
check("solo: soloed layer renders", r.probe[1]?.join(","), near(r.probe[1], [62, 107, 51, 255]));
check("solo: background is real alpha (no checker!)", r.probe[0]?.join(","), r.probe[0]?.[3] === 0);
check("solo: other layer absent", r.probe[2]?.join(","), r.probe[2]?.[3] === 0);

const after = await layers();
check("scene: layers unchanged after exports", after.length, after.length === 2);
r = await exportBlob({ format: "png", scale: 1 }, [CORNER, RED_AT]);
check("scene: artboard fill restored after solo", r.probe[0]?.join(","), near(r.probe[0], [255, 255, 255, 255]));
check("scene: hidden layers restored after solo", r.probe[1]?.join(","), near(r.probe[1], [204, 34, 34, 255]));
const p = toPage(500, 500);
const onScreen = await page.evaluate(([x, y]) => window.__substrata.samplePixel(x, y), [p.x - rect.left, p.y - rect.top]);
check("scene: live canvas still shows green", onScreen?.join(","), near(onScreen, [62, 107, 51, 255]));

// 8×8 probe stride missed small solo content, false "Safari failure"
await page.evaluate(() => {
  window.__substrata.setTool("pieces", "primitives");
  window.__substrata.toolSettings("pieces", { shape: "rectangle", fill: "#2244cc" });
});
await drag(100, 1000, 250, 1112); // ~150×112 px
const ls3 = await layers();
await page.evaluate((id) => window.__substrata.select([id]), ls3[ls3.length - 1].id);
await sleep(200);
r = await exportBlob({ format: "png", scale: 1, scope: "layer" }, [f(175, 1056), CORNER]);
check("solo small: verify passes", `${r.ok} ${r.reason ?? ""}`, r.ok === true);
check("solo small: content present", r.probe[0]?.join(","), near(r.probe[0], [34, 68, 204, 255]));
check("solo small: rest transparent", r.probe[1]?.join(","), r.probe[1]?.[3] === 0);
await page.evaluate((id) => {
  // remove the helper layer so earlier scene-integrity expectations stay true
  window.__substrata.select([id]);
}, ls3[ls3.length - 1].id);
await page.keyboard.press("Backspace");
await sleep(250);

await page.evaluate(() => window.__substrata.select([]));
await sleep(150);
r = await exportBlob({ format: "png", scale: 1, scope: "layer" });
check("solo: no selection refuses cleanly", r.reason, r.ok === false && r.reason === "not-ready");

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
