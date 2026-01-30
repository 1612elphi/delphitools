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
    <div className="space-y-6">
      {/* Current Time Display */}
      <div className="p-4 rounded-lg border bg-card">
        <p className="text-sm text-muted-foreground mb-1">Current Time</p>
        <p className="text-2xl font-mono font-medium tabular-nums">
          {formatInTimezone(currentTime, "UTC")}
          <span className="text-muted-foreground ml-2 text-base">UTC</span>
        </p>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          {Math.floor(currentTime.getTime() / 1000)}
        </p>
      </div>

      <Tabs defaultValue="convert">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="convert">Convert</TabsTrigger>
          <TabsTrigger value="timezones">Timezones</TabsTrigger>
          <TabsTrigger value="arithmetic">Date Math</TabsTrigger>
        </TabsList>

        <TabsContent value="convert" className="space-y-6">
          {/* Format Input Cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            {FORMATS.map((format) => (
              <div
                key={format}
                className={`p-4 rounded-lg border bg-card transition-colors ${
                  activeFormat === format && hasValue ? "ring-2 ring-primary" : ""
                }`}
              >
                <Label className="text-sm text-muted-foreground mb-2 block">
                  {FORMAT_INFO[format].name}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={values[format]}
                    onChange={(e) => handleFormatInput(format, e.target.value)}
                    placeholder={FORMAT_INFO[format].placeholder}
                    className="font-mono flex-1 text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyValue(values[format], format)}
                    disabled={!values[format]}
                    className="shrink-0"
                  >
                    {copied === format ? (
                      <Check className="size-4 text-green-500" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={setNow} className="flex-1">
              Use Current Time
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Relative Time */}
          {currentDate && (
            <div className="p-4 rounded-lg border bg-card">
              <p className="text-sm text-muted-foreground">Relative</p>
              <p className="text-lg font-medium">{getRelativeTime(currentDate)}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="timezones" className="space-y-6">
          {/* Timezone selector */}
          <div className="flex gap-2">
            <Select onValueChange={addTimezone}>
              <SelectTrigger className="flex-1">
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

          {/* Timezone cards */}
          <div className="grid gap-3">
            {selectedZones.map((tz) => {
              const tzInfo = TIMEZONES.find((t) => t.value === tz);
              const offset = getTimezoneOffset(currentTime, tz);
              return (
                <div
                  key={tz}
                  className="p-4 rounded-lg border bg-card flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{tzInfo?.label || tz}</span>
                      <span className="text-sm text-muted-foreground">{offset}</span>
                    </div>
                    <p className="text-lg font-mono tabular-nums mt-1">
                      {formatInTimezone(currentTime, tz)}
                    </p>
                  </div>
                  {selectedZones.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTimezone(tz)}
                      className="shrink-0"
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            Times update live. Add up to 6 timezones.
          </p>
        </TabsContent>

        <TabsContent value="arithmetic" className="space-y-6">
          {/* Base Date Input */}
          <div className="p-4 rounded-lg border bg-card">
            <Label className="text-sm text-muted-foreground mb-2 block">
              Starting Date & Time
            </Label>
            <div className="flex gap-2">
              <Input
                value={baseDateTime}
                onChange={(e) => setBaseDateTime(e.target.value)}
                placeholder="2024-01-01 00:00:00"
                className="font-mono flex-1"
              />
              <Button variant="outline" onClick={setNowForArithmetic}>
                Now
              </Button>
            </div>
          </div>

          {/* Operation */}
          <div className="p-4 rounded-lg border bg-card">
            <Label className="text-sm text-muted-foreground mb-3 block">
              Operation
            </Label>
            <div className="flex gap-2 mb-4">
              <Button
                variant={arithmeticMode === "add" ? "default" : "outline"}
                onClick={() => setArithmeticMode("add")}
                className="flex-1"
              >
                <Plus className="size-4 mr-2" />
                Add
              </Button>
              <Button
                variant={arithmeticMode === "subtract" ? "default" : "outline"}
                onClick={() => setArithmeticMode("subtract")}
                className="flex-1"
              >
                <Minus className="size-4 mr-2" />
                Subtract
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                value={arithmeticAmount}
                onChange={(e) => setArithmeticAmount(e.target.value)}
                className="w-24 font-mono"
                min={0}
              />
              <Select
                value={arithmeticUnit}
                onValueChange={(v) => setArithmeticUnit(v as TimeUnit)}
              >
                <SelectTrigger className="flex-1">
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

          {/* Result */}
          {arithmeticResult && (
            <div className="p-4 rounded-lg border bg-card">
              <p className="text-sm text-muted-foreground mb-1">Result</p>
              <p className="text-xl font-mono font-medium tabular-nums">
                {formatInTimezone(arithmeticResult, "UTC")}
              </p>
              <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                <span className="font-mono">
                  {Math.floor(arithmeticResult.getTime() / 1000)}
                </span>
                <span>{getRelativeTime(arithmeticResult)}</span>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
