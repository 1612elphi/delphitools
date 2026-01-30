"use client";

import { useState, useCallback, useMemo } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Unit {
  name: string;
  symbol: string;
  toBase: (value: number) => number;
  fromBase: (value: number) => number;
}

interface UnitCategory {
  name: string;
  baseUnit: string;
  units: Record<string, Unit>;
}

const UNIT_CATEGORIES: Record<string, UnitCategory> = {
  length: {
    name: "Length",
    baseUnit: "meter",
    units: {
      meter: {
        name: "Metre",
        symbol: "m",
        toBase: (v) => v,
        fromBase: (v) => v,
      },
      kilometer: {
        name: "Kilometre",
        symbol: "km",
        toBase: (v) => v * 1000,
        fromBase: (v) => v / 1000,
      },
      centimeter: {
        name: "Centimetre",
        symbol: "cm",
        toBase: (v) => v / 100,
        fromBase: (v) => v * 100,
      },
      millimeter: {
        name: "Millimetre",
        symbol: "mm",
        toBase: (v) => v / 1000,
        fromBase: (v) => v * 1000,
      },
      mile: {
        name: "Mile",
        symbol: "mi",
        toBase: (v) => v * 1609.344,
        fromBase: (v) => v / 1609.344,
      },
      yard: {
        name: "Yard",
        symbol: "yd",
        toBase: (v) => v * 0.9144,
        fromBase: (v) => v / 0.9144,
      },
      foot: {
        name: "Foot",
        symbol: "ft",
        toBase: (v) => v * 0.3048,
        fromBase: (v) => v / 0.3048,
      },
      inch: {
        name: "Inch",
        symbol: "in",
        toBase: (v) => v * 0.0254,
        fromBase: (v) => v / 0.0254,
      },
      nauticalMile: {
        name: "Nautical Mile",
        symbol: "nmi",
        toBase: (v) => v * 1852,
        fromBase: (v) => v / 1852,
      },
    },
  },
  weight: {
    name: "Weight",
    baseUnit: "kilogram",
    units: {
      kilogram: {
        name: "Kilogram",
        symbol: "kg",
        toBase: (v) => v,
        fromBase: (v) => v,
      },
      gram: {
        name: "Gram",
        symbol: "g",
        toBase: (v) => v / 1000,
        fromBase: (v) => v * 1000,
      },
      milligram: {
        name: "Milligram",
        symbol: "mg",
        toBase: (v) => v / 1000000,
        fromBase: (v) => v * 1000000,
      },
      pound: {
        name: "Pound",
        symbol: "lb",
        toBase: (v) => v * 0.453592,
        fromBase: (v) => v / 0.453592,
      },
      ounce: {
        name: "Ounce",
        symbol: "oz",
        toBase: (v) => v * 0.0283495,
        fromBase: (v) => v / 0.0283495,
      },
      stone: {
        name: "Stone",
        symbol: "st",
        toBase: (v) => v * 6.35029,
        fromBase: (v) => v / 6.35029,
      },
      tonne: {
        name: "Tonne",
        symbol: "t",
        toBase: (v) => v * 1000,
        fromBase: (v) => v / 1000,
      },
    },
  },
  data: {
    name: "Data",
    baseUnit: "byte",
    units: {
      byte: {
        name: "Byte",
        symbol: "B",
        toBase: (v) => v,
        fromBase: (v) => v,
      },
      kilobyte: {
        name: "Kilobyte",
        symbol: "KB",
        toBase: (v) => v * 1024,
        fromBase: (v) => v / 1024,
      },
      megabyte: {
        name: "Megabyte",
        symbol: "MB",
        toBase: (v) => v * 1024 ** 2,
        fromBase: (v) => v / 1024 ** 2,
      },
      gigabyte: {
        name: "Gigabyte",
        symbol: "GB",
        toBase: (v) => v * 1024 ** 3,
        fromBase: (v) => v / 1024 ** 3,
      },
      terabyte: {
        name: "Terabyte",
        symbol: "TB",
        toBase: (v) => v * 1024 ** 4,
        fromBase: (v) => v / 1024 ** 4,
      },
      petabyte: {
        name: "Petabyte",
        symbol: "PB",
        toBase: (v) => v * 1024 ** 5,
        fromBase: (v) => v / 1024 ** 5,
      },
      bit: {
        name: "Bit",
        symbol: "b",
        toBase: (v) => v / 8,
        fromBase: (v) => v * 8,
      },
      kilobit: {
        name: "Kilobit",
        symbol: "Kb",
        toBase: (v) => (v * 1024) / 8,
        fromBase: (v) => (v * 8) / 1024,
      },
      megabit: {
        name: "Megabit",
        symbol: "Mb",
        toBase: (v) => (v * 1024 ** 2) / 8,
        fromBase: (v) => (v * 8) / 1024 ** 2,
      },
      gigabit: {
        name: "Gigabit",
        symbol: "Gb",
        toBase: (v) => (v * 1024 ** 3) / 8,
        fromBase: (v) => (v * 8) / 1024 ** 3,
      },
    },
  },
  temperature: {
    name: "Temp",
    baseUnit: "celsius",
    units: {
      celsius: {
        name: "Celsius",
        symbol: "°C",
        toBase: (v) => v,
        fromBase: (v) => v,
      },
      fahrenheit: {
        name: "Fahrenheit",
        symbol: "°F",
        toBase: (v) => ((v - 32) * 5) / 9,
        fromBase: (v) => (v * 9) / 5 + 32,
      },
      kelvin: {
        name: "Kelvin",
        symbol: "K",
        toBase: (v) => v - 273.15,
        fromBase: (v) => v + 273.15,
      },
    },
  },
  speed: {
    name: "Speed",
    baseUnit: "mps",
    units: {
      mps: {
        name: "Metres/sec",
        symbol: "m/s",
        toBase: (v) => v,
        fromBase: (v) => v,
      },
      kmph: {
        name: "km/hour",
        symbol: "km/h",
        toBase: (v) => v / 3.6,
        fromBase: (v) => v * 3.6,
      },
      mph: {
        name: "Miles/hour",
        symbol: "mph",
        toBase: (v) => v * 0.44704,
        fromBase: (v) => v / 0.44704,
      },
      knot: {
        name: "Knot",
        symbol: "kn",
        toBase: (v) => v * 0.514444,
        fromBase: (v) => v / 0.514444,
      },
      fps: {
        name: "Feet/sec",
        symbol: "ft/s",
        toBase: (v) => v * 0.3048,
        fromBase: (v) => v / 0.3048,
      },
    },
  },
  area: {
    name: "Area",
    baseUnit: "sqm",
    units: {
      sqm: {
        name: "Square metre",
        symbol: "m²",
        toBase: (v) => v,
        fromBase: (v) => v,
      },
      sqkm: {
        name: "Square km",
        symbol: "km²",
        toBase: (v) => v * 1000000,
        fromBase: (v) => v / 1000000,
      },
      sqft: {
        name: "Square foot",
        symbol: "ft²",
        toBase: (v) => v * 0.092903,
        fromBase: (v) => v / 0.092903,
      },
      sqyd: {
        name: "Square yard",
        symbol: "yd²",
        toBase: (v) => v * 0.836127,
        fromBase: (v) => v / 0.836127,
      },
      acre: {
        name: "Acre",
        symbol: "ac",
        toBase: (v) => v * 4046.86,
        fromBase: (v) => v / 4046.86,
      },
      hectare: {
        name: "Hectare",
        symbol: "ha",
        toBase: (v) => v * 10000,
        fromBase: (v) => v / 10000,
      },
      sqmi: {
        name: "Square mile",
        symbol: "mi²",
        toBase: (v) => v * 2589988.11,
        fromBase: (v) => v / 2589988.11,
      },
    },
  },
  volume: {
    name: "Volume",
    baseUnit: "liter",
    units: {
      liter: {
        name: "Litre",
        symbol: "L",
        toBase: (v) => v,
        fromBase: (v) => v,
      },
      milliliter: {
        name: "Millilitre",
        symbol: "mL",
        toBase: (v) => v / 1000,
        fromBase: (v) => v * 1000,
      },
      cubicMeter: {
        name: "Cubic metre",
        symbol: "m³",
        toBase: (v) => v * 1000,
        fromBase: (v) => v / 1000,
      },
      gallon: {
        name: "Gallon (US)",
        symbol: "gal",
        toBase: (v) => v * 3.78541,
        fromBase: (v) => v / 3.78541,
      },
      gallonUK: {
        name: "Gallon (UK)",
        symbol: "gal UK",
        toBase: (v) => v * 4.54609,
        fromBase: (v) => v / 4.54609,
      },
      quart: {
        name: "Quart (US)",
        symbol: "qt",
        toBase: (v) => v * 0.946353,
        fromBase: (v) => v / 0.946353,
      },
      pint: {
        name: "Pint (US)",
        symbol: "pt",
        toBase: (v) => v * 0.473176,
        fromBase: (v) => v / 0.473176,
      },
      cup: {
        name: "Cup (US)",
        symbol: "cup",
        toBase: (v) => v * 0.236588,
        fromBase: (v) => v / 0.236588,
      },
      fluidOz: {
        name: "Fluid oz (US)",
        symbol: "fl oz",
        toBase: (v) => v * 0.0295735,
        fromBase: (v) => v / 0.0295735,
      },
    },
  },
};

const CATEGORY_KEYS = Object.keys(UNIT_CATEGORIES);

export function UnitConverterTool() {
  const [category, setCategory] = useState("length");
  const [inputUnit, setInputUnit] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const currentCategory = UNIT_CATEGORIES[category];
  const unitKeys = Object.keys(currentCategory.units);

  const convert = useCallback(
    (value: number, from: string, to: string): number => {
      const fromDef = currentCategory.units[from];
      const toDef = currentCategory.units[to];
      if (!fromDef || !toDef) return 0;

      const baseValue = fromDef.toBase(value);
      return toDef.fromBase(baseValue);
    },
    [currentCategory]
  );

  const allConversions = useMemo(() => {
    const num = parseFloat(inputValue);
    if (isNaN(num) || !inputUnit) return null;

    const results: Record<string, number> = {};
    for (const key of unitKeys) {
      results[key] = convert(num, inputUnit, key);
    }
    return results;
  }, [inputValue, inputUnit, unitKeys, convert]);

  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory);
    setInputUnit(null);
    setInputValue("");
  };

  const handleUnitInput = (unitKey: string, value: string) => {
    setInputUnit(unitKey);
    setInputValue(value);
  };

  const copyValue = async (value: string, key: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const formatNumber = (num: number): string => {
    if (num === 0) return "0";
    if (Math.abs(num) < 0.0001 || Math.abs(num) >= 1e9) {
      return num.toExponential(4);
    }
    return parseFloat(num.toPrecision(8)).toString();
  };

  const hasValue = inputValue !== "" && inputUnit !== null;

  return (
    <div className="space-y-6">
      {/* Category Tabs - Full Width */}
      <Tabs value={category} onValueChange={handleCategoryChange}>
        <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${CATEGORY_KEYS.length}, 1fr)` }}>
          {CATEGORY_KEYS.map((key) => (
            <TabsTrigger key={key} value={key} className="text-xs sm:text-sm">
              {UNIT_CATEGORIES[key].name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Unit Input Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {unitKeys.map((unitKey) => {
          const unit = currentCategory.units[unitKey];
          const isActive = inputUnit === unitKey && hasValue;
          const displayValue = allConversions ? formatNumber(allConversions[unitKey]) : "";

          return (
            <div
              key={unitKey}
              className={`p-4 rounded-lg border bg-card transition-colors ${
                isActive ? "ring-2 ring-primary" : ""
              }`}
            >
              <Label className="text-sm text-muted-foreground mb-2 block">
                {unit.name}
                <span className="ml-1 opacity-60">({unit.symbol})</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={isActive ? inputValue : displayValue}
                  onChange={(e) => handleUnitInput(unitKey, e.target.value)}
                  placeholder="0"
                  className="font-mono flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyValue(displayValue || inputValue, unitKey)}
                  disabled={!displayValue && !inputValue}
                  className="shrink-0"
                >
                  {copied === unitKey ? (
                    <Check className="size-4 text-green-500" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
