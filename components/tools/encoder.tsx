"use client";

import { useState, useCallback, useEffect } from "react";
import { Copy, Check, ArrowRightLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type EncodingMode = "encode" | "decode";

interface HashResult {
  md5: string;
  sha1: string;
  sha256: string;
  sha512: string;
}

export function EncoderTool() {
  const [base64Input, setBase64Input] = useState("");
  const [base64Output, setBase64Output] = useState("");
  const [base64Mode, setBase64Mode] = useState<EncodingMode>("encode");
  const [base64Error, setBase64Error] = useState<string | null>(null);

  const [urlInput, setUrlInput] = useState("");
  const [urlOutput, setUrlOutput] = useState("");
  const [urlMode, setUrlMode] = useState<EncodingMode>("encode");

  const [hashInput, setHashInput] = useState("");
  const [hashResult, setHashResult] = useState<HashResult | null>(null);
  const [hashLoading, setHashLoading] = useState(false);

  const [copied, setCopied] = useState<string | null>(null);

  // Base64 encoding/decoding
  const processBase64 = useCallback(() => {
    setBase64Error(null);
    if (!base64Input) {
      setBase64Output("");
      return;
    }

    try {
      if (base64Mode === "encode") {
        // Use TextEncoder for proper UTF-8 handling
        const encoder = new TextEncoder();
        const bytes = encoder.encode(base64Input);
        const binary = String.fromCharCode(...bytes);
        setBase64Output(btoa(binary));
      } else {
        // Decode
        const binary = atob(base64Input.trim());
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const decoder = new TextDecoder();
        setBase64Output(decoder.decode(bytes));
      }
    } catch {
      setBase64Error(
        base64Mode === "decode"
          ? "Invalid Base64 string"
          : "Encoding error"
      );
      setBase64Output("");
    }
  }, [base64Input, base64Mode]);

  useEffect(() => {
    processBase64();
  }, [processBase64]);

  // URL encoding/decoding
  const processUrl = useCallback(() => {
    if (!urlInput) {
      setUrlOutput("");
      return;
    }

    try {
      if (urlMode === "encode") {
        setUrlOutput(encodeURIComponent(urlInput));
      } else {
        setUrlOutput(decodeURIComponent(urlInput));
      }
    } catch {
      setUrlOutput("Invalid input");
    }
  }, [urlInput, urlMode]);

  useEffect(() => {
    processUrl();
  }, [processUrl]);

  // Hash generation
  const generateHashes = useCallback(async () => {
    if (!hashInput) {
      setHashResult(null);
      return;
    }

    setHashLoading(true);

    try {
      const CryptoJS = (await import("crypto-js")).default;

      setHashResult({
        md5: CryptoJS.MD5(hashInput).toString(),
        sha1: CryptoJS.SHA1(hashInput).toString(),
        sha256: CryptoJS.SHA256(hashInput).toString(),
        sha512: CryptoJS.SHA512(hashInput).toString(),
      });
    } catch (e) {
      console.error("Hash error:", e);
      setHashResult(null);
    } finally {
      setHashLoading(false);
    }
  }, [hashInput]);

  useEffect(() => {
    const timeout = setTimeout(generateHashes, 300);
    return () => clearTimeout(timeout);
  }, [generateHashes]);

  const copyValue = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const toggleBase64Mode = () => {
    // Swap input and output when switching modes
    const newInput = base64Output;
    setBase64Input(newInput);
    setBase64Mode((prev) => (prev === "encode" ? "decode" : "encode"));
  };

  const toggleUrlMode = () => {
    const newInput = urlOutput;
    setUrlInput(newInput);
    setUrlMode((prev) => (prev === "encode" ? "decode" : "encode"));
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="base64">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="base64">Base64</TabsTrigger>
          <TabsTrigger value="url">URL Encode</TabsTrigger>
          <TabsTrigger value="hash">Hash</TabsTrigger>
        </TabsList>

        <div className="mt-3 border-2 border-border">

          {/* Base64 Tab */}
          <TabsContent value="base64" className="m-0">
            {/* Mode toggle */}
            <div className="border-b-2 border-border p-4">
              <Label className="font-bold">Mode</Label>
              <div className="segmented grid-cols-2 -mx-4 -mb-4 mt-3 border-x-0 border-b-0">
                <Button
                  variant={base64Mode === "encode" ? "default" : "outline"}
                  onClick={() => setBase64Mode("encode")}
                >
                  Encode
                </Button>
                <Button
                  variant={base64Mode === "decode" ? "default" : "outline"}
                  onClick={() => setBase64Mode("decode")}
                >
                  Decode
                </Button>
              </div>
            </div>

            {/* Input */}
            <div className="border-b-2 border-border p-4">
              <Label className="font-bold">
                {base64Mode === "encode" ? "Text to encode" : "Base64 to decode"}
              </Label>
              <Textarea
                value={base64Input}
                onChange={(e) => setBase64Input(e.target.value)}
                placeholder={
                  base64Mode === "encode"
                    ? "Enter text to encode..."
                    : "Enter Base64 to decode..."
                }
                className="mt-3 min-h-[120px] border-0 bg-transparent p-0 font-mono focus-visible:ring-0"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              />
            </div>

            {/* Swap button */}
            <button
              type="button"
              onClick={toggleBase64Mode}
              className="flex w-full items-center justify-center gap-2 border-b-2 border-border py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowRightLeft className="size-4" />
              {base64Mode === "encode" ? "Switch to Decode" : "Switch to Encode"}
            </button>

            {/* Output */}
            <div className="border-b border-border p-4">
              <div className="flex items-center justify-between">
                <Label className="font-bold">
                  {base64Mode === "encode" ? "Base64 output" : "Decoded text"}
                </Label>
                {base64Output && !base64Error && (
                  <button
                    type="button"
                    onClick={() => copyValue(base64Output, "base64")}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {copied === "base64" ? (
                      <Check className="size-4 text-green-500" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    Copy
                  </button>
                )}
              </div>
              <Textarea
                readOnly
                value={base64Error || base64Output}
                className={`mt-3 min-h-[120px] border-0 bg-transparent p-0 focus-visible:ring-0 ${
                  base64Error ? "text-destructive" : ""
                }`}
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              />
            </div>

            {/* Copy action — flush full-width */}
            {base64Output && !base64Error && (
              <Button
                onClick={() => copyValue(base64Output, "base64-btn")}
                className="h-14 w-full border-0 text-lg font-bold"
              >
                {copied === "base64-btn" ? (
                  <><Check className="mr-2 size-5" /> Copied</>
                ) : (
                  <><Copy className="mr-2 size-5" /> Copy Output</>
                )}
              </Button>
            )}
          </TabsContent>

          {/* URL Encode Tab */}
          <TabsContent value="url" className="m-0">
            {/* Mode toggle */}
            <div className="border-b-2 border-border p-4">
              <Label className="font-bold">Mode</Label>
              <div className="segmented grid-cols-2 -mx-4 -mb-4 mt-3 border-x-0 border-b-0">
                <Button
                  variant={urlMode === "encode" ? "default" : "outline"}
                  onClick={() => setUrlMode("encode")}
                >
                  Encode
                </Button>
                <Button
                  variant={urlMode === "decode" ? "default" : "outline"}
                  onClick={() => setUrlMode("decode")}
                >
                  Decode
                </Button>
              </div>
            </div>

            {/* Input */}
            <div className="border-b-2 border-border p-4">
              <Label className="font-bold">
                {urlMode === "encode" ? "Text to encode" : "URL to decode"}
              </Label>
              <Textarea
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder={
                  urlMode === "encode"
                    ? "Enter text to URL encode..."
                    : "Enter URL-encoded text to decode..."
                }
                className="mt-3 min-h-[120px] border-0 bg-transparent p-0 font-mono focus-visible:ring-0"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              />
            </div>

            {/* Swap button */}
            <button
              type="button"
              onClick={toggleUrlMode}
              className="flex w-full items-center justify-center gap-2 border-b-2 border-border py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowRightLeft className="size-4" />
              {urlMode === "encode" ? "Switch to Decode" : "Switch to Encode"}
            </button>

            {/* Output */}
            <div className="border-b border-border p-4">
              <div className="flex items-center justify-between">
                <Label className="font-bold">
                  {urlMode === "encode" ? "URL-encoded output" : "Decoded text"}
                </Label>
                {urlOutput && (
                  <button
                    type="button"
                    onClick={() => copyValue(urlOutput, "url")}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {copied === "url" ? (
                      <Check className="size-4 text-green-500" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    Copy
                  </button>
                )}
              </div>
              <Textarea
                readOnly
                value={urlOutput}
                className="mt-3 min-h-[120px] border-0 bg-transparent p-0 focus-visible:ring-0"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              />
            </div>

            {/* Copy action — flush full-width */}
            {urlOutput && (
              <Button
                onClick={() => copyValue(urlOutput, "url-btn")}
                className="h-14 w-full border-0 border-b border-border text-lg font-bold"
              >
                {copied === "url-btn" ? (
                  <><Check className="mr-2 size-5" /> Copied</>
                ) : (
                  <><Copy className="mr-2 size-5" /> Copy Output</>
                )}
              </Button>
            )}

            {/* Note */}
            <div className="p-4 text-xs text-muted-foreground">
              Uses JavaScript&apos;s encodeURIComponent/decodeURIComponent
            </div>
          </TabsContent>

          {/* Hash Tab */}
          <TabsContent value="hash" className="m-0">
            {/* Input */}
            <div className="border-b-2 border-border p-4">
              <Label className="font-bold">Text to hash</Label>
              <Textarea
                value={hashInput}
                onChange={(e) => setHashInput(e.target.value)}
                placeholder="Enter text to generate hashes..."
                className="mt-3 min-h-[120px] border-0 bg-transparent p-0 focus-visible:ring-0"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              />
            </div>

            {/* Loading */}
            {hashLoading && (
              <div className="flex items-center gap-2 border-b border-border p-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Generating hashes...
              </div>
            )}

            {/* Hash results table */}
            {hashResult && (
              <div className="border-b-2 border-border">
                <div className="px-4 pt-4 pb-3">
                  <Label className="font-bold">Hash outputs</Label>
                </div>
                <div className="-mx-0 border-t border-border">
                  {(
                    [
                      { key: "md5", name: "MD5", value: hashResult.md5 },
                      { key: "sha1", name: "SHA-1", value: hashResult.sha1 },
                      { key: "sha256", name: "SHA-256", value: hashResult.sha256 },
                      { key: "sha512", name: "SHA-512", value: hashResult.sha512 },
                    ] as const
                  ).map((hash) => (
                    <div
                      key={hash.key}
                      className="flex items-stretch border-b border-border last:border-b-0"
                    >
                      <span className="flex w-20 shrink-0 items-center px-4 text-sm font-medium">
                        {hash.name}
                      </span>
                      <code
                        className="flex flex-1 items-center border-l border-border px-4 py-3 text-xs break-all"
                        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                      >
                        {hash.value}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyValue(hash.value, hash.key)}
                        aria-label={`Copy ${hash.name}`}
                        className="flex w-12 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {copied === hash.key ? (
                          <Check className="size-4 text-green-500" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* About section */}
            <div className="p-4">
              <Label className="font-bold">About Hash Functions</Label>
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                <p>
                  <strong>MD5:</strong> 128-bit, fast but cryptographically broken.
                  Use for checksums only.
                </p>
                <p>
                  <strong>SHA-1:</strong> 160-bit, deprecated for security use.
                </p>
                <p>
                  <strong>SHA-256:</strong> 256-bit, secure for most applications.
                </p>
                <p>
                  <strong>SHA-512:</strong> 512-bit, strongest option here.
                </p>
              </div>
            </div>
          </TabsContent>

        </div>
      </Tabs>
    </div>
  );
}
