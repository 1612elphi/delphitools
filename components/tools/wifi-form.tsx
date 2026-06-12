"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";

export interface WiFiFormData {
  ssid: string;
  password: string;
  securityType: "nopass" | "WPA" | "WEP";
  isHidden: boolean;
}

// The ZXing WIFI: spec requires escaping \ ; , " : — unescaped quotes make
// scanners treat the value as hex/quoted rather than literal text
function escapeWiFiValue(value: string): string {
  return value.replace(/[\\;,":]/g, "\\$&");
}

// Format: WIFI:T:{security};S:{ssid};P:{password};H:true;;
// Returns "" while the form is incomplete — a secured network without a
// password would encode an unjoinable QR
export function generateWiFiString(data: WiFiFormData): string {
  const { ssid, password, securityType, isHidden } = data;

  if (!ssid.trim()) return "";
  if (securityType !== "nopass" && !password) return "";

  let wifiString = `WIFI:T:${securityType};S:${escapeWiFiValue(ssid)}`;

  if (securityType !== "nopass") {
    wifiString += `;P:${escapeWiFiValue(password)}`;
  }

  if (isHidden) {
    wifiString += ";H:true";
  }

  return wifiString + ";;";
}

interface WiFiFormProps {
  data: WiFiFormData;
  onChange: (data: WiFiFormData) => void;
}

export function WiFiForm({ data, onChange }: WiFiFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const secured = data.securityType !== "nopass";

  const handleFieldChange = (
    field: keyof WiFiFormData,
    value: string | boolean
  ) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ssid">Network Name (SSID)</Label>
        <Input
          id="ssid"
          type="text"
          value={data.ssid}
          onChange={(e) => handleFieldChange("ssid", e.target.value)}
          placeholder="My WiFi Network"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="securityType">Security Type</Label>
          <Select
            value={data.securityType}
            onValueChange={(value) =>
              handleFieldChange(
                "securityType",
                value as WiFiFormData["securityType"]
              )
            }
          >
            <SelectTrigger id="securityType" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nopass">No password</SelectItem>
              <SelectItem value="WPA">WPA/WPA2</SelectItem>
              <SelectItem value="WEP">WEP</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="off"
              disabled={!secured}
              value={secured ? data.password : ""}
              onChange={(e) => handleFieldChange("password", e.target.value)}
              placeholder={secured ? "Enter WiFi password" : "Open network"}
              className="pr-10"
            />
            {secured && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:bg-transparent"
                onClick={() => setShowPassword((show) => !show)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
            )}
          </div>
          {secured && data.ssid.trim() && !data.password && (
            <p className="text-xs text-muted-foreground">
              Enter the password to generate the QR code.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="isHidden">Hidden network</Label>
          <p className="text-xs text-muted-foreground">
            For networks that don&apos;t broadcast their SSID.
          </p>
        </div>
        <Switch
          id="isHidden"
          checked={data.isHidden}
          onCheckedChange={(checked) => handleFieldChange("isHidden", checked)}
        />
      </div>
    </div>
  );
}
