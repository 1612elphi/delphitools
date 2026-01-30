export interface MathConstant {
  name: string;
  symbol: string;
  value: number;
  unit?: string;
  category: "mathematical" | "physical" | "chemical";
}

export const MATH_CONSTANTS: MathConstant[] = [
  // Mathematical constants
  { name: "Pi", symbol: "π", value: Math.PI, category: "mathematical" },
  { name: "Euler's number", symbol: "e", value: Math.E, category: "mathematical" },
  { name: "Golden ratio", symbol: "φ", value: 1.618033988749895, category: "mathematical" },
  { name: "Square root of 2", symbol: "√2", value: Math.SQRT2, category: "mathematical" },
  { name: "Square root of 3", symbol: "√3", value: 1.7320508075688772, category: "mathematical" },
  { name: "Natural log of 2", symbol: "ln(2)", value: Math.LN2, category: "mathematical" },
  { name: "Natural log of 10", symbol: "ln(10)", value: Math.LN10, category: "mathematical" },
  { name: "Euler-Mascheroni", symbol: "γ", value: 0.5772156649015329, category: "mathematical" },

  // Physical constants
  { name: "Speed of light", symbol: "c", value: 299792458, unit: "m/s", category: "physical" },
  { name: "Planck constant", symbol: "h", value: 6.62607015e-34, unit: "J·s", category: "physical" },
  { name: "Gravitational constant", symbol: "G", value: 6.6743e-11, unit: "m³/(kg·s²)", category: "physical" },
  { name: "Boltzmann constant", symbol: "kB", value: 1.380649e-23, unit: "J/K", category: "physical" },
  { name: "Elementary charge", symbol: "e", value: 1.602176634e-19, unit: "C", category: "physical" },
  { name: "Electron mass", symbol: "mₑ", value: 9.1093837015e-31, unit: "kg", category: "physical" },
  { name: "Proton mass", symbol: "mₚ", value: 1.67262192369e-27, unit: "kg", category: "physical" },
  { name: "Standard gravity", symbol: "g", value: 9.80665, unit: "m/s²", category: "physical" },

  // Chemical constants
  { name: "Avogadro constant", symbol: "Nₐ", value: 6.02214076e23, unit: "mol⁻¹", category: "chemical" },
  { name: "Gas constant", symbol: "R", value: 8.314462618, unit: "J/(mol·K)", category: "chemical" },
  { name: "Faraday constant", symbol: "F", value: 96485.33212, unit: "C/mol", category: "chemical" },
];

export function formatScientific(value: number): string {
  if (value === 0) return "0";

  const absValue = Math.abs(value);
  if (absValue >= 1e-3 && absValue < 1e6) {
    // Regular notation for reasonable numbers
    return value.toPrecision(10).replace(/\.?0+$/, "");
  }

  // Scientific notation for very large or very small numbers
  const exp = Math.floor(Math.log10(absValue));
  const mantissa = value / Math.pow(10, exp);
  return `${mantissa.toPrecision(6).replace(/\.?0+$/, "")} × 10^${exp}`;
}
