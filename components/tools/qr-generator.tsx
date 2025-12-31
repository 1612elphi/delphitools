"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Download,
  Copy,
  Check,
  Upload,
  X,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Info,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Types
type DotType =
  | "square"
  | "rounded"
  | "dots"
  | "classy"
  | "classy-rounded"
  | "extra-rounded";
type CornerSquareType = "square" | "dot" | "extra-rounded";
type CornerDotType = "square" | "dot";
type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

interface QROptions {
  padding: number;
  foregroundColor: string;
  backgroundColor: string;
  dotType: DotType;
  cornerSquareType: CornerSquareType;
  cornerDotType: CornerDotType;
  errorCorrection: ErrorCorrectionLevel;
  logo: string | null;
  logoSize: number;
  logoMargin: number;
}

interface VCardData {
  firstName: string;
  lastName: string;
  organization: string;
  title: string;
  email: string;
  phone: string;
  website: string;
  address: string;
}

interface BatchItem {
  id: string;
  content: string;
  status: "pending" | "generating" | "done" | "error";
  dataUrl?: string;
}

interface UrlValidation {
  checking: boolean;
  valid: boolean | null;
  message: string;
}

const QR_INFO = {
  name: "QR Code",
  inventor: "Masahiro Hara (Denso Wave)",
  year: "1994",
  description:
    "Quick Response code, originally for automotive tracking. Now ubiquitous for URLs, payments, and more.",
};

const ERROR_CORRECTION_INFO: Record<
  ErrorCorrectionLevel,
  { name: string; recovery: string }
> = {
  L: { name: "Low", recovery: "~7% recovery" },
  M: { name: "Medium", recovery: "~15% recovery" },
  Q: { name: "Quartile", recovery: "~25% recovery" },
  H: { name: "High", recovery: "~30% recovery" },
};

const DOT_STYLES: { value: DotType; label: string }[] = [
  { value: "square", label: "Boxy" },
  { value: "rounded", label: "Bouba" },
  { value: "dots", label: "Braille" },
  { value: "classy", label: "Calligraph" },
  { value: "classy-rounded", label: "Kiki" },
  { value: "extra-rounded", label: "Blobby" },
];

const CORNER_SQUARE_STYLES: { value: CornerSquareType; label: string }[] = [
  { value: "square", label: "Boxy" },
  { value: "dot", label: "Circular" },
  { value: "extra-rounded", label: "Rounded" },
];

const CORNER_DOT_STYLES: { value: CornerDotType; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "dot", label: "Circle" },
];

// Default options
const defaultQROptions: QROptions = {
  padding: 2,
  foregroundColor: "#000000",
  backgroundColor: "#ffffff",
  dotType: "square",
  cornerSquareType: "square",
  cornerDotType: "square",
  errorCorrection: "M",
  logo: null,
  logoSize: 0.3,
  logoMargin: 4,
};

const defaultVCard: VCardData = {
  firstName: "",
  lastName: "",
  organization: "",
  title: "",
  email: "",
  phone: "",
  website: "",
  address: "",
};

export function QrGeneratorTool() {
  // Main state
  const [activeTab, setActiveTab] = useState<"single" | "batch" | "vcard">(
    "single"
  );
  const [content, setContent] = useState("");
  const [size, setSize] = useState(300);
  const [options, setOptions] = useState<QROptions>(defaultQROptions);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  // vCard state
  const [vCardData, setVCardData] = useState<VCardData>(defaultVCard);

  // Batch state
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchGenerating, setBatchGenerating] = useState(false);

  // URL validation state
  const [urlValidation, setUrlValidation] = useState<UrlValidation>({
    checking: false,
    valid: null,
    message: "",
  });

  // Logo drag state
  const [logoDragging, setLogoDragging] = useState(false);

  // Refs
  const logoInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qrCodeInstance = useRef<any>(null);

  // Generate vCard string
  const generateVCardString = useCallback((data: VCardData): string => {
    const lines = ["BEGIN:VCARD", "VERSION:3.0"];
    if (data.firstName || data.lastName) {
      lines.push(`N:${data.lastName};${data.firstName};;;`);
      lines.push(`FN:${data.firstName} ${data.lastName}`.trim());
    }
    if (data.organization) lines.push(`ORG:${data.organization}`);
    if (data.title) lines.push(`TITLE:${data.title}`);
    if (data.email) lines.push(`EMAIL:${data.email}`);
    if (data.phone) lines.push(`TEL:${data.phone}`);
    if (data.website) lines.push(`URL:${data.website}`);
    if (data.address) lines.push(`ADR:;;${data.address};;;;`);
    lines.push("END:VCARD");
    return lines.join("\n");
  }, []);

  // URL validation
  useEffect(() => {
    if (!content.trim()) {
      setUrlValidation({ checking: false, valid: null, message: "" });
      return;
    }

    // Check if it looks like a URL
    const urlPattern = /^https?:\/\/.+/i;
    if (!urlPattern.test(content)) {
      setUrlValidation({ checking: false, valid: null, message: "" });
      return;
    }

    setUrlValidation({
      checking: true,
      valid: null,
      message: "Checking URL...",
    });

    const timeoutId = setTimeout(async () => {
      try {
        new URL(content);
        setUrlValidation({
          checking: false,
          valid: true,
          message: "Valid URL format",
        });
      } catch {
        setUrlValidation({
          checking: false,
          valid: false,
          message: "Invalid URL format",
        });
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [content]);

  // Generate QR code using qr-code-styling
  const generateQRCode = useCallback(async () => {
    if (!content.trim() && activeTab !== "vcard") return;

    const actualContent =
      activeTab === "vcard" ? generateVCardString(vCardData) : content;
    if (!actualContent.trim()) return;

    setGenerating(true);

    try {
      const QRCodeStyling = (await import("qr-code-styling")).default;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const qrOptions: any = {
        width: size,
        height: size,
        type: "svg",
        data: actualContent,
        margin: options.padding * 4,
        qrOptions: {
          errorCorrectionLevel: options.errorCorrection,
        },
        dotsOptions: {
          type: options.dotType,
          color: options.foregroundColor,
        },
        cornersSquareOptions: {
          type: options.cornerSquareType,
          color: options.foregroundColor,
        },
        cornersDotOptions: {
          type: options.cornerDotType,
          color: options.foregroundColor,
        },
        backgroundOptions: {
          color: options.backgroundColor,
        },
      };

      // Add logo if present
      if (options.logo) {
        qrOptions.image = options.logo;
        qrOptions.imageOptions = {
          crossOrigin: "anonymous",
          margin: options.logoMargin,
          imageSize: options.logoSize,
          hideBackgroundDots: true,
        };
      }

      const qrCode = new QRCodeStyling(qrOptions);
      qrCodeInstance.current = qrCode;

      // Get data URL for preview and clipboard
      const blob = await qrCode.getRawData("png");
      if (blob && blob instanceof Blob) {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        setQrDataUrl(dataUrl);
      }
    } catch (err) {
      console.error("QR generation failed:", err);
      setQrDataUrl(null);
    } finally {
      setGenerating(false);
    }
  }, [content, size, options, activeTab, vCardData, generateVCardString]);

  // Regenerate when dependencies change
  useEffect(() => {
    const debounce = setTimeout(() => {
      generateQRCode();
    }, 300);
    return () => clearTimeout(debounce);
  }, [generateQRCode]);

  // Handle logo upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processLogoFile(file);
  };

  const processLogoFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setOptions((prev) => ({
        ...prev,
        logo: event.target?.result as string,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleLogoDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLogoDragging(true);
  };

  const handleLogoDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLogoDragging(false);
  };

  const handleLogoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLogoDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processLogoFile(file);
  };

  // Download functions
  const downloadCode = async (format: "png" | "svg") => {
    if (!qrCodeInstance.current && !qrDataUrl) return;

    const filename = `qr-code-${Date.now()}`;

    if (qrCodeInstance.current) {
      if (format === "svg") {
        qrCodeInstance.current.download({ name: filename, extension: "svg" });
      } else {
        qrCodeInstance.current.download({ name: filename, extension: "png" });
      }
    }
  };

  // Copy to clipboard
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

  // Batch generation
  const addBatchItem = () => {
    setBatchItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        content: "",
        status: "pending",
      },
    ]);
  };

  const removeBatchItem = (id: string) => {
    setBatchItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateBatchItem = (id: string, content: string) => {
    setBatchItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, content } : item))
    );
  };

  const handleBatchFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const newItems: BatchItem[] = lines.map((line) => ({
        id: crypto.randomUUID(),
        content: line,
        status: "pending",
      }));

      setBatchItems((prev) => [...prev, ...newItems]);
    };
    reader.readAsText(file);

    // Reset input so the same file can be uploaded again
    e.target.value = "";
  };

  const generateBatch = async () => {
    if (batchItems.length === 0) return;

    setBatchGenerating(true);
    const QRCodeStyling = (await import("qr-code-styling")).default;
    const JSZip = (await import("jszip")).default;

    const zip = new JSZip();

    for (const item of batchItems) {
      if (!item.content.trim()) continue;

      setBatchItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, status: "generating" } : i
        )
      );

      try {
        const qrCode = new QRCodeStyling({
          width: size,
          height: size,
          type: "canvas",
          data: item.content,
          margin: options.padding * 4,
          qrOptions: {
            errorCorrectionLevel: options.errorCorrection,
          },
          dotsOptions: {
            type: options.dotType,
            color: options.foregroundColor,
          },
          cornersSquareOptions: {
            type: options.cornerSquareType,
            color: options.foregroundColor,
          },
          cornersDotOptions: {
            type: options.cornerDotType,
            color: options.foregroundColor,
          },
          backgroundOptions: {
            color: options.backgroundColor,
          },
          image: options.logo || undefined,
          imageOptions: options.logo
            ? {
                crossOrigin: "anonymous",
                margin: options.logoMargin,
                imageSize: options.logoSize,
              }
            : undefined,
        });

        const blob = await qrCode.getRawData("png");
        if (blob && blob instanceof Blob) {
          const safeName = item.content
            .slice(0, 30)
            .replace(/[^a-zA-Z0-9]/g, "_");
          zip.file(`qr-${safeName}.png`, blob);

          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });

          setBatchItems((prev) =>
            prev.map((i) =>
              i.id === item.id ? { ...i, status: "done", dataUrl } : i
            )
          );
        }
      } catch {
        setBatchItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: "error" } : i
          )
        );
      }
    }

    // Download ZIP
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(zipBlob);
    link.download = `qr-codes-batch-${Date.now()}.zip`;
    link.click();
    URL.revokeObjectURL(link.href);

    setBatchGenerating(false);
  };

  // Presets
  const presets = [
    { label: "URL", placeholder: "https://example.com" },
    { label: "Email", placeholder: "mailto:hello@example.com" },
    { label: "Phone", placeholder: "tel:+1234567890" },
    { label: "WiFi", placeholder: "WIFI:T:WPA;S:NetworkName;P:password;;" },
    { label: "SMS", placeholder: "sms:+1234567890?body=Hello" },
    { label: "Geo", placeholder: "geo:40.7128,-74.0060" },
  ];

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Mode Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="single">Single</TabsTrigger>
            <TabsTrigger value="vcard">vCard Builder</TabsTrigger>
            <TabsTrigger value="batch">Batch Mode</TabsTrigger>
          </TabsList>

          {/* Single Mode */}
          <TabsContent value="single" className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-bold">Content</Label>
                {urlValidation.message && (
                  <div
                    className={`flex items-center gap-1 text-xs ${
                      urlValidation.checking
                        ? "text-muted-foreground"
                        : urlValidation.valid
                          ? "text-green-600"
                          : "text-red-500"
                    }`}
                  >
                    {urlValidation.checking ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : urlValidation.valid ? (
                      <CheckCircle2 className="size-3" />
                    ) : (
                      <AlertCircle className="size-3" />
                    )}
                    {urlValidation.message}
                  </div>
                )}
              </div>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter URL, text, or data..."
                className="min-h-[80px] text-base"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  onClick={() => setContent(preset.placeholder)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </TabsContent>

          {/* vCard Builder */}
          <TabsContent value="vcard" className="space-y-4 mt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input
                  value={vCardData.firstName}
                  onChange={(e) =>
                    setVCardData((prev) => ({
                      ...prev,
                      firstName: e.target.value,
                    }))
                  }
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={vCardData.lastName}
                  onChange={(e) =>
                    setVCardData((prev) => ({
                      ...prev,
                      lastName: e.target.value,
                    }))
                  }
                  placeholder="Doe"
                />
              </div>
              <div className="space-y-2">
                <Label>Organization</Label>
                <Input
                  value={vCardData.organization}
                  onChange={(e) =>
                    setVCardData((prev) => ({
                      ...prev,
                      organization: e.target.value,
                    }))
                  }
                  placeholder="Acme Inc."
                />
              </div>
              <div className="space-y-2">
                <Label>Job Title</Label>
                <Input
                  value={vCardData.title}
                  onChange={(e) =>
                    setVCardData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="Software Engineer"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={vCardData.email}
                  onChange={(e) =>
                    setVCardData((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="john@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  type="tel"
                  value={vCardData.phone}
                  onChange={(e) =>
                    setVCardData((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  placeholder="+1 234 567 8900"
                />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input
                  type="url"
                  value={vCardData.website}
                  onChange={(e) =>
                    setVCardData((prev) => ({
                      ...prev,
                      website: e.target.value,
                    }))
                  }
                  placeholder="https://example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input
                  value={vCardData.address}
                  onChange={(e) =>
                    setVCardData((prev) => ({
                      ...prev,
                      address: e.target.value,
                    }))
                  }
                  placeholder="123 Main St, City"
                />
              </div>
            </div>
            {(vCardData.firstName || vCardData.lastName) && (
              <div className="p-3 rounded-lg bg-muted/50 font-mono text-xs whitespace-pre-wrap">
                {generateVCardString(vCardData)}
              </div>
            )}
          </TabsContent>

          {/* Batch Mode */}
          <TabsContent value="batch" className="space-y-4 mt-4">
            <div className="space-y-3">
              {batchItems.map((item, index) => (
                <div key={item.id} className="flex gap-2 items-center">
                  <span className="text-sm text-muted-foreground w-6">
                    {index + 1}.
                  </span>
                  <Input
                    value={item.content}
                    onChange={(e) => updateBatchItem(item.id, e.target.value)}
                    placeholder="Enter content..."
                    className="flex-1"
                  />
                  {item.status === "done" && item.dataUrl && (
                    <img src={item.dataUrl} alt="" className="size-8 rounded" />
                  )}
                  {item.status === "generating" && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  {item.status === "error" && (
                    <AlertCircle className="size-4 text-red-500" />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeBatchItem(item.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <input
                ref={batchFileInputRef}
                type="file"
                accept=".txt,text/plain"
                onChange={handleBatchFileUpload}
                className="hidden"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={addBatchItem}
                  className="flex-1"
                >
                  <Plus className="size-4 mr-2" />
                  Add Item
                </Button>
                <Button
                  variant="outline"
                  onClick={() => batchFileInputRef.current?.click()}
                  className="flex-1"
                >
                  <Upload className="size-4 mr-2" />
                  Upload List
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Insert your data manually or upload a text file with one QR code content per line
              </p>
              <Button
                onClick={generateBatch}
                disabled={batchItems.length === 0 || batchGenerating}
                className="w-full"
              >
                {batchGenerating ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <Package className="size-4 mr-2" />
                )}
                Generate & Download ZIP
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* Main Content Area */}
        {activeTab !== "batch" && (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Preview */}
            <div className="space-y-4">
              <Label className="font-bold text-lg">Preview</Label>
              <div
                className="border-4 border-card rounded-xl p-4 flex items-center justify-center min-h-[320px]"
                style={{ backgroundColor: options.backgroundColor }}
              >
                {generating ? (
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                ) : qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR Code"
                    width={size}
                    height={size}
                    className="block"
                  />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <p>Enter content to generate QR code</p>
                  </div>
                )}
              </div>

              {/* Style Presets */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Quick Styles</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOptions(prev => ({
                      ...prev,
                      dotType: "square",
                      cornerSquareType: "square",
                      cornerDotType: "square",
                      foregroundColor: "#000000",
                      backgroundColor: "#ffffff",
                    }))}
                  >
                    Classic
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOptions(prev => ({
                      ...prev,
                      dotType: "rounded",
                      cornerSquareType: "extra-rounded",
                      cornerDotType: "dot",
                      foregroundColor: "#000000",
                      backgroundColor: "#ffffff",
                    }))}
                  >
                    Rounded
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOptions(prev => ({
                      ...prev,
                      dotType: "dots",
                      cornerSquareType: "dot",
                      cornerDotType: "dot",
                      foregroundColor: "#000000",
                      backgroundColor: "#ffffff",
                    }))}
                  >
                    Dots
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOptions(prev => ({
                      ...prev,
                      dotType: "classy-rounded",
                      cornerSquareType: "extra-rounded",
                      cornerDotType: "dot",
                      foregroundColor: "#000000",
                      backgroundColor: "#ffffff",
                    }))}
                  >
                    Classy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOptions(prev => ({
                      ...prev,
                      dotType: "rounded",
                      cornerSquareType: "extra-rounded",
                      cornerDotType: "dot",
                      foregroundColor: "#6366f1",
                      backgroundColor: "#ffffff",
                    }))}
                  >
                    Indigo
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOptions(prev => ({
                      ...prev,
                      dotType: "extra-rounded",
                      cornerSquareType: "extra-rounded",
                      cornerDotType: "dot",
                      foregroundColor: "#e11d48",
                      backgroundColor: "#ffffff",
                    }))}
                  >
                    Rose
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOptions(prev => ({
                      ...prev,
                      dotType: "classy",
                      cornerSquareType: "square",
                      cornerDotType: "square",
                      foregroundColor: "#0d9488",
                      backgroundColor: "#ffffff",
                    }))}
                  >
                    Teal
                  </Button>
                </div>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-3 gap-3">
                <Button
                  size="lg"
                  onClick={() => downloadCode("png")}
                  disabled={!qrDataUrl}
                  className="h-12"
                >
                  <Download className="size-5 mr-2" />
                  PNG
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => downloadCode("svg")}
                  disabled={!qrDataUrl}
                  className="h-12"
                >
                  <Download className="size-5 mr-2" />
                  SVG
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={copyToClipboard}
                  disabled={!qrDataUrl}
                  className="h-12"
                >
                  {copied ? (
                    <>
                      <Check className="size-5 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="size-5 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Options */}
            <div className="space-y-4">
              <Label className="font-bold text-lg">Options</Label>
              <Accordion
                type="multiple"
                defaultValue={["basic", "style"]}
                className="space-y-2"
              >
                {/* Basic Options */}
                <AccordionItem value="basic" className="border rounded-lg px-4">
                  <AccordionTrigger className="font-bold">
                    Basics
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pb-4">
                    {/* Size */}
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label>Size</Label>
                        <span className="text-sm text-muted-foreground">
                          {size}px
                        </span>
                      </div>
                      <Slider
                        value={[size]}
                        onValueChange={([v]) => setSize(v)}
                        min={100}
                        max={600}
                        step={10}
                      />
                    </div>

                    {/* Padding */}
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label>Padding</Label>
                        <span className="text-sm text-muted-foreground">
                          {options.padding}
                        </span>
                      </div>
                      <Slider
                        value={[options.padding]}
                        onValueChange={([v]) =>
                          setOptions((prev) => ({ ...prev, padding: v }))
                        }
                        min={0}
                        max={10}
                        step={1}
                      />
                    </div>

                    {/* Error Correction */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label>Error Correction</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="size-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            Higher error correction allows the QR code to be
                            readable even if partially damaged or obscured
                            (e.g., by a logo).
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {(
                          Object.keys(
                            ERROR_CORRECTION_INFO
                          ) as ErrorCorrectionLevel[]
                        ).map((level) => (
                          <Button
                            key={level}
                            variant={
                              options.errorCorrection === level
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                            onClick={() =>
                              setOptions((prev) => ({
                                ...prev,
                                errorCorrection: level,
                              }))
                            }
                          >
                            <span className="font-bold">{level}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Colors */}
                <AccordionItem
                  value="colors"
                  className="border rounded-lg px-4"
                >
                  <AccordionTrigger className="font-bold">
                    Colours
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pb-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Foreground</Label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={options.foregroundColor}
                            onChange={(e) =>
                              setOptions((prev) => ({
                                ...prev,
                                foregroundColor: e.target.value,
                              }))
                            }
                            className="w-12 h-10 rounded border cursor-pointer"
                          />
                          <Input
                            value={options.foregroundColor}
                            onChange={(e) =>
                              setOptions((prev) => ({
                                ...prev,
                                foregroundColor: e.target.value,
                              }))
                            }
                            className="font-mono flex-1"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Background</Label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={options.backgroundColor}
                            onChange={(e) =>
                              setOptions((prev) => ({
                                ...prev,
                                backgroundColor: e.target.value,
                              }))
                            }
                            className="w-12 h-10 rounded border cursor-pointer"
                          />
                          <Input
                            value={options.backgroundColor}
                            onChange={(e) =>
                              setOptions((prev) => ({
                                ...prev,
                                backgroundColor: e.target.value,
                              }))
                            }
                            className="font-mono flex-1"
                          />
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Style */}
                <AccordionItem value="style" className="border rounded-lg px-4">
                  <AccordionTrigger className="font-bold">
                    Shapes
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pb-4">
                    <div className="space-y-2">
                      <Label>Bit Style</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {DOT_STYLES.map((style) => (
                          <Button
                            key={style.value}
                            variant={
                              options.dotType === style.value
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                            onClick={() =>
                              setOptions((prev) => ({
                                ...prev,
                                dotType: style.value,
                              }))
                            }
                          >
                            {style.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Eyes</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {CORNER_SQUARE_STYLES.map((style) => (
                          <Button
                            key={style.value}
                            variant={
                              options.cornerSquareType === style.value
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                            onClick={() =>
                              setOptions((prev) => ({
                                ...prev,
                                cornerSquareType: style.value,
                              }))
                            }
                          >
                            {style.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Pupils</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {CORNER_DOT_STYLES.map((style) => (
                          <Button
                            key={style.value}
                            variant={
                              options.cornerDotType === style.value
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                            onClick={() =>
                              setOptions((prev) => ({
                                ...prev,
                                cornerDotType: style.value,
                              }))
                            }
                          >
                            {style.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Logo */}
                <AccordionItem value="logo" className="border rounded-lg px-4">
                  <AccordionTrigger className="font-bold">
                    Logo / Image
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pb-4">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    {options.logo ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={options.logo}
                            alt="Logo preview"
                            className="size-16 object-contain rounded border"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setOptions((prev) => ({ ...prev, logo: null }))
                            }
                          >
                            <X className="size-4 mr-2" />
                            Remove
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <Label className="text-sm">Logo Size</Label>
                            <span className="text-sm text-muted-foreground">
                              {Math.round(options.logoSize * 100)}%
                            </span>
                          </div>
                          <Slider
                            value={[options.logoSize]}
                            onValueChange={([v]) =>
                              setOptions((prev) => ({ ...prev, logoSize: v }))
                            }
                            min={0.1}
                            max={0.5}
                            step={0.05}
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <Label className="text-sm">Logo Margin</Label>
                            <span className="text-sm text-muted-foreground">
                              {options.logoMargin}px
                            </span>
                          </div>
                          <Slider
                            value={[options.logoMargin]}
                            onValueChange={([v]) =>
                              setOptions((prev) => ({ ...prev, logoMargin: v }))
                            }
                            min={0}
                            max={20}
                            step={1}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Tip: Use High (H) error correction when adding a logo
                          to ensure the QR code remains scannable.
                        </p>
                      </div>
                    ) : (
                      <div
                        onClick={() => logoInputRef.current?.click()}
                        onDragOver={handleLogoDragOver}
                        onDragLeave={handleLogoDragLeave}
                        onDrop={handleLogoDrop}
                        className={`
                          w-full h-24 border-2 border-dashed rounded-lg cursor-pointer
                          flex flex-col items-center justify-center gap-2 transition-colors
                          ${logoDragging
                            ? "border-primary bg-primary/10"
                            : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/50"
                          }
                        `}
                      >
                        <Upload className={`size-6 ${logoDragging ? "text-primary" : "text-muted-foreground"}`} />
                        <p className="text-sm text-muted-foreground">
                          {logoDragging ? "Drop image here" : "Drop image or click to upload"}
                        </p>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>

              </Accordion>
            </div>
          </div>
        )}

        {/* Inventor Acknowledgements */}
        <div className="border rounded-lg p-4 bg-muted/30">
          <div className="flex items-center gap-2 mb-3">
            <Info className="size-5" />
            <h3 className="font-bold">About {QR_INFO.name}</h3>
          </div>
          <div className="text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">Invented by:</span>{" "}
              {QR_INFO.inventor}
            </p>
            <p>
              <span className="text-muted-foreground">Year:</span>{" "}
              {QR_INFO.year}
            </p>
            <p className="text-muted-foreground mt-2">{QR_INFO.description}</p>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
