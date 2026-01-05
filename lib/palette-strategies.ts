// ============================================================================
// PALETTE GENERATION STRATEGIES
// ============================================================================

// ============================================================================
// TYPES
// ============================================================================

export type PaletteCategory =
  | "random"
  | "color-theory"
  | "mood"
  | "era"
  | "nature"
  | "cultural";

export type PaletteStrategy =
  // Random
  | "true-random"
  | "random-cohesive"
  // Color Theory
  | "analogous"
  | "complementary"
  | "triadic"
  | "split-complementary"
  | "tetradic"
  | "monochromatic"
  // Mood
  | "thermos"
  | "specimen"
  | "souvenir"
  | "curfew"
  | "telegraph"
  // Era
  | "70s"
  | "80s"
  | "90s"
  | "y2k"
  // Nature
  | "ocean-sunset"
  | "forest-morning"
  | "desert-dusk"
  | "arctic"
  | "volcanic"
  | "meadow"
  // Cultural
  | "bauhaus"
  | "art-deco"
  | "japanese"
  | "scandinavian"
  | "mexican";

export interface StrategyInfo {
  name: string;
  description: string;
  category: PaletteCategory;
}

export const STRATEGY_CATEGORIES: Record<PaletteCategory, string> = {
  random: "Random",
  "color-theory": "Color Theory",
  mood: "Moods",
  era: "Decades & Eras",
  nature: "Nature & Scenes",
  cultural: "Art & Culture",
};

export const STRATEGY_INFO: Record<PaletteStrategy, StrategyInfo> = {
  // Random
  "true-random": { name: "Chaos", description: "Completely random, no rules", category: "random" },
  "random-cohesive": { name: "Random", description: "Random cohesive palette", category: "random" },
  // Color Theory
  analogous: { name: "Analogous", description: "Adjacent hues on the colour wheel", category: "color-theory" },
  complementary: { name: "Complementary", description: "Opposite hues for high contrast", category: "color-theory" },
  triadic: { name: "Triadic", description: "Three evenly spaced hues", category: "color-theory" },
  "split-complementary": { name: "Split-Comp", description: "Base + two adjacent to complement", category: "color-theory" },
  tetradic: { name: "Tetradic", description: "Four evenly spaced hues", category: "color-theory" },
  monochromatic: { name: "Mono", description: "Single hue, varied lightness", category: "color-theory" },
  // Mood
  thermos: { name: "Thermos", description: "Warm, cozy, retro tones", category: "mood" },
  specimen: { name: "Specimen", description: "Cool, clinical, preserved", category: "mood" },
  souvenir: { name: "Souvenir", description: "Soft, faded pastels", category: "mood" },
  curfew: { name: "Curfew", description: "Dark, moody depths", category: "mood" },
  telegraph: { name: "Telegraph", description: "Muted vintage sepia", category: "mood" },
  // Era
  "70s": { name: "1970s", description: "Earth tones, burnt orange, avocado", category: "era" },
  "80s": { name: "1980s", description: "Neon pink, electric blue, hot purple", category: "era" },
  "90s": { name: "1990s", description: "Grunge, forest green, burgundy", category: "era" },
  y2k: { name: "Y2K", description: "Chrome, cyan, magenta", category: "era" },
  // Nature
  "ocean-sunset": { name: "Ocean Sunset", description: "Coral, rose, ocean blue, dusk", category: "nature" },
  "forest-morning": { name: "Forest Morning", description: "Fresh greens, mist, golden light", category: "nature" },
  "desert-dusk": { name: "Desert Dusk", description: "Terracotta, sand, dusty rose", category: "nature" },
  arctic: { name: "Arctic", description: "Ice blue, white, pale cyan", category: "nature" },
  volcanic: { name: "Volcanic", description: "Black, deep red, orange, ash", category: "nature" },
  meadow: { name: "Meadow", description: "Grass green, wildflowers, sky blue", category: "nature" },
  // Cultural
  bauhaus: { name: "Bauhaus", description: "Primary colors, geometric, bold", category: "cultural" },
  "art-deco": { name: "Art Deco", description: "Gold, black, cream, emerald", category: "cultural" },
  japanese: { name: "Japanese", description: "Indigo, vermillion, gold, cream", category: "cultural" },
  scandinavian: { name: "Scandinavian", description: "White, pale grey, muted pastels", category: "cultural" },
  mexican: { name: "Mexican", description: "Hot pink, orange, turquoise, yellow", category: "cultural" },
};

// ============================================================================
// COLOUR UTILITIES
// ============================================================================

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, v * 255));
}

function oklchToRgb(L: number, c: number, h: number): [number, number, number] {
  const hRad = h * Math.PI / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);

  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
}

function clampOklch(L: number, c: number, h: number): [number, number, number] {
  L = Math.max(0, Math.min(1, L));
  c = Math.max(0, Math.min(0.4, c));
  h = ((h % 360) + 360) % 360;
  return [L, c, h];
}

function oklchToHex(L: number, c: number, h: number): string {
  const [cL, cC, cH] = clampOklch(L, c, h);
  const rgb = oklchToRgb(cL, cC, cH);
  return rgbToHex(
    Math.round(Math.max(0, Math.min(255, rgb[0]))),
    Math.round(Math.max(0, Math.min(255, rgb[1]))),
    Math.round(Math.max(0, Math.min(255, rgb[2])))
  );
}

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function generateRandomBase(): [number, number, number] {
  const L = randomInRange(0.4, 0.75);
  const c = randomInRange(0.08, 0.2);
  const h = randomInRange(0, 360);
  return [L, c, h];
}

// Weighted random selection from hue ranges
interface HueRange {
  h: [number, number];
  weight: number;
  L?: [number, number];
  c?: [number, number];
}

function pickFromHueRanges(ranges: HueRange[], defaultL: [number, number], defaultC: [number, number]): string {
  // Calculate total weight
  const totalWeight = ranges.reduce((sum, r) => sum + r.weight, 0);
  let random = Math.random() * totalWeight;

  // Pick a range based on weight
  let selectedRange = ranges[0];
  for (const range of ranges) {
    random -= range.weight;
    if (random <= 0) {
      selectedRange = range;
      break;
    }
  }

  const h = randomInRange(selectedRange.h[0], selectedRange.h[1]);
  const L = randomInRange(...(selectedRange.L || defaultL));
  const c = randomInRange(...(selectedRange.c || defaultC));

  return oklchToHex(L, c, h);
}

// ============================================================================
// RANDOM STRATEGIES
// ============================================================================

function generateTrueRandomPalette(count: number): string[] {
  return Array.from({ length: count }, () => {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return rgbToHex(r, g, b);
  });
}

// ============================================================================
// COLOR THEORY STRATEGIES
// ============================================================================

function generateAnalogousPalette(count: number): string[] {
  const [baseL, baseC, baseH] = generateRandomBase();
  const spread = 40;
  const step = spread / (count - 1);
  const startH = baseH - spread / 2;

  return Array.from({ length: count }, (_, i) => {
    const h = startH + step * i;
    const L = baseL + randomInRange(-0.1, 0.1);
    const c = baseC + randomInRange(-0.05, 0.05);
    return oklchToHex(L, c, h);
  });
}

function generateComplementaryPalette(count: number): string[] {
  const [baseL, baseC, baseH] = generateRandomBase();
  const complementH = (baseH + 180) % 360;

  const colours: string[] = [];
  const halfCount = Math.ceil(count / 2);

  for (let i = 0; i < halfCount; i++) {
    const hVariation = randomInRange(-15, 15);
    const L = baseL + randomInRange(-0.15, 0.15);
    const c = baseC + randomInRange(-0.05, 0.05);
    colours.push(oklchToHex(L, c, baseH + hVariation));
  }

  for (let i = halfCount; i < count; i++) {
    const hVariation = randomInRange(-15, 15);
    const L = baseL + randomInRange(-0.15, 0.15);
    const c = baseC + randomInRange(-0.05, 0.05);
    colours.push(oklchToHex(L, c, complementH + hVariation));
  }

  return colours;
}

function generateTriadicPalette(count: number): string[] {
  const [baseL, baseC, baseH] = generateRandomBase();
  const angles = [baseH, (baseH + 120) % 360, (baseH + 240) % 360];

  return Array.from({ length: count }, (_, i) => {
    const angleIndex = i % 3;
    const h = angles[angleIndex] + randomInRange(-10, 10);
    const L = baseL + randomInRange(-0.15, 0.15);
    const c = baseC + randomInRange(-0.05, 0.05);
    return oklchToHex(L, c, h);
  });
}

function generateSplitComplementaryPalette(count: number): string[] {
  const [baseL, baseC, baseH] = generateRandomBase();
  const split1 = (baseH + 150) % 360;
  const split2 = (baseH + 210) % 360;
  const angles = [baseH, split1, split2];

  return Array.from({ length: count }, (_, i) => {
    const angleIndex = i % 3;
    const h = angles[angleIndex] + randomInRange(-10, 10);
    const L = baseL + randomInRange(-0.15, 0.15);
    const c = baseC + randomInRange(-0.05, 0.05);
    return oklchToHex(L, c, h);
  });
}

function generateTetradicPalette(count: number): string[] {
  const [baseL, baseC, baseH] = generateRandomBase();
  const angles = [baseH, (baseH + 90) % 360, (baseH + 180) % 360, (baseH + 270) % 360];

  return Array.from({ length: count }, (_, i) => {
    const angleIndex = i % 4;
    const h = angles[angleIndex] + randomInRange(-10, 10);
    const L = baseL + randomInRange(-0.15, 0.15);
    const c = baseC + randomInRange(-0.05, 0.05);
    return oklchToHex(L, c, h);
  });
}

function generateMonochromaticPalette(count: number): string[] {
  const h = randomInRange(0, 360);
  const baseC = randomInRange(0.1, 0.2);
  const lMin = 0.3;
  const lMax = 0.85;
  const lStep = (lMax - lMin) / (count - 1);

  return Array.from({ length: count }, (_, i) => {
    const L = lMax - lStep * i;
    const cMod = L < 0.4 || L > 0.75 ? 0.7 : 1;
    return oklchToHex(L, baseC * cMod, h);
  });
}

function generateRandomCohesivePalette(count: number): string[] {
  const strategies = [
    generateAnalogousPalette,
    generateComplementaryPalette,
    generateTriadicPalette,
    generateSplitComplementaryPalette,
    generateTetradicPalette,
    generateMonochromaticPalette,
  ];
  const strategy = strategies[Math.floor(Math.random() * strategies.length)];
  return strategy(count);
}

// ============================================================================
// MOOD STRATEGIES
// ============================================================================

function generateThermosPalette(count: number): string[] {
  return Array.from({ length: count }, () => {
    const h = randomInRange(15, 55);
    const L = randomInRange(0.45, 0.75);
    const c = randomInRange(0.08, 0.18);
    return oklchToHex(L, c, h);
  });
}

function generateSpecimenPalette(count: number): string[] {
  return Array.from({ length: count }, () => {
    const h = randomInRange(170, 220);
    const L = randomInRange(0.6, 0.9);
    const c = randomInRange(0.03, 0.12);
    return oklchToHex(L, c, h);
  });
}

function generateSouvenirPalette(count: number): string[] {
  return Array.from({ length: count }, () => {
    const h = randomInRange(0, 360);
    const L = randomInRange(0.75, 0.92);
    const c = randomInRange(0.04, 0.10);
    return oklchToHex(L, c, h);
  });
}

function generateCurfewPalette(count: number): string[] {
  return Array.from({ length: count }, () => {
    const h = randomInRange(0, 360);
    const L = randomInRange(0.15, 0.35);
    const c = randomInRange(0.05, 0.15);
    return oklchToHex(L, c, h);
  });
}

function generateTelegraphPalette(count: number): string[] {
  return Array.from({ length: count }, () => {
    const h = randomInRange(30, 60);
    const L = randomInRange(0.4, 0.7);
    const c = randomInRange(0.02, 0.08);
    return oklchToHex(L, c, h);
  });
}

// ============================================================================
// ERA STRATEGIES
// ============================================================================

function generate70sPalette(count: number): string[] {
  // Earth tones: burnt orange, avocado green, mustard, rust, brown
  const ranges: HueRange[] = [
    { h: [25, 45], weight: 3 },   // burnt orange / mustard
    { h: [75, 100], weight: 2 },  // avocado green
    { h: [15, 30], weight: 2 },   // rust / brown
    { h: [45, 65], weight: 1 },   // gold / olive
  ];

  return Array.from({ length: count }, () =>
    pickFromHueRanges(ranges, [0.35, 0.65], [0.08, 0.18])
  );
}

function generate80sPalette(count: number): string[] {
  // Neon: hot pink, electric blue, purple, with high-contrast darks
  const colours: string[] = [];

  for (let i = 0; i < count; i++) {
    // 20% chance of a dark/black
    if (Math.random() < 0.2) {
      const h = randomInRange(0, 360);
      colours.push(oklchToHex(randomInRange(0.12, 0.22), randomInRange(0.02, 0.08), h));
    } else {
      const ranges: HueRange[] = [
        { h: [320, 350], weight: 3 }, // neon pink / magenta
        { h: [220, 270], weight: 2 }, // electric blue / purple
        { h: [280, 320], weight: 2 }, // hot purple / violet
        { h: [170, 200], weight: 1 }, // cyan / teal
      ];
      colours.push(pickFromHueRanges(ranges, [0.55, 0.75], [0.18, 0.30]));
    }
  }

  return colours;
}

function generate90sPalette(count: number): string[] {
  // Grunge: muted forest green, burgundy, navy, flannel tan
  const ranges: HueRange[] = [
    { h: [140, 170], weight: 2 },  // forest green
    { h: [350, 20], weight: 2 },   // burgundy / maroon
    { h: [220, 250], weight: 2 },  // navy / dark blue
    { h: [30, 50], weight: 1 },    // flannel tan / khaki
  ];

  return Array.from({ length: count }, () =>
    pickFromHueRanges(ranges, [0.30, 0.55], [0.05, 0.14])
  );
}

function generateY2KPalette(count: number): string[] {
  // Chrome, cyan, magenta, silver - mix of metallics and brights
  const colours: string[] = [];

  for (let i = 0; i < count; i++) {
    // 30% chance of metallic/silver (low chroma, high lightness)
    if (Math.random() < 0.3) {
      const h = randomInRange(200, 280);
      colours.push(oklchToHex(randomInRange(0.7, 0.88), randomInRange(0.01, 0.04), h));
    } else {
      const ranges: HueRange[] = [
        { h: [180, 200], weight: 2 }, // cyan
        { h: [310, 340], weight: 2 }, // magenta / pink
        { h: [260, 290], weight: 1 }, // lavender / purple
        { h: [50, 70], weight: 1 },   // lime / yellow-green
      ];
      colours.push(pickFromHueRanges(ranges, [0.55, 0.75], [0.15, 0.28]));
    }
  }

  return colours;
}

// ============================================================================
// NATURE STRATEGIES
// ============================================================================

function generateOceanSunsetPalette(count: number): string[] {
  // Coral, rose, ocean blue, purple dusk - gradient-like distribution
  const ranges: HueRange[] = [
    { h: [15, 40], weight: 2, L: [0.6, 0.75] },    // coral / orange
    { h: [340, 360], weight: 2, L: [0.55, 0.7] },  // rose / pink
    { h: [200, 230], weight: 2, L: [0.35, 0.55] }, // ocean blue
    { h: [260, 290], weight: 1, L: [0.25, 0.45] }, // purple dusk
  ];

  return Array.from({ length: count }, () =>
    pickFromHueRanges(ranges, [0.45, 0.7], [0.1, 0.2])
  );
}

function generateForestMorningPalette(count: number): string[] {
  // Fresh greens, lichen, golden light, bark brown, misty
  const colours: string[] = [];

  for (let i = 0; i < count; i++) {
    // 25% chance of misty/pale color
    if (Math.random() < 0.25) {
      const h = randomInRange(90, 150);
      colours.push(oklchToHex(randomInRange(0.8, 0.92), randomInRange(0.02, 0.06), h));
    } else {
      const ranges: HueRange[] = [
        { h: [100, 140], weight: 3 }, // fresh greens
        { h: [75, 100], weight: 2 },  // yellow-green / lichen
        { h: [45, 60], weight: 1 },   // golden morning light
        { h: [25, 40], weight: 1 },   // bark brown
      ];
      colours.push(pickFromHueRanges(ranges, [0.4, 0.7], [0.08, 0.18]));
    }
  }

  return colours;
}

function generateDesertDuskPalette(count: number): string[] {
  // Terracotta, sand, dusty rose, deep purple
  const ranges: HueRange[] = [
    { h: [15, 35], weight: 3, L: [0.45, 0.65] },   // terracotta
    { h: [40, 55], weight: 2, L: [0.7, 0.85] },    // sand / cream
    { h: [350, 15], weight: 2, L: [0.55, 0.7] },   // dusty rose
    { h: [280, 310], weight: 1, L: [0.25, 0.4] },  // deep purple
  ];

  return Array.from({ length: count }, () =>
    pickFromHueRanges(ranges, [0.45, 0.7], [0.06, 0.16])
  );
}

function generateArcticPalette(count: number): string[] {
  // Ice blue, white, grey, pale cyan - very desaturated, high lightness
  const colours: string[] = [];

  for (let i = 0; i < count; i++) {
    // 30% chance of near-white
    if (Math.random() < 0.3) {
      const h = randomInRange(200, 220);
      colours.push(oklchToHex(randomInRange(0.92, 0.98), randomInRange(0.005, 0.02), h));
    } else {
      const ranges: HueRange[] = [
        { h: [200, 220], weight: 3 }, // ice blue
        { h: [180, 200], weight: 2 }, // pale cyan
        { h: [220, 250], weight: 1 }, // steel blue
      ];
      colours.push(pickFromHueRanges(ranges, [0.7, 0.9], [0.02, 0.08]));
    }
  }

  return colours;
}

function generateVolcanicPalette(count: number): string[] {
  // Black, deep red, orange, ash grey - dramatic contrast
  const colours: string[] = [];

  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    if (roll < 0.25) {
      // Black / charcoal
      colours.push(oklchToHex(randomInRange(0.12, 0.22), randomInRange(0.01, 0.03), randomInRange(0, 360)));
    } else if (roll < 0.4) {
      // Ash grey
      colours.push(oklchToHex(randomInRange(0.5, 0.65), randomInRange(0.01, 0.03), randomInRange(20, 40)));
    } else {
      // Hot colors: red, orange
      const ranges: HueRange[] = [
        { h: [0, 20], weight: 2 },    // deep red
        { h: [20, 45], weight: 2 },   // orange / lava
        { h: [45, 60], weight: 1 },   // yellow / fire
      ];
      colours.push(pickFromHueRanges(ranges, [0.4, 0.65], [0.15, 0.25]));
    }
  }

  return colours;
}

function generateMeadowPalette(count: number): string[] {
  // Grass green, wildflower purples, yellows, sky blue
  const ranges: HueRange[] = [
    { h: [100, 135], weight: 3 },  // grass green
    { h: [280, 320], weight: 2 },  // wildflower purple / pink
    { h: [55, 75], weight: 2 },    // yellow / dandelion
    { h: [200, 220], weight: 1 },  // sky blue
  ];

  return Array.from({ length: count }, () =>
    pickFromHueRanges(ranges, [0.55, 0.75], [0.12, 0.22])
  );
}

// ============================================================================
// CULTURAL STRATEGIES
// ============================================================================

function generateBauhausPalette(count: number): string[] {
  // Bauhaus: bold primary colors, strong neutrals, occasional secondary accents
  // The movement valued clarity, boldness, and geometric confidence
  const colours: string[] = [];

  for (let i = 0; i < count; i++) {
    const roll = Math.random();

    if (roll < 0.2) {
      // Strong black or near-black
      colours.push(oklchToHex(randomInRange(0.08, 0.18), randomInRange(0.0, 0.02), randomInRange(0, 360)));
    } else if (roll < 0.3) {
      // Cream / off-white
      colours.push(oklchToHex(randomInRange(0.92, 0.97), randomInRange(0.01, 0.025), randomInRange(80, 100)));
    } else {
      // Primary and secondary colors with Bauhaus boldness
      const ranges: HueRange[] = [
        { h: [15, 35], weight: 3, L: [0.5, 0.62], c: [0.18, 0.26] },    // Bold red-orange
        { h: [85, 105], weight: 3, L: [0.8, 0.88], c: [0.14, 0.2] },    // Strong yellow
        { h: [240, 265], weight: 3, L: [0.4, 0.52], c: [0.12, 0.18] },  // Deep blue
        { h: [35, 55], weight: 1, L: [0.65, 0.75], c: [0.15, 0.2] },    // Ochre / tan
        { h: [140, 160], weight: 1, L: [0.45, 0.55], c: [0.1, 0.15] },  // Muted green
        { h: [0, 15], weight: 1, L: [0.45, 0.55], c: [0.2, 0.26] },     // Pure red
      ];
      colours.push(pickFromHueRanges(ranges, [0.5, 0.7], [0.15, 0.22]));
    }
  }

  return colours;
}

function generateArtDecoPalette(count: number): string[] {
  // Gold, black, cream, emerald - luxurious
  const colours: string[] = [];

  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    if (roll < 0.25) {
      // Gold
      colours.push(oklchToHex(randomInRange(0.7, 0.8), randomInRange(0.12, 0.18), randomInRange(85, 100)));
    } else if (roll < 0.4) {
      // Black
      colours.push(oklchToHex(randomInRange(0.12, 0.2), randomInRange(0.01, 0.03), randomInRange(0, 360)));
    } else if (roll < 0.55) {
      // Cream
      colours.push(oklchToHex(randomInRange(0.9, 0.96), randomInRange(0.015, 0.03), randomInRange(80, 100)));
    } else {
      // Emerald / teal / deep jewel tones
      const ranges: HueRange[] = [
        { h: [155, 175], weight: 2 }, // emerald
        { h: [180, 200], weight: 1 }, // teal
        { h: [0, 15], weight: 1 },    // deep red / garnet
      ];
      colours.push(pickFromHueRanges(ranges, [0.35, 0.55], [0.1, 0.18]));
    }
  }

  return colours;
}

function generateJapanesePalette(count: number): string[] {
  // Traditional Japanese color vocabulary - refined, natural, subtle
  // Draws from the rich palette of kimono, ukiyo-e, and nature
  const colours: string[] = [];

  for (let i = 0; i < count; i++) {
    const roll = Math.random();

    if (roll < 0.15) {
      // Pale neutrals - unbleached cotton, paper, rice
      colours.push(oklchToHex(randomInRange(0.88, 0.95), randomInRange(0.01, 0.03), randomInRange(70, 100)));
    } else if (roll < 0.25) {
      // Earth tones - clay, wood, tea
      colours.push(oklchToHex(randomInRange(0.4, 0.55), randomInRange(0.05, 0.1), randomInRange(35, 60)));
    } else {
      // Traditional color families
      const ranges: HueRange[] = [
        // Indigo family (ai, konjou, ruri) - deep to medium blues
        { h: [245, 270], weight: 3, L: [0.25, 0.45], c: [0.06, 0.14] },
        // Vermillion/red family (shu, aka, beni) - warm reds
        { h: [18, 35], weight: 2, L: [0.45, 0.58], c: [0.14, 0.22] },
        // Deep crimson (enji, kurenai) - cooler reds
        { h: [0, 18], weight: 1, L: [0.35, 0.48], c: [0.12, 0.18] },
        // Gold/ochre (kin, yamabuki)
        { h: [75, 95], weight: 2, L: [0.7, 0.82], c: [0.1, 0.16] },
        // Pine/moss green (matsu, koke)
        { h: [120, 145], weight: 2, L: [0.35, 0.5], c: [0.06, 0.12] },
        // Wisteria/purple (fuji, murasaki)
        { h: [290, 320], weight: 1, L: [0.5, 0.7], c: [0.08, 0.14] },
        // Cherry blossom pink (sakura)
        { h: [340, 360], weight: 1, L: [0.75, 0.88], c: [0.06, 0.12] },
        // Persimmon/orange (kaki)
        { h: [35, 50], weight: 1, L: [0.55, 0.68], c: [0.12, 0.18] },
      ];
      colours.push(pickFromHueRanges(ranges, [0.4, 0.6], [0.08, 0.15]));
    }
  }

  return colours;
}

function generateScandinavianPalette(count: number): string[] {
  // White, pale grey, muted pastels, wood tones - minimal, natural
  const colours: string[] = [];

  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    if (roll < 0.35) {
      // White / off-white
      colours.push(oklchToHex(randomInRange(0.93, 0.98), randomInRange(0.005, 0.015), randomInRange(80, 110)));
    } else if (roll < 0.55) {
      // Pale grey
      colours.push(oklchToHex(randomInRange(0.8, 0.9), randomInRange(0.005, 0.015), randomInRange(200, 260)));
    } else if (roll < 0.75) {
      // Muted pastel (any hue, very low chroma)
      colours.push(oklchToHex(randomInRange(0.8, 0.9), randomInRange(0.02, 0.05), randomInRange(0, 360)));
    } else {
      // Wood tone
      colours.push(oklchToHex(randomInRange(0.55, 0.7), randomInRange(0.04, 0.08), randomInRange(50, 80)));
    }
  }

  return colours;
}

function generateMexicanPalette(count: number): string[] {
  // Hot pink, orange, turquoise, yellow - vibrant, festive
  const ranges: HueRange[] = [
    { h: [330, 350], weight: 2 }, // hot pink
    { h: [20, 40], weight: 2 },   // orange
    { h: [175, 195], weight: 2 }, // turquoise
    { h: [55, 70], weight: 2 },   // yellow
    { h: [280, 310], weight: 1 }, // purple / violet
  ];

  return Array.from({ length: count }, () =>
    pickFromHueRanges(ranges, [0.55, 0.72], [0.18, 0.28])
  );
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

export function generatePalette(count: number, strategy: PaletteStrategy): string[] {
  switch (strategy) {
    // Random
    case "true-random": return generateTrueRandomPalette(count);
    case "random-cohesive": return generateRandomCohesivePalette(count);
    // Color Theory
    case "analogous": return generateAnalogousPalette(count);
    case "complementary": return generateComplementaryPalette(count);
    case "triadic": return generateTriadicPalette(count);
    case "split-complementary": return generateSplitComplementaryPalette(count);
    case "tetradic": return generateTetradicPalette(count);
    case "monochromatic": return generateMonochromaticPalette(count);
    // Mood
    case "thermos": return generateThermosPalette(count);
    case "specimen": return generateSpecimenPalette(count);
    case "souvenir": return generateSouvenirPalette(count);
    case "curfew": return generateCurfewPalette(count);
    case "telegraph": return generateTelegraphPalette(count);
    // Era
    case "70s": return generate70sPalette(count);
    case "80s": return generate80sPalette(count);
    case "90s": return generate90sPalette(count);
    case "y2k": return generateY2KPalette(count);
    // Nature
    case "ocean-sunset": return generateOceanSunsetPalette(count);
    case "forest-morning": return generateForestMorningPalette(count);
    case "desert-dusk": return generateDesertDuskPalette(count);
    case "arctic": return generateArcticPalette(count);
    case "volcanic": return generateVolcanicPalette(count);
    case "meadow": return generateMeadowPalette(count);
    // Cultural
    case "bauhaus": return generateBauhausPalette(count);
    case "art-deco": return generateArtDecoPalette(count);
    case "japanese": return generateJapanesePalette(count);
    case "scandinavian": return generateScandinavianPalette(count);
    case "mexican": return generateMexicanPalette(count);
    // Default
    default: return generateRandomCohesivePalette(count);
  }
}

// Helper to get strategies grouped by category
export function getStrategiesByCategory(): Record<PaletteCategory, { key: PaletteStrategy; info: StrategyInfo }[]> {
  const result: Record<PaletteCategory, { key: PaletteStrategy; info: StrategyInfo }[]> = {
    random: [],
    "color-theory": [],
    mood: [],
    era: [],
    nature: [],
    cultural: [],
  };

  for (const [key, info] of Object.entries(STRATEGY_INFO)) {
    result[info.category].push({ key: key as PaletteStrategy, info });
  }

  return result;
}
