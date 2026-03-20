"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

type JwtSection = Record<string, unknown>;
type VerifyMode = "secret" | "publicKey";

export function JwtDecoderTool() {
  const [token, setToken] = useState("");
  const [verifyMode, setVerifyMode] = useState<VerifyMode>("secret");
  const [verifyValue, setVerifyValue] = useState("");
  const [verifyResult, setVerifyResult] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => parseJwt(token), [token]);

  const payloadPretty = parsed.payload
    ? JSON.stringify(parsed.payload, null, 2)
    : "";

  const copyPayload = async () => {
    if (!payloadPretty) {
      return;
    }

    await navigator.clipboard.writeText(payloadPretty);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const verifySignature = async () => {
    if (!parsed.valid || !parsed.header || !token) {
      setVerifyResult("Enter a valid JWT first.");
      return;
    }

    if (!verifyValue.trim()) {
      setVerifyResult("Enter a secret or public key.");
      return;
    }

    try {
      const result = await verifyJwtSignature(token.trim(), parsed.header, verifyValue, verifyMode);
      setVerifyResult(result ? "✅ Signature is valid" : "❌ Signature is invalid");
    } catch (error) {
      setVerifyResult(error instanceof Error ? `Verification error: ${error.message}` : "Verification error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-lg font-bold block">JWT</label>
        <textarea
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setVerifyResult("");
          }}
          placeholder="Paste a JWT: header.payload.signature"
          className="w-full min-h-[120px] rounded-lg border bg-background p-4 font-mono text-sm resize-y"
        />
      </div>

      {parsed.error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {parsed.error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="text-lg font-bold block">Header</label>
          <textarea
            readOnly
            value={parsed.header ? JSON.stringify(parsed.header, null, 2) : ""}
            placeholder="Decoded header"
            className="w-full min-h-[220px] rounded-lg border bg-muted/30 p-4 font-mono text-sm"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-lg font-bold block">Payload</label>
            <Button variant="outline" size="sm" onClick={copyPayload} disabled={!payloadPretty}>
              {copied ? <Check className="size-4 mr-2" /> : <Copy className="size-4 mr-2" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <textarea
            readOnly
            value={payloadPretty}
            placeholder="Decoded payload"
            className="w-full min-h-[220px] rounded-lg border bg-muted/30 p-4 font-mono text-sm"
          />
        </div>
      </div>

      {parsed.payload && (
        <div className="rounded-lg border p-4 space-y-2">
          <h3 className="font-semibold">Token timing claims</h3>
          <ClaimRow label="exp" value={formatUnixClaim(parsed.payload.exp)} />
          <ClaimRow label="iat" value={formatUnixClaim(parsed.payload.iat)} />
          <ClaimRow label="nbf" value={formatUnixClaim(parsed.payload.nbf)} />
        </div>
      )}

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="font-semibold">Optional signature verification</h3>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={verifyMode === "secret"}
              onChange={() => setVerifyMode("secret")}
            />
            Shared secret (HS*)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={verifyMode === "publicKey"}
              onChange={() => setVerifyMode("publicKey")}
            />
            Public key PEM (RS*)
          </label>
        </div>

        <textarea
          value={verifyValue}
          onChange={(e) => setVerifyValue(e.target.value)}
          placeholder={
            verifyMode === "secret"
              ? "Paste HMAC secret"
              : "Paste RSA public key PEM (-----BEGIN PUBLIC KEY-----)"
          }
          className="w-full min-h-[120px] rounded-lg border bg-background p-4 font-mono text-sm resize-y"
        />

        <div className="flex items-center gap-3">
          <Button onClick={verifySignature} disabled={!parsed.valid}>Verify signature</Button>
          {verifyResult && <p className="text-sm text-muted-foreground">{verifyResult}</p>}
        </div>
      </div>
    </div>
  );
}

function ClaimRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm">
      <span className="font-mono font-semibold mr-2">{label}</span>
      <span className="text-muted-foreground">{value}</span>
    </p>
  );
}

function formatUnixClaim(value: unknown): string {
  if (typeof value !== "number") {
    return "Not present";
  }

  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return `Invalid timestamp (${value})`;
  }

  return `${date.toLocaleString()} (${relativeTimeFromNow(date)})`;
}

function relativeTimeFromNow(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const absSeconds = Math.round(Math.abs(diffMs) / 1000);
  const unit = absSeconds < 60 ? "second" : absSeconds < 3600 ? "minute" : absSeconds < 86400 ? "hour" : "day";
  const divisor = unit === "second" ? 1 : unit === "minute" ? 60 : unit === "hour" ? 3600 : 86400;
  const amount = Math.round(absSeconds / divisor);

  if (amount === 0) {
    return "now";
  }

  return diffMs >= 0 ? `in ${amount} ${unit}${amount === 1 ? "" : "s"}` : `${amount} ${unit}${amount === 1 ? "" : "s"} ago`;
}

function parseJwt(token: string): {
  valid: boolean;
  header: JwtSection | null;
  payload: JwtSection | null;
  error: string;
} {
  const trimmed = token.trim();
  if (!trimmed) {
    return { valid: false, header: null, payload: null, error: "" };
  }

  const parts = trimmed.split(".");
  if (parts.length < 2) {
    return { valid: false, header: null, payload: null, error: "JWT must include at least header and payload sections." };
  }

  try {
    const header = JSON.parse(base64UrlDecode(parts[0])) as JwtSection;
    const payload = JSON.parse(base64UrlDecode(parts[1])) as JwtSection;
    return { valid: true, header, payload, error: "" };
  } catch (error) {
    return {
      valid: false,
      header: null,
      payload: null,
      error: error instanceof Error ? error.message : "Could not decode JWT",
    };
  }
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const clean = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");

  if (!clean) {
    throw new Error("Invalid PEM public key");
  }

  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return bytes.buffer;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function verifyJwtSignature(
  token: string,
  header: JwtSection,
  verifyValue: string,
  verifyMode: VerifyMode
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Signed JWT must have 3 sections");
  }

  const alg = typeof header.alg === "string" ? header.alg : "";
  if (!alg || alg === "none") {
    throw new Error("Unsupported JWT algorithm");
  }

  const data = toArrayBuffer(new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  const signature = toArrayBuffer(base64UrlToBytes(parts[2]));

  if (alg.startsWith("HS")) {
    if (verifyMode !== "secret") {
      throw new Error("This token uses HMAC. Select shared secret mode.");
    }

    const hash = alg === "HS256" ? "SHA-256" : alg === "HS384" ? "SHA-384" : alg === "HS512" ? "SHA-512" : "";
    if (!hash) {
      throw new Error(`Unsupported HMAC algorithm: ${alg}`);
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(verifyValue),
      { name: "HMAC", hash },
      false,
      ["verify"]
    );

    return crypto.subtle.verify("HMAC", key, signature, data);
  }

  if (alg.startsWith("RS")) {
    if (verifyMode !== "publicKey") {
      throw new Error("This token uses RSA. Select public key mode.");
    }

    const hash = alg === "RS256" ? "SHA-256" : alg === "RS384" ? "SHA-384" : alg === "RS512" ? "SHA-512" : "";
    if (!hash) {
      throw new Error(`Unsupported RSA algorithm: ${alg}`);
    }

    const key = await crypto.subtle.importKey(
      "spki",
      pemToArrayBuffer(verifyValue),
      { name: "RSASSA-PKCS1-v1_5", hash },
      false,
      ["verify"]
    );

    return crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, signature, data);
  }

  throw new Error(`Unsupported algorithm: ${alg}`);
}
