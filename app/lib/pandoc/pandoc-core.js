/* pandoc-wasm: Core pandoc logic (environment-agnostic)

   This file contains all the pandoc conversion logic but doesn't handle
   WASM loading. The WASM binary must be provided by the caller.

   ───────────────────────────────────────────────────────────────────────────
   VENDORED, verbatim, from pandoc-wasm@1.0.1 (src/core.js).
   The JavaScript wrapper is MIT-licensed:
     Copyright (c) Tweag I/O Limited, Johannes Wilm, and pandoc-wasm contributors.
   (Full text: https://github.com/pandoc/pandoc-wasm/blob/main/LICENSE)

   We vendor this one small file (rather than importing it) because the package's
   `exports` map does not expose `src/core.js`, and its browser entry auto-inlines
   the 58 MB binary — which we don't want. The GPL-2.0-or-later pandoc.wasm BINARY
   is NOT vendored; it is fetched at runtime from a CDN (unpkg, see client.ts).
   Keep the CDN version pinned to match this file (currently 1.0.1).
   ───────────────────────────────────────────────────────────────────────────
*/

import {
    ConsoleStdout,
    File,
    OpenFile,
    PreopenDirectory,
    WASI
} from "@bjorn3/browser_wasi_shim"

// Initialize and export the pandoc instance creator
export function createPandocInstance(wasmBinary) {
    // Initialize WASM module
    const args = ["pandoc.wasm", "+RTS", "-H64m", "-RTS"]
    const env = []
    const fileSystem = new Map()
    const fds = [
        new OpenFile(new File(new Uint8Array(), {readonly: true})),
        ConsoleStdout.lineBuffered(msg => console.log(`[WASI stdout] ${msg}`)),
        ConsoleStdout.lineBuffered(msg => console.warn(`[WASI stderr] ${msg}`)),
        new PreopenDirectory("/", fileSystem)
    ]
    const options = {debug: false}
    const wasi = new WASI(args, env, fds, options)

    // Instantiate WASM
    return WebAssembly.instantiate(wasmBinary, {
        wasi_snapshot_preview1: wasi.wasiImport
    }).then(({instance}) => {
        wasi.initialize(instance)
        instance.exports.__wasm_call_ctors()

        function memory_data_view() {
            return new DataView(instance.exports.memory.buffer)
        }

        const argc_ptr = instance.exports.malloc(4)
        memory_data_view().setUint32(argc_ptr, args.length, true)
        const argv = instance.exports.malloc(4 * (args.length + 1))
        for (let i = 0; i < args.length; ++i) {
            const arg = instance.exports.malloc(args[i].length + 1)
            new TextEncoder().encodeInto(
                args[i],
                new Uint8Array(
                    instance.exports.memory.buffer,
                    arg,
                    args[i].length
                )
            )
            memory_data_view().setUint8(arg + args[i].length, 0)
            memory_data_view().setUint32(argv + 4 * i, arg, true)
        }
        memory_data_view().setUint32(argv + 4 * args.length, 0, true)
        const argv_ptr = instance.exports.malloc(4)
        memory_data_view().setUint32(argv_ptr, argv, true)

        instance.exports.hs_init_with_rtsopts(argc_ptr, argv_ptr)

        // Helper function to add file to filesystem
        // Accepts either a Blob or a string
        async function addFile(filename, data, readonly) {
            let uint8Array
            if (typeof data === "string") {
                // Convert string to Uint8Array
                uint8Array = new TextEncoder().encode(data)
            } else {
                // Assume it's a Blob
                const buffer = await data.arrayBuffer()
                uint8Array = new Uint8Array(buffer)
            }
            const file = new File(uint8Array, {readonly: readonly})
            fileSystem.set(filename, file)
        }

        // Main API: query function
        function query(options) {
            const opts_str = JSON.stringify(options)
            const encoded = new TextEncoder().encode(opts_str)
            // Allocate memory based on byte length, not character count
            const opts_ptr = instance.exports.malloc(encoded.length)
            new TextEncoder().encodeInto(
                opts_str,
                new Uint8Array(
                    instance.exports.memory.buffer,
                    opts_ptr,
                    encoded.length
                )
            )

            // Setup filesystem
            fileSystem.clear()
            const out_file = new File(new Uint8Array(), {readonly: false})
            const err_file = new File(new Uint8Array(), {readonly: false})
            fileSystem.set("stdout", out_file)
            fileSystem.set("stderr", err_file)

            instance.exports.query(opts_ptr, encoded.length)

            const err_text = new TextDecoder("utf-8", {fatal: true}).decode(
                err_file.data
            )
            if (err_text) {
                console.log(err_text)
            }
            const out_text = new TextDecoder("utf-8", {fatal: true}).decode(
                out_file.data
            )
            return JSON.parse(out_text)
        }

        // Main API: convert function
        async function convert(options, stdin, files) {
            const opts_str = JSON.stringify(options)

            const encoded = new TextEncoder().encode(opts_str)
            const opts_ptr = instance.exports.malloc(encoded.length)
            new TextEncoder().encodeInto(
                opts_str,
                new Uint8Array(
                    instance.exports.memory.buffer,
                    opts_ptr,
                    encoded.length
                )
            )

            // Clone files object to avoid mutating the input parameter
            files = {...files}

            // Setup filesystem
            fileSystem.clear()
            const in_file = new File(new Uint8Array(), {readonly: true})
            const out_file = new File(new Uint8Array(), {readonly: false})
            const err_file = new File(new Uint8Array(), {readonly: false})
            const warnings_file = new File(new Uint8Array(), {readonly: false})
            fileSystem.set("stdin", in_file)
            fileSystem.set("stdout", out_file)
            fileSystem.set("stderr", err_file)
            fileSystem.set("warnings", warnings_file)

            // Track known files to detect newly created media files
            // We track system files, input files, output files, and extract-media archives
            const knownFiles = new Set([
                "stdin",
                "stdout",
                "stderr",
                "warnings"
            ])

            // Add input files (can be Blobs or strings)
            for (const filename in files) {
                await addFile(filename, files[filename], true)
                knownFiles.add(filename)
            }

            // Track output file and extract-media separately
            // These should NOT be included in mediaFiles (only extracted media should be)
            const outputFileName = options["output-file"] || null
            const extractMediaPath = options["extract-media"] || null

            // Add output file placeholder if specified
            if (outputFileName) {
                await addFile(outputFileName, new Blob(), false)
                knownFiles.add(outputFileName)
            }

            // Add media file placeholder for extracted media
            if (extractMediaPath) {
                await addFile(extractMediaPath, new Blob(), false)
                // Only add to knownFiles if it's a zip file (not a directory)
                // Directory contents are the actual media files we want in mediaFiles
                if (extractMediaPath.endsWith(".zip")) {
                    knownFiles.add(extractMediaPath)
                }
            }

            // Set stdin content
            if (stdin) {
                in_file.data = new TextEncoder().encode(stdin)
            }

            // Run conversion
            instance.exports.convert(opts_ptr, encoded.length)

            // Collect output file if generated
            if (options["output-file"]) {
                const outputFile = fileSystem.get(options["output-file"])
                if (
                    outputFile &&
                    outputFile.data &&
                    outputFile.data.length > 0
                ) {
                    files[options["output-file"]] = new Blob([outputFile.data])
                }
            }

            // Collect extracted media if generated
            if (options["extract-media"]) {
                const mediaFile = fileSystem.get(options["extract-media"])
                if (mediaFile && mediaFile.data && mediaFile.data.length > 0) {
                    files[options["extract-media"]] = new Blob(
                        [mediaFile.data],
                        {
                            type: "application/zip"
                        }
                    )
                }
            }

            // Collect any newly created media files (e.g., extracted images)
            // mediaFiles should ONLY contain extracted media, NOT the output file
            const mediaFiles = {}
            for (const [name, fileData] of fileSystem.entries()) {
                if (
                    !knownFiles.has(name) &&
                    fileData &&
                    fileData.data &&
                    fileData.data.length > 0
                ) {
                    const blob = new Blob([fileData.data])
                    files[name] = blob
                    // Only add to mediaFiles if it's not the output file or extract-media archive
                    if (name !== outputFileName && name !== extractMediaPath) {
                        mediaFiles[name] = blob
                    }
                }
            }

            // Parse warnings
            const rawWarnings = new TextDecoder("utf-8", {fatal: true}).decode(
                warnings_file.data
            )
            let warnings = []
            if (rawWarnings) {
                try {
                    warnings = JSON.parse(rawWarnings)
                } catch (e) {
                    console.warn("Failed to parse warnings:", e)
                }
            }

            return {
                stdout: new TextDecoder("utf-8", {fatal: true}).decode(
                    out_file.data
                ),
                stderr: new TextDecoder("utf-8", {fatal: true}).decode(
                    err_file.data
                ),
                warnings: warnings,
                files: files,
                mediaFiles: mediaFiles
            }
        }

        // Helper function to convert data to Uint8Array
        async function toUint8Array(inData) {
            let uint8Array

            if (typeof inData === "string") {
                const encoder = new TextEncoder()
                uint8Array = encoder.encode(inData)
            } else if (inData instanceof Blob) {
                const arrayBuffer = await inData.arrayBuffer()
                uint8Array = new Uint8Array(arrayBuffer)
            } else {
                throw new Error(
                    "Unsupported type: inData must be a string or a Blob"
                )
            }

            return uint8Array
        }

        const textDecoder = new TextDecoder("utf-8", {fatal: true})

        function convertData(data) {
            let outData
            try {
                // Attempt to decode as UTF-8 text
                outData = textDecoder.decode(data)
            } catch (_e) {
                // If decoding fails, return as Blob
                outData = new Blob([data])
            }
            return outData
        }

        // Legacy API: pandoc function (for backward compatibility)
        async function pandoc(args_str, inData, resources = []) {
            // Parse command line arguments into options object
            const argParts = args_str.trim().split(/\s+/)
            const options = {}
            const files = {}

            let i = 0
            while (i < argParts.length) {
                const arg = argParts[i]

                if (arg === "-f" || arg === "--from") {
                    options.from = argParts[++i]
                } else if (arg === "-t" || arg === "--to") {
                    options.to = argParts[++i]
                } else if (arg === "-o" || arg === "--output") {
                    options["output-file"] = argParts[++i]
                } else if (arg === "-s" || arg === "--standalone") {
                    options.standalone = true
                } else if (arg === "--extract-media") {
                    options["extract-media"] = argParts[++i]
                } else if (arg === "--toc" || arg === "--table-of-contents") {
                    options["table-of-contents"] = true
                }
                i++
            }

            // Add resource files (convert to string or keep as Blob)
            for (const resource of resources) {
                // If contents is a string, keep it as string
                // Otherwise, convert to Blob
                if (typeof resource.contents === "string") {
                    files[resource.filename] = resource.contents
                } else {
                    const contents = await toUint8Array(resource.contents)
                    files[resource.filename] = new Blob([contents])
                }
            }

            // Convert stdin to string
            let stdin = null
            if (inData) {
                if (typeof inData === "string") {
                    stdin = inData
                } else {
                    const uint8Array = await toUint8Array(inData)
                    stdin = new TextDecoder("utf-8").decode(uint8Array)
                }
            }

            // Call convert
            const result = await convert(options, stdin, files)

            // Convert mediaFiles from Object to Map for legacy API compatibility
            const mediaFiles = new Map()
            for (const [name, blob] of Object.entries(result.mediaFiles)) {
                mediaFiles.set(
                    name,
                    convertData(new Uint8Array(await blob.arrayBuffer()))
                )
            }

            // Return in legacy format
            let out
            if (
                options["output-file"] &&
                result.files[options["output-file"]]
            ) {
                out = convertData(
                    new Uint8Array(
                        await result.files[options["output-file"]].arrayBuffer()
                    )
                )
            } else {
                out = result.stdout
            }

            return {
                out: out,
                mediaFiles: mediaFiles
            }
        }

        // Return the API
        return {
            convert,
            query,
            pandoc
        }
    })
}
