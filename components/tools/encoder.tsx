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
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="base64">Base64</TabsTrigger>
          <TabsTrigger value="url">URL Encode</TabsTrigger>
          <TabsTrigger value="hash">Hash</TabsTrigger>
        </TabsList>

        {/* Base64 Tab */}
        <TabsContent value="base64" className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>
              {base64Mode === "encode" ? "Text to encode" : "Base64 to decode"}
            </Label>
            <Button variant="outline" size="sm" onClick={toggleBase64Mode}>
              <ArrowRightLeft className="size-4 mr-2" />
              {base64Mode === "encode" ? "Switch to Decode" : "Switch to Encode"}
            </Button>
          </div>

          <Textarea
            value={base64Input}
            onChange={(e) => setBase64Input(e.target.value)}
            placeholder={
              base64Mode === "encode"
                ? "Enter text to encode..."
                : "Enter Base64 to decode..."
            }
            className="font-mono min-h-[120px]"
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                {base64Mode === "encode" ? "Base64 output" : "Decoded text"}
              </Label>
              {base64Output && !base64Error && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyValue(base64Output, "base64")}
                >
                  {copied === "base64" ? (
                    <Check className="size-4 mr-2" />
                  ) : (
                    <Copy className="size-4 mr-2" />
                  )}
                  Copy
                </Button>
              )}
            </div>
            <Textarea
              readOnly
              value={base64Error || base64Output}
              className={`font-mono min-h-[120px] ${
                base64Error ? "text-destructive" : ""
              }`}
            />
          </div>
        </TabsContent>

        {/* URL Encode Tab */}
        <TabsContent value="url" className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>
              {urlMode === "encode" ? "Text to encode" : "URL to decode"}
            </Label>
            <Button variant="outline" size="sm" onClick={toggleUrlMode}>
              <ArrowRightLeft className="size-4 mr-2" />
              {urlMode === "encode" ? "Switch to Decode" : "Switch to Encode"}
            </Button>
          </div>

          <Textarea
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder={
              urlMode === "encode"
                ? "Enter text to URL encode..."
                : "Enter URL-encoded text to decode..."
            }
            className="font-mono min-h-[120px]"
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                {urlMode === "encode" ? "URL-encoded output" : "Decoded text"}
              </Label>
              {urlOutput && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyValue(urlOutput, "url")}
                >
                  {copied === "url" ? (
                    <Check className="size-4 mr-2" />
                  ) : (
                    <Copy className="size-4 mr-2" />
                  )}
                  Copy
                </Button>
              )}
            </div>
            <Textarea
              readOnly
              value={urlOutput}
              className="font-mono min-h-[120px]"
            />
          </div>

          <div className="text-xs text-muted-foreground">
            <p>Uses JavaScript&apos;s encodeURIComponent/decodeURIComponent</p>
          </div>
        </TabsContent>

        {/* Hash Tab */}
        <TabsContent value="hash" className="space-y-4">
          <div className="space-y-2">
            <Label>Text to hash</Label>
            <Textarea
              value={hashInput}
              onChange={(e) => setHashInput(e.target.value)}
              placeholder="Enter text to generate hashes..."
              className="font-mono min-h-[120px]"
            />
          </div>

          {hashLoading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Generating hashes...
            </div>
          )}

          {hashResult && (
            <div className="space-y-3">
              <Label>Hash outputs</Label>
              <div className="space-y-2">
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
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                  >
                    <span className="text-sm font-medium w-16 shrink-0">
                      {hash.name}
                    </span>
                    <code className="flex-1 text-xs font-mono break-all">
                      {hash.value}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => copyValue(hash.value, hash.key)}
                    >
                      {copied === hash.key ? (
                        <Check className="size-4 text-green-500" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border rounded-lg p-4 bg-card">
            <h3 className="font-medium mb-2">About Hash Functions</h3>
            <div className="text-sm text-muted-foreground space-y-1">
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
      </Tabs>
    </div>
  );
}
