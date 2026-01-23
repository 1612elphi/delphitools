const INCH_TO_MM = 25.4;

export interface PaperSize {
  id: string;
  label: string;
  series: string;
  region: string;
  widthMm: number;
  heightMm: number;
  widthIn: number;
  heightIn: number;
}

export interface PaperGroup {
  id: string;
  label: string;
  description: string;
  sizes: PaperSize[];
}

const withInches = ({
  widthMm,
  heightMm,
  widthIn,
  heightIn,
  ...rest
}: {
  id: string;
  label: string;
  series: string;
  region: string;
  widthMm?: number;
  heightMm?: number;
  widthIn?: number;
  heightIn?: number;
}): PaperSize => {
  const derivedWidthMm = widthMm ?? (widthIn != null ? widthIn * INCH_TO_MM : 0);
  const derivedHeightMm = heightMm ?? (heightIn != null ? heightIn * INCH_TO_MM : 0);
  const derivedWidthIn = widthIn ?? (widthMm != null ? widthMm / INCH_TO_MM : 0);
  const derivedHeightIn = heightIn ?? (heightMm != null ? heightMm / INCH_TO_MM : 0);

  return {
    ...rest,
    widthMm: derivedWidthMm,
    heightMm: derivedHeightMm,
    widthIn: derivedWidthIn,
    heightIn: derivedHeightIn,
  };
};

const isoASize = (label: string, widthMm: number, heightMm: number) =>
  withInches({ id: label.toLowerCase(), label, series: "ISO A", region: "International", widthMm, heightMm });

const isoBSize = (label: string, widthMm: number, heightMm: number) =>
  withInches({ id: label.toLowerCase(), label, series: "ISO B", region: "International", widthMm, heightMm });

const isoCSize = (label: string, widthMm: number, heightMm: number) =>
  withInches({ id: label.toLowerCase(), label, series: "ISO C", region: "International", widthMm, heightMm });

const raSize = (label: string, widthMm: number, heightMm: number) =>
  withInches({ id: label.toLowerCase(), label, series: "Raw Format", region: "International", widthMm, heightMm });

const sraSize = (label: string, widthMm: number, heightMm: number) =>
  withInches({ id: label.toLowerCase(), label, series: "SRA", region: "International", widthMm, heightMm });

const usSize = (id: string, label: string, widthIn: number, heightIn: number) =>
  withInches({ id, label, series: "US Classic", region: "North America", widthIn, heightIn });

const usAnsiSize = (id: string, label: string, widthMm: number, heightMm: number) =>
  withInches({ id, label, series: "US ANSI", region: "North America", widthMm, heightMm });

const usArchSize = (id: string, label: string, widthMm: number, heightMm: number) =>
  withInches({ id, label, series: "US Arch", region: "North America", widthMm, heightMm });

const japaneseSize = (id: string, label: string, widthMm: number, heightMm: number) =>
  withInches({ id, label, series: "Japanese JIS", region: "Japan", widthMm, heightMm });

const chineseSize = (id: string, label: string, widthMm: number, heightMm: number) =>
  withInches({ id, label, series: "Chinese", region: "China", widthMm, heightMm });

const swedishSize = (id: string, label: string, widthMm: number, heightMm: number) =>
  withInches({ id, label, series: "Swedish SIS", region: "Sweden", widthMm, heightMm });

const frenchSize = (id: string, label: string, widthMm: number, heightMm: number) =>
  withInches({ id, label, series: "French Traditional", region: "France", widthMm, heightMm });

const imperialSize = (id: string, label: string, widthMm: number, heightMm: number) =>
  withInches({ id, label, series: "Imperial", region: "UK Traditional", widthMm, heightMm });

export const paperSizeGroups: PaperGroup[] = [
  {
    id: "common",
    label: "Common",
    description: "Common sizes for quick access.",
    sizes: [
      isoASize("A4", 210, 297),
      isoASize("A3", 297, 420),
      sraSize("SRA3", 320, 450),
      usSize("letter", "Letter", 8.5, 11),
    ],
  },
  {
    id: "iso-a",
    label: "ISO A Series",
    description: "International standard sizes with 1:√2 aspect ratio.",
    sizes: [
      isoASize("4A0", 1682, 2378),
      isoASize("2A0", 1189, 1682),
      isoASize("A0", 841, 1189),
      isoASize("A0+", 914, 1292),
      isoASize("A1", 594, 841),
      isoASize("A1+", 609, 914),
      isoASize("A2", 420, 594),
      isoASize("A3", 297, 420),
      isoASize("A3+", 329, 483),
      isoASize("A4", 210, 297),
      isoASize("A5", 148, 210),
      isoASize("A6", 105, 148),
      isoASize("A7", 74, 105),
      isoASize("A8", 52, 74),
      isoASize("A9", 37, 52),
      isoASize("A10", 26, 37),
    ],
  },
  {
    id: "iso-b",
    label: "ISO B Series",
    description: "Geometric mean between A series sizes.",
    sizes: [
      isoBSize("B0", 1000, 1414),
      isoBSize("B1", 707, 1000),
      isoBSize("B2", 500, 707),
      isoBSize("B3", 353, 500),
      isoBSize("B4", 250, 353),
      isoBSize("B5", 176, 250),
      isoBSize("B6", 125, 176),
      isoBSize("B7", 88, 125),
      isoBSize("B8", 62, 88),
      isoBSize("B9", 44, 62),
      isoBSize("B10", 31, 44),
    ],
  },
  {
    id: "iso-c",
    label: "ISO C Series",
    description: "Envelope sizes - geometric mean between A and B.",
    sizes: [
      isoCSize("C0", 917, 1297),
      isoCSize("C1", 648, 917),
      isoCSize("C2", 458, 648),
      isoCSize("C3", 324, 458),
      isoCSize("C4", 229, 324),
      isoCSize("C5", 162, 229),
      isoCSize("C6", 114, 162),
      isoCSize("C7", 81, 114),
      isoCSize("C8", 57, 81),
    ],
  },
  {
    id: "raw-format",
    label: "RA Series",
    description: "Raw format sizes for printing before trimming.",
    sizes: [
      raSize("RA0", 860, 1220),
      raSize("RA1", 610, 860),
      raSize("RA2", 430, 610),
      raSize("RA3", 305, 430),
      raSize("RA4", 215, 305),
    ],
  },
  {
    id: "sra-series",
    label: "SRA Series",
    description: "Supplementary Raw Format A - extra bleed area.",
    sizes: [
      sraSize("SRA0", 900, 1280),
      sraSize("SRA1", 640, 900),
      sraSize("SRA1+", 660, 920),
      sraSize("SRA2", 450, 640),
      sraSize("SRA2+", 480, 650),
      sraSize("SRA3", 320, 450),
      sraSize("SRA3+", 320, 460),
      sraSize("SRA4", 225, 320),
    ],
  },
  {
    id: "us-classic",
    label: "US Classic",
    description: "North American office and press standards.",
    sizes: [
      usSize("letter", "Letter", 8.5, 11),
      usSize("legal", "Legal", 8.5, 14),
      usSize("tabloid", "Tabloid", 11, 17),
      usSize("ledger", "Ledger", 17, 11),
      usSize("junior-legal", "Junior Legal", 5, 8),
      usSize("half-letter", "Half Letter", 5.5, 8.5),
      usSize("government-letter", "Gov Letter", 8, 10.5),
      usSize("government-legal", "Gov Legal", 8.5, 13),
    ],
  },
  {
    id: "us-ansi",
    label: "US ANSI",
    description: "American National Standards Institute sizes.",
    sizes: [
      usAnsiSize("ansi-a", "ANSI A", 216, 279),
      usAnsiSize("ansi-b", "ANSI B", 279, 432),
      usAnsiSize("ansi-c", "ANSI C", 432, 559),
      usAnsiSize("ansi-d", "ANSI D", 559, 864),
      usAnsiSize("ansi-e", "ANSI E", 864, 1118),
    ],
  },
  {
    id: "us-arch",
    label: "US Architectural",
    description: "American architectural drawing standards.",
    sizes: [
      usArchSize("arch-a", "Arch A", 229, 305),
      usArchSize("arch-b", "Arch B", 305, 457),
      usArchSize("arch-c", "Arch C", 457, 610),
      usArchSize("arch-d", "Arch D", 610, 914),
      usArchSize("arch-e", "Arch E", 914, 1219),
      usArchSize("arch-e1", "Arch E1", 762, 1067),
    ],
  },
  {
    id: "japanese",
    label: "Japanese JIS",
    description: "Japanese Industrial Standard paper sizes.",
    sizes: [
      japaneseSize("jb0", "JB0", 1030, 1456),
      japaneseSize("jb1", "JB1", 728, 1030),
      japaneseSize("jb2", "JB2", 515, 728),
      japaneseSize("jb3", "JB3", 364, 515),
      japaneseSize("jb4", "JB4", 257, 364),
      japaneseSize("jb5", "JB5", 182, 257),
      japaneseSize("jb6", "JB6", 128, 182),
      japaneseSize("shiroku-ban-4", "Shiroku ban 4", 264, 379),
      japaneseSize("shiroku-ban-5", "Shiroku ban 5", 189, 262),
      japaneseSize("kiku-4", "Kiku 4", 227, 306),
      japaneseSize("kiku-5", "Kiku 5", 151, 227),
    ],
  },
  {
    id: "chinese",
    label: "Chinese",
    description: "Chinese national standard paper sizes.",
    sizes: [
      chineseSize("d0", "D0", 764, 1064),
      chineseSize("d1", "D1", 532, 760),
      chineseSize("d2", "D2", 380, 532),
      chineseSize("d3", "D3", 266, 380),
      chineseSize("d4", "D4", 190, 266),
      chineseSize("d5", "D5", 133, 190),
      chineseSize("d6", "D6", 95, 133),
    ],
  },
  {
    id: "swedish",
    label: "Swedish SIS",
    description: "Swedish standard paper sizes.",
    sizes: [
      swedishSize("sis-d0", "SIS D0", 1091, 1542),
      swedishSize("sis-d1", "SIS D1", 771, 1091),
      swedishSize("sis-d2", "SIS D2", 545, 771),
      swedishSize("sis-d3", "SIS D3", 386, 545),
      swedishSize("sis-d4", "SIS D4", 273, 386),
      swedishSize("sis-e0", "SIS E0", 878, 1242),
      swedishSize("sis-e1", "SIS E1", 621, 878),
      swedishSize("sis-e2", "SIS E2", 439, 621),
      swedishSize("sis-e3", "SIS E3", 310, 439),
      swedishSize("sis-e4", "SIS E4", 220, 310),
    ],
  },
  {
    id: "french",
    label: "French Traditional",
    description: "Traditional French paper sizes.",
    sizes: [
      frenchSize("cloche", "Cloche", 300, 400),
      frenchSize("pot-ecolier", "Pot, écolier", 310, 400),
      frenchSize("telliere", "Tellière", 340, 440),
      frenchSize("couronne-ecriture", "Couronne écriture", 360, 360),
      frenchSize("couronne-edition", "Couronne édition", 370, 470),
      frenchSize("raisin", "Raisin", 500, 650),
      frenchSize("double-raisin", "Double Raisin", 650, 1000),
      frenchSize("jesus", "Jésus", 560, 760),
      frenchSize("soleil", "Soleil", 600, 800),
      frenchSize("colombier-affiche", "Colombier affiche", 600, 800),
      frenchSize("grand-aigle", "Grand Aigle", 750, 1050),
      frenchSize("univers", "Univers", 1000, 1130),
    ],
  },
  {
    id: "imperial",
    label: "Imperial",
    description: "Traditional British Imperial paper sizes.",
    sizes: [
      imperialSize("antiquarian", "Antiquarian", 787, 1346),
      imperialSize("atlas", "Atlas", 660, 864),
      imperialSize("broadsheet", "Broadsheet", 457, 610),
      imperialSize("crown", "Crown", 381, 508),
      imperialSize("demy", "Demy", 445, 572),
      imperialSize("double-demy", "Double Demy", 572, 902),
      imperialSize("elephant", "Elephant", 584, 711),
      imperialSize("emperor", "Emperor", 1219, 1829),
      imperialSize("foolscap", "Foolscap", 343, 432),
      imperialSize("imperial", "Imperial", 559, 762),
      imperialSize("medium", "Medium", 470, 584),
      imperialSize("royal", "Royal", 508, 635),
    ],
  },
];

// Fraction formatting utilities

const FRACTIONS: Record<number, string> = {
  0: "",
  0.125: "⅛",
  0.25: "¼",
  0.375: "⅜",
  0.5: "½",
  0.625: "⅝",
  0.75: "¾",
  0.875: "⅞",
};

export function formatFraction(inches: number): string {
  const whole = Math.floor(inches);
  const decimal = inches - whole;
  // Find closest 1/8
  const eighths = Math.round(decimal * 8) / 8;
  // Check if it's within tolerance (0.01")
  if (Math.abs(decimal - eighths) < 0.01 && FRACTIONS[eighths] !== undefined) {
    const frac = FRACTIONS[eighths];
    return whole > 0 ? `${whole}${frac}` : frac || "0";
  }
  // Decimal fallback
  return inches.toFixed(2);
}

export function formatDimensions(size: PaperSize, unit: "mm" | "in"): string {
  if (unit === "mm") {
    return `${Math.round(size.widthMm)} × ${Math.round(size.heightMm)} mm`;
  }
  return `${formatFraction(size.widthIn)} × ${formatFraction(size.heightIn)}"`;
}
