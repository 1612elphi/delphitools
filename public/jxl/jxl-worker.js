/**
 * Substrata export worker — JXL encode off the main thread. Lives in /public
 * (never bundled: Turbopack deadlocks on the emscripten glue, see
 * image-converter.tsx) and loads the vendored libjxl encoder relative to
 * itself. Spawned as a module worker: new Worker("/jxl/jxl-worker.js",
 * { type: "module" }).
 *
 * Request:  { id, data: Uint8ClampedArray (RGBA), width, height, options }
 * Response: { id, ok: true, bytes: Uint8Array } | { id, ok: false, error }
 */

let modulePromise = null;

function getModule() {
  modulePromise ??= import("./jxl_enc.js")
    .then(({ default: factory }) => factory({ noInitialRun: true, locateFile: (path) => `/jxl/${path}` }))
    .catch((err) => {
      modulePromise = null; // don't poison future encodes on a transient fetch failure
      throw err;
    });
  return modulePromise;
}

self.onmessage = async (event) => {
  const { id, data, width, height, options } = event.data;
  try {
    const mod = await getModule();
    const result = mod.encode(data, width, height, options);
    if (!result) throw new Error("JXL encoding failed");
    // Copy out of the WASM heap so the buffer is transferable and standalone.
    const bytes = new Uint8Array(result);
    self.postMessage({ id, ok: true, bytes }, [bytes.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
};
