import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface WiFiFormData {
  ssid: string;
  password: string;
  securityType: "nopass" | "WPA" | "WEP" ;
  isHidden: boolean;
}

interface WiFiFormProps {
  data: WiFiFormData;
  onChange: (data: WiFiFormData) => void;
  onQRStringChange: (qrString: string) => void;
}

export function WiFiForm({ data, onChange, onQRStringChange }: WiFiFormProps) {
  const handleFieldChange = (
    field: keyof WiFiFormData,
    value: string | boolean
  ) => {
    const updatedData = { ...data, [field]: value };
    onChange(updatedData);
    // Generate and emit the WiFi QR string
    generateAndEmitQRString(updatedData);
  };

  const generateAndEmitQRString = (formData: WiFiFormData) => {
    const { ssid, password, securityType, isHidden } = formData;

    if (!ssid) {
      onQRStringChange("");
      return;
    }

    // Escape special characters in SSID and password
    const escapedSSID = ssid.replace(/[;:,\\]/g, "\\$&");
    const escapedPassword = password.replace(/[;:,\\]/g, "\\$&");

    // Build WiFi string according to RFC standard
    // Format: WIFI:T:{security};S:{ssid};P:{password};H:{hidden};;
    let wifiString = `WIFI:T:${securityType};S:${escapedSSID}`;

    if (securityType !== "nopass" && password) {
      wifiString += `;P:${escapedPassword}`;
    }

    if (isHidden) {
      wifiString += ";H:true";
    }

    wifiString += ";;";
    onQRStringChange(wifiString);
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
          <SelectTrigger id="securityType">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nopass">No password</SelectItem>
            <SelectItem value="WPA">WPA/WPA2</SelectItem>
            <SelectItem value="WEP">WEP</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.securityType !== "nopass" && (
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="text"
            value={data.password}
            onChange={(e) => handleFieldChange("password", e.target.value)}
            placeholder="Enter WiFi password"
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          id="isHidden"
          type="checkbox"
          checked={data.isHidden}
          onChange={(e) => handleFieldChange("isHidden", e.target.checked)}
          className="w-4 h-4 rounded border border-input"
        />
        <span className="font-medium">Hidden SSID</span>
      </label>
    </div>
  );
}
