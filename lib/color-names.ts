// Color naming utility using meodai/color-names database
// Uses RGB Euclidean distance for nearest-color matching

import { colornames } from "color-name-list/bestof";

interface NamedColor {
  name: string;
  hex: string;
  r: number;
  g: number;
  b: number;
}

// Parse the color data into a more efficient format
const COLOURS: NamedColor[] = colornames.map((c) => {
  const hex = c.hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { name: c.name, hex, r, g, b };
});

// Calculate Euclidean distance between two colors
function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db; // Skip sqrt for performance (comparing relative distances)
}

// Find the closest named color
export function getColorName(hex: string): string {
  // Parse hex
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return "Unknown";

  const r = parseInt(match[1], 16);
  const g = parseInt(match[2], 16);
  const b = parseInt(match[3], 16);

  let closestName = "Unknown";
  let minDistance = Infinity;

  for (const color of COLOURS) {
    const distance = colorDistance(r, g, b, color.r, color.g, color.b);
    if (distance < minDistance) {
      minDistance = distance;
      closestName = color.name;
    }
    // Exact match
    if (distance === 0) break;
  }

  return closestName;
}
