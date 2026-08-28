/**
 * Image Compressor encode worker — all codecs off the main thread. Lives in
 * /public (never bundled, same reason as /public/jxl, see app/lib/jxl.ts) and
 * loads each vendored codec glue relative to itself, on first use of that
 * format. Spawned as a module worker:
 * new Worker("/compress/compress-worker.js", { type: "module" }).
 *
 * Codecs are the @jsquash emscripten/wasm-bindgen builds, copied verbatim from
 * node_modules/@jsquash/{jpeg,webp,oxipng,avif} — re-copy on a version bump.
 * The option defaults below mirror each package's meta.js (checked
 * 2026-08-13); the binding rejects unknown keys, so keep them in sync.
 *
 * Request:  { id, format, data: Uint8ClampedArray (RGBA), width, height,
 *             quality: 1..100, level: 0..6 }
 * Response: { id, ok: true, bytes: Uint8Array, mime } | { id, ok: false, error }
 */

const MOZJPEG_DEFAULTS = {
  baseline: false,
  arithmetic: false,
  progressive: true,
  optimize_coding: true,
  smoothing: 0,
  color_space: 3, // MozJpegColorSpace.YCbCr
  quant_table: 3,
  trellis_multipass: false,
  trellis_opt_zero: false,
  trellis_opt_table: false,
  trellis_loops: 1,
  auto_subsample: true,
  chroma_subsample: 2,
  separate_chroma_quality: false,
  chroma_quality: 75,
};

const WEBP_DEFAULTS = {
  target_size: 0,
  target_PSNR: 0,
  method: 4,
  sns_strength: 50,
  filter_strength: 60,
  filter_sharpness: 0,
  filter_type: 1,
  partitions: 0,
  segments: 4,
  pass: 1,
  show_compressed: 0,
  preprocessing: 0,
  autofilter: 0,
  partition_limit: 0,
  alpha_compression: 1,
  alpha_filtering: 1,
  alpha_quality: 100,
  lossless: 0,
  exact: 0,
  image_hint: 0,
  emulate_jpeg_size: 0,
  thread_level: 0,
  low_memory: 0,
  near_lossless: 100,
  use_delta_palette: 0,
  use_sharp_yuv: 0,
};

const AVIF_DEFAULTS = {
  // quality here is jsquash's 0-100 scale (100 = best); the binding maps it
  // onto the AV1 quantizer range itself.
  qualityAlpha: -1,
  denoiseLevel: 0,
  tileColsLog2: 0,
  tileRowsLog2: 0,
  speed: 6,
  subsample: 1,
  chromaDeltaQ: false,
  sharpness: 0,
  tune: 0, // AVIFTune.auto
  enableSharpYUV: false,
  bitDepth: 8,
  lossless: false,
};

const modules = new Map();

/** Emscripten MODULARIZE glue: default export is a factory returning the
 *  ready promise; locateFile points at the self-hosted wasm. */
function loadEmscripten(name, jsFile) {
  if (!modules.has(name)) {
    modules.set(
      name,
      import(`./${jsFile}`)
        .then(({ default: factory }) =>
          factory({
            noInitialRun: true,
            locateFile: (path) => `/compress/${path}`,
          }),
        )
        .catch((err) => {
          modules.delete(name); // don't poison future encodes on a transient fetch failure
          throw err;
        }),
    );
  }
  return modules.get(name);
}

/** wasm-bindgen glue (oxipng): default export is init(path). */
function loadOxipng() {
  if (!modules.has("oxipng")) {
    modules.set(
      "oxipng",
      import("./squoosh_oxipng.js")
        .then(async (mod) => {
          await mod.default("/compress/squoosh_oxipng_bg.wasm");
          return mod;
        })
        .catch((err) => {
          modules.delete("oxipng");
          throw err;
        }),
    );
  }
  return modules.get("oxipng");
}

async function encodeMozjpeg({ data, width, height, quality }) {
  const mod = await loadEmscripten("mozjpeg", "mozjpeg_enc.js");
  const result = mod.encode(data, width, height, {
    ...MOZJPEG_DEFAULTS,
    quality,
  });
  if (!result) throw new Error("MozJPEG encoding failed");
  return { bytes: new Uint8Array(result), mime: "image/jpeg" };
}

async function encodeWebp({ data, width, height, quality }) {
  const mod = await loadEmscripten("webp", "webp_enc.js");
  const result = mod.encode(data, width, height, {
    ...WEBP_DEFAULTS,
    quality,
  });
  if (!result) throw new Error("WebP encoding failed");
  return { bytes: new Uint8Array(result), mime: "image/webp" };
}

async function encodeAvif({ data, width, height, quality }) {
  const mod = await loadEmscripten("avif", "avif_enc.js");
  const result = mod.encode(new Uint8Array(data.buffer), width, height, {
    ...AVIF_DEFAULTS,
    quality,
  });
  if (!result) throw new Error("AVIF encoding failed");
  return { bytes: new Uint8Array(result), mime: "image/avif" };
}

async function encodeOxipng({ data, width, height, level }) {
  const mod = await loadOxipng();
  const result = mod.optimise_raw(data, width, height, level, false, false);
  if (!result) throw new Error("OxiPNG optimisation failed");
  return { bytes: new Uint8Array(result), mime: "image/png" };
}

const ENCODERS = {
  mozjpeg: encodeMozjpeg,
  webp: encodeWebp,
  avif: encodeAvif,
  oxipng: encodeOxipng,
};

self.onmessage = async (event) => {
  const { id, format } = event.data;
  try {
    const encode = ENCODERS[format];
    if (!encode) throw new Error(`Unknown format: ${format}`);
    const { bytes, mime } = await encode(event.data);
    self.postMessage({ id, ok: true, bytes, mime }, [bytes.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
};
