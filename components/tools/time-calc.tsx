"use client";

import { useState, useEffect, useCallback } from "react";
import { Copy, Check, Plus, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "America/Chicago", label: "Chicago" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Asia/Shanghai", label: "Shanghai" },
  { value: "Asia/Kolkata", label: "Mumbai" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "Pacific/Auckland", label: "Auckland" },
];

type TimeFormat = "unix" | "unixMs" | "iso" | "human";
type TimeUnit = "minutes" | "hours" | "days" | "weeks" | "months";

interface FormatValues {
  unix: string;
  unixMs: string;
  iso: string;
  human: string;
}

const FORMAT_INFO: Record<TimeFormat, { name: string; placeholder: string }> = {
  unix: { name: "Unix (seconds)", placeholder: "1704067200" },
  unixMs: { name: "Unix (milliseconds)", placeholder: "1704067200000" },
  iso: { name: "ISO 8601", placeholder: "2024-01-01T00:00:00.000Z" },
  human: { name: "Date & Time", placeholder: "2024-01-01 00:00:00" },
};

const FORMATS: TimeFormat[] = ["unix", "unixMs", "iso", "human"];

export function TimeCalcTool() {
  const [values, setValues] = useState<FormatValues>({
    unix: "",
    unixMs: "",
    iso: "",
    human: "",
  });
  const [activeFormat, setActiveFormat] = useState<TimeFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Multi-timezone display
  const [selectedZones, setSelectedZones] = useState<string[]>([
    "UTC",
    "America/New_York",
    "Europe/London",
    "Asia/Tokyo",
  ]);

  // Date arithmetic state
  const [baseDateTime, setBaseDateTime] = useState("");
  const [arithmeticAmount, setArithmeticAmount] = useState("1");
  const [arithmeticUnit, setArithmeticUnit] = useState<TimeUnit>("days");
  const [arithmeticMode, setArithmeticMode] = useState<"add" | "subtract">("add");

  // Current time display
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatInTimezone = (date: Date, tz: string): string => {
    try {
      return date.toLocaleString("en-GB", {
        timeZone: tz,
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return date.toLocaleString();
    }
  };

  const getTimezoneOffset = (date: Date, tz: string): string => {
    try {
      const formatter = new Intl.DateTimeFormat("en", {
        timeZone: tz,
        timeZoneName: "shortOffset",
      });
      const parts = formatter.formatToParts(date);
      const offsetPart = parts.find((p) => p.type === "timeZoneName");
      return offsetPart?.value || "";
    } catch {
      return "";
    }
  };

  const parseToDate = useCallback((value: string, format: TimeFormat): Date | null => {
    if (!value.trim()) return null;

    try {
      switch (format) {
        case "unix": {
          const ts = parseInt(value, 10);
          if (isNaN(ts)) return null;
          return new Date(ts * 1000);
        }
        case "unixMs": {
          const ts = parseInt(value, 10);
          if (isNaN(ts)) return null;
          return new Date(ts);
        }
        case "iso": {
          const date = new Date(value);
          return isNaN(date.getTime()) ? null : date;
        }
        case "human": {
          // Parse formats like "2024-01-01 00:00:00" or "2024-01-01T00:00:00"
          const normalized = value.replace(" ", "T");
          const date = new Date(normalized);
          return isNaN(date.getTime()) ? null : date;
        }
        default:
          return null;
      }
    } catch {
      return null;
    }
  }, []);

  const dateToFormats = useCallback((date: Date): FormatValues => {
    const pad = (n: number) => n.toString().padStart(2, "0");
    const humanDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

    return {
      unix: Math.floor(date.getTime() / 1000).toString(),
      unixMs: date.getTime().toString(),
      iso: date.toISOString(),
      human: humanDate,
    };
  }, []);

  const handleFormatInput = useCallback(
    (format: TimeFormat, value: string) => {
      setActiveFormat(format);
      setError(null);

      if (!value.trim()) {
        setValues({ unix: "", unixMs: "", iso: "", human: "" });
        return;
      }

      const date = parseToDate(value, format);
      if (!date) {
        setError(`Invalid ${FORMAT_INFO[format].name.toLowerCase()}`);
        setValues((prev) => ({ ...prev, [format]: value }));
        return;
      }

      setValues(dateToFormats(date));
    },
    [parseToDate, dateToFormats]
  );

  const setNow = () => {
    const now = new Date();
    setValues(dateToFormats(now));
  };

  const copyValue = async (value: string, key: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const addTimezone = (tz: string) => {
    if (!selectedZones.includes(tz) && selectedZones.length < 6) {
      setSelectedZones([...selectedZones, tz]);
    }
  };

  const removeTimezone = (tz: string) => {
    if (selectedZones.length > 1) {
      setSelectedZones(selectedZones.filter((z) => z !== tz));
    }
  };

  // Date arithmetic
  const getArithmeticResult = useCallback((): Date | null => {
    if (!baseDateTime) return null;

    const date = new Date(baseDateTime.replace(" ", "T"));
    if (isNaN(date.getTime())) return null;

    const amount = parseInt(arithmeticAmount, 10) || 0;
    if (amount === 0) return date;

    const multiplier = arithmeticMode === "add" ? 1 : -1;

    const msPerUnit: Record<TimeUnit, number> = {
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000,
      months: 30 * 24 * 60 * 60 * 1000,
    };

    return new Date(date.getTime() + multiplier * amount * msPerUnit[arithmeticUnit]);
  }, [baseDateTime, arithmeticAmount, arithmeticUnit, arithmeticMode]);

  const arithmeticResult = getArithmeticResult();

  const getRelativeTime = (date: Date): string => {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const absDiff = Math.abs(diff);
    const isPast = diff < 0;

    const minutes = Math.floor(absDiff / (60 * 1000));
    const hours = Math.floor(absDiff / (60 * 60 * 1000));
    const days = Math.floor(absDiff / (24 * 60 * 60 * 1000));
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    let value: string;
    if (years > 0) value = `${years} year${years > 1 ? "s" : ""}`;
    else if (months > 0) value = `${months} month${months > 1 ? "s" : ""}`;
    else if (weeks > 0) value = `${weeks} week${weeks > 1 ? "s" : ""}`;
    else if (days > 0) value = `${days} day${days > 1 ? "s" : ""}`;
    else if (hours > 0) value = `${hours} hour${hours > 1 ? "s" : ""}`;
    else if (minutes > 0) value = `${minutes} minute${minutes > 1 ? "s" : ""}`;
    else value = "just now";

    if (value === "just now") return value;
    return isPast ? `${value} ago` : `in ${value}`;
  };

  const hasValue = values.unix !== "";
  const currentDate = hasValue ? new Date(parseInt(values.unixMs, 10)) : null;

  const setNowForArithmetic = () => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    setBaseDateTime(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    );
  };

  return (
    <div className="space-y-4">
      {/* Current Time — live ticker */}
      <div className="border-2 border-border">
        <div className="border-b border-border p-4">
          <label className="font-bold">Current Time</label>
        </div>
        <div className="flex items-stretch">
          <div className="flex-1 p-4">
            <p
              className="text-2xl tabular-nums"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            >
              {formatInTimezone(currentTime, "UTC")}
              <span className="ml-2 text-base text-muted-foreground">UTC</span>
            </p>
            <p
              className="mt-1 text-sm text-muted-foreground"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            >
              {Math.floor(currentTime.getTime() / 1000)}
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="convert">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="convert">Convert</TabsTrigger>
          <TabsTrigger value="timezones">Timezones</TabsTrigger>
          <TabsTrigger value="arithmetic">Date Math</TabsTrigger>
        </TabsList>

        <div className="mt-3 border-2 border-border">
          {/* ── Convert tab ─────────────────────────────────────────── */}
          <TabsContent value="convert" className="m-0">
            {/* Format rows — flush table */}
            <div>
              {FORMATS.map((format) => {
                const isActive = activeFormat === format && hasValue;
                return (
                  <div
                    key={format}
                    className={cn(
                      "flex items-stretch border-b border-border last:border-b-0",
                      isActive && "bg-muted/40"
                    )}
                  >
                    <span className="flex w-36 shrink-0 items-center px-4 text-sm font-medium">
                      {FORMAT_INFO[format].name}
                    </span>
                    <div className="flex flex-1 items-stretch border-l border-border">
                      <Input
                        value={values[format]}
                        onChange={(e) => handleFormatInput(format, e.target.value)}
                        placeholder={FORMAT_INFO[format].placeholder}
                        className="flex-1 border-0 bg-transparent"
                        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => copyValue(values[format], format)}
                      disabled={!values[format]}
                      aria-label={`Copy ${FORMAT_INFO[format].name}`}
                      className="flex w-12 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                    >
                      {copied === format ? (
                        <Check className="size-4 text-green-500" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="border-t border-border px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Use Current Time — flush primary */}
            <Button
              variant="outline"
              onClick={setNow}
              className={cn(
                "h-12 w-full border-0 border-t border-border",
                hasValue ? "" : "border-t-0 border-t-2"
              )}
            >
              Use Current Time
            </Button>

            {/* Relative time */}
            {currentDate && (
              <div className="border-t-2 border-border p-4">
                <Label className="font-bold">Relative</Label>
                <p className="mt-2 text-lg font-medium">{getRelativeTime(currentDate)}</p>
              </div>
            )}
          </TabsContent>

          {/* ── Timezones tab ────────────────────────────────────────── */}
          <TabsContent value="timezones" className="m-0">
            {/* Add timezone */}
            <div className="border-b-2 border-border p-4">
              <Label className="font-bold">Add Timezone</Label>
              <div className="mt-3">
                <Select onValueChange={addTimezone}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Add timezone..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.filter((tz) => !selectedZones.includes(tz.value)).map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Timezone table */}
            <div>
              {selectedZones.map((tz) => {
                const tzInfo = TIMEZONES.find((t) => t.value === tz);
                const offset = getTimezoneOffset(currentTime, tz);
                return (
                  <div
                    key={tz}
                    className="flex items-stretch border-b border-border last:border-b-0"
                  >
                    <div className="flex flex-1 flex-col justify-center px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{tzInfo?.label || tz}</span>
                        <span
                          className="text-sm text-muted-foreground"
                          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                        >
                          {offset}
                        </span>
                      </div>
                      <p
                        className="mt-0.5 tabular-nums text-sm text-muted-foreground"
                        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                      >
                        {formatInTimezone(currentTime, tz)}
                      </p>
                    </div>
                    {selectedZones.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTimezone(tz)}
                        aria-label={`Remove ${tzInfo?.label || tz}`}
                        className="flex w-12 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              Times update live. Add up to 6 timezones.
            </div>
          </TabsContent>

          {/* ── Date Math tab ────────────────────────────────────────── */}
          <TabsContent value="arithmetic" className="m-0">
            {/* Starting date */}
            <div className="border-b-2 border-border p-4">
              <Label className="font-bold">Starting Date & Time</Label>
              <div className="mt-3 flex items-stretch border border-border">
                <Input
                  value={baseDateTime}
                  onChange={(e) => setBaseDateTime(e.target.value)}
                  placeholder="2024-01-01 00:00:00"
                  className="flex-1 border-0 bg-transparent"
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                />
                <button
                  type="button"
                  onClick={setNowForArithmetic}
                  className="flex shrink-0 items-center border-l border-border px-4 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Now
                </button>
              </div>
            </div>

            {/* Operation — add / subtract segmented */}
            <div className="border-b-2 border-border p-4">
              <Label className="font-bold">Operation</Label>
              <div className="segmented grid-cols-2 -mx-4 -mb-4 mt-3 border-x-0 border-b-0">
                <Button
                  variant={arithmeticMode === "add" ? "default" : "outline"}
                  onClick={() => setArithmeticMode("add")}
                >
                  <Plus className="mr-2 size-4" />
                  Add
                </Button>
                <Button
                  variant={arithmeticMode === "subtract" ? "default" : "outline"}
                  onClick={() => setArithmeticMode("subtract")}
                >
                  <Minus className="mr-2 size-4" />
                  Subtract
                </Button>
              </div>
            </div>

            {/* Amount + unit — flush row */}
            <div className="border-b-2 border-border p-4">
              <Label className="font-bold">Amount</Label>
              <div className="mt-3 flex items-stretch border border-border">
                <Input
                  type="number"
                  value={arithmeticAmount}
                  onChange={(e) => setArithmeticAmount(e.target.value)}
                  className="w-24 border-0 bg-transparent"
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  min={0}
                />
                <div className="flex flex-1 items-stretch border-l border-border">
                  <Select
                    value={arithmeticUnit}
                    onValueChange={(v) => setArithmeticUnit(v as TimeUnit)}
                  >
                    <SelectTrigger className="flex-1 border-0 bg-transparent">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                      <SelectItem value="weeks">Weeks</SelectItem>
                      <SelectItem value="months">Months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Result */}
            {arithmeticResult && (
              <div className="border-b border-border">
                <div className="border-b border-border px-4 py-3">
                  <Label className="font-bold">Result</Label>
                </div>
                {/* Result rows — flush table */}
                <div
                  className="flex items-stretch border-b border-border"
                >
                  <span className="flex w-24 shrink-0 items-center px-4 text-sm text-muted-foreground">
                    UTC
                  </span>
                  <span
                    className="flex flex-1 items-center border-l border-border px-4 py-3 tabular-nums"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    {formatInTimezone(arithmeticResult, "UTC")}
                  </span>
                </div>
                <div className="flex items-stretch border-b border-border">
                  <span className="flex w-24 shrink-0 items-center px-4 text-sm text-muted-foreground">
                    Unix
                  </span>
                  <span
                    className="flex flex-1 items-center border-l border-border px-4 py-3 tabular-nums"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    {Math.floor(arithmeticResult.getTime() / 1000)}
                  </span>
                </div>
                <div className="flex items-stretch">
                  <span className="flex w-24 shrink-0 items-center px-4 text-sm text-muted-foreground">
                    Relative
                  </span>
                  <span className="flex flex-1 items-center border-l border-border px-4 py-3">
                    {getRelativeTime(arithmeticResult)}
                  </span>
                </div>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
