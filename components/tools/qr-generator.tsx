"use client";

import { useState, useEffect, useRef } from "react";
import { Download, Copy, Check } from "lucide-react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function QrGeneratorTool() {
  const [text, setText] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [size, setSize] = useState(256);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!text.trim()) {
      setQrDataUrl(null);
      return;
    }

    const generateQR = async () => {
      try {
        const dataUrl = await QRCode.toDataURL(text, {
          width: size,
          margin: 2,
          color: {
            dark: "#1a1a1a",
            light: "#ffffff",
          },
        });
        setQrDataUrl(dataUrl);
      } catch (err) {
        console.error("QR generation failed:", err);
        setQrDataUrl(null);
      }
    };

    generateQR();
  }, [text, size]);

  const downloadQR = (format: "png" | "svg") => {
    if (!text.trim()) return;

    if (format === "png" && qrDataUrl) {
      const link = document.createElement("a");
      link.download = `qr-code-${Date.now()}.png`;
      link.href = qrDataUrl;
      link.click();
    } else if (format === "svg") {
      QRCode.toString(text, { type: "svg", width: size, margin: 2 }, (err, svg) => {
        if (err || !svg) return;
        const blob = new Blob([svg], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = `qr-code-${Date.now()}.svg`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      });
    }
  };

  const copyToClipboard = async () => {
    if (!qrDataUrl) return;

    try {
      const response = await fetch(qrDataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const presets = [
    { label: "URL", placeholder: "https://example.com" },
    { label: "Email", placeholder: "mailto:hello@example.com" },
    { label: "Phone", placeholder: "tel:+1234567890" },
    { label: "WiFi", placeholder: "WIFI:T:WPA;S:NetworkName;P:password;;" },
  ];

  return (
    <div className="space-y-8">
      {/* Input */}
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-lg font-bold block">Enter content</label>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="URL, text, email, phone number..."
            className="text-lg h-14"
          />
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              variant="outline"
              size="sm"
              onClick={() => setText(preset.placeholder)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      {/* QR Display */}
      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* QR Code */}
        <div className="flex-shrink-0">
          <div
            className="border-4 border-card rounded-xl bg-white p-4 inline-block"
            style={{ minWidth: size + 32, minHeight: size + 32 }}
          >
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR Code"
                width={size}
                height={size}
                className="block"
              />
            ) : (
              <div
                className="flex items-center justify-center text-muted-foreground"
                style={{ width: size, height: size }}
              >
                <span className="text-center text-sm">
                  Enter text to generate QR code
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex-1 space-y-6 w-full">
          {/* Size */}
          <div className="space-y-3">
            <label className="font-bold block">Size</label>
            <div className="flex gap-2">
              {[128, 256, 512].map((s) => (
                <Button
                  key={s}
                  variant={size === s ? "default" : "outline"}
                  onClick={() => setSize(s)}
                  className="flex-1"
                >
                  {s}px
                </Button>
              ))}
            </div>
          </div>

          {/* Download Buttons */}
          <div className="space-y-3">
            <label className="font-bold block">Download</label>
            <div className="grid grid-cols-2 gap-3">
              <Button
                size="lg"
                onClick={() => downloadQR("png")}
                disabled={!qrDataUrl}
                className="h-14"
              >
                <Download className="size-5 mr-2" />
                PNG
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => downloadQR("svg")}
                disabled={!text.trim()}
                className="h-14"
              >
                <Download className="size-5 mr-2" />
                SVG
              </Button>
            </div>
          </div>

          {/* Copy Button */}
          <Button
            variant="outline"
            size="lg"
            onClick={copyToClipboard}
            disabled={!qrDataUrl}
            className="w-full h-14"
          >
            {copied ? (
              <>
                <Check className="size-5 mr-2" />
                Copied to clipboard!
              </>
            ) : (
              <>
                <Copy className="size-5 mr-2" />
                Copy to clipboard
              </>
            )}
          </Button>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
