// ============================================================================
// CURATED PALETTE COLLECTION
// ============================================================================

export interface CuratedPalette {
  id: string;
  name: string;
  colors: string[];
  category: PaletteCollectionCategory;
}

export type PaletteCollectionCategory =
  | "classic"
  | "nature"
  | "keycaps"
  | "vintage"
  | "modern"
  | "bold"
  | "soft"
  | "monochrome"
  | "seasonal"
  | "artistic";

export const COLLECTION_CATEGORIES: Record<PaletteCollectionCategory, { label: string; description: string }> = {
  classic: { label: "Classic", description: "Timeless, elegant combinations" },
  nature: { label: "Nature", description: "Inspired by the natural world" },
  keycaps: { label: "Keycaps", description: "Inspired by popular keycap sets" },
  vintage: { label: "Vintage", description: "Retro and nostalgic palettes" },
  modern: { label: "Modern", description: "Contemporary and trendy" },
  bold: { label: "Bold", description: "Vibrant and eye-catching" },
  soft: { label: "Soft", description: "Gentle and calming tones" },
  monochrome: { label: "Monochrome", description: "Single-hue explorations" },
  seasonal: { label: "Seasonal", description: "Capturing the seasons" },
  artistic: { label: "Artistic", description: "Inspired by art movements" },
};

export const CURATED_PALETTES: CuratedPalette[] = [
  // ============================================================================
  // CLASSIC (London Underground stations)
  // ============================================================================
  {
    id: "mayfair",
    name: "Mayfair",
    colors: ["#1a2634", "#2d4a3e", "#6b1c2a", "#c9b896", "#f5f0e6"],
    category: "classic",
  },
  {
    id: "piccadilly",
    name: "Piccadilly",
    colors: ["#0d0d0d", "#1a1a2e", "#c9a227", "#f0d060", "#f5efe6"],
    category: "classic",
  },
  {
    id: "bond-street",
    name: "Bond Street",
    colors: ["#0a0a0a", "#d4af37", "#f5e6d3", "#fff8f0", "#cc0033"],
    category: "classic",
  },
  {
    id: "leicester-square",
    name: "Leicester Square",
    colors: ["#000000", "#2d2d2d", "#ffffff", "#cc2936", "#f5e6e0"],
    category: "classic",
  },
  {
    id: "temple",
    name: "Temple",
    colors: ["#1a120a", "#3d2914", "#6b4423", "#c9a227", "#f5e6d3"],
    category: "classic",
  },
  {
    id: "westminster",
    name: "Westminster",
    colors: ["#1a0f0a", "#4a2c17", "#8b4513", "#c77b4a", "#d4c4a8"],
    category: "classic",
  },
  {
    id: "south-kensington",
    name: "South Kensington",
    colors: ["#1a3d1a", "#2d5a3d", "#f5f0e6", "#c9a86c", "#1a2744"],
    category: "classic",
  },
  {
    id: "hampstead",
    name: "Hampstead",
    colors: ["#1a2744", "#4a1a2e", "#2d4a3e", "#c9a86c", "#f5f0e6"],
    category: "classic",
  },
  {
    id: "sloane-square",
    name: "Sloane Square",
    colors: ["#0d1a26", "#1a3d4a", "#2e6a7a", "#c9d4dc", "#f5f8fa"],
    category: "classic",
  },
  {
    id: "tower-hill",
    name: "Tower Hill",
    colors: ["#0a1628", "#1a3a5c", "#ffffff", "#cc2936", "#c9a227"],
    category: "classic",
  },
  {
    id: "baker-street",
    name: "Baker Street",
    colors: ["#2c1810", "#5c3a28", "#8b6914", "#c9a86c", "#e8dcc8"],
    category: "classic",
  },
  {
    id: "green-park",
    name: "Green Park",
    colors: ["#0d0d0d", "#1a472a", "#c9a227", "#f5f0e6"],
    category: "classic",
  },
  {
    id: "holland-park",
    name: "Holland Park",
    colors: ["#1a2744", "#3d5a80", "#98c1d9", "#e0e1dd", "#c9a86c"],
    category: "classic",
  },
  {
    id: "notting-hill-gate",
    name: "Notting Hill Gate",
    colors: ["#1a0f0a", "#6b4423", "#c77b4a", "#e8c9a0", "#2d5a3d"],
    category: "classic",
  },
  {
    id: "regents-park",
    name: "Regent's Park",
    colors: ["#1a3d1a", "#4a7c59", "#f5f0e6", "#d4af37", "#2d2d2d"],
    category: "classic",
  },
  {
    id: "bank",
    name: "Bank",
    colors: ["#0d0a1a", "#2e1a47", "#6b1c2a", "#c9a227", "#f0d060"],
    category: "classic",
  },
  {
    id: "canary-wharf",
    name: "Canary Wharf",
    colors: ["#1a3a5c", "#5a8faa", "#c9d4dc", "#f5f8fa", "#2d4a3e"],
    category: "classic",
  },
  {
    id: "mansion-house",
    name: "Mansion House",
    colors: ["#1a120a", "#4a2c17", "#8b6914", "#c9a227", "#f0e6d3", "#6b1c2a"],
    category: "classic",
  },
  {
    id: "oxford-circus",
    name: "Oxford Circus",
    colors: ["#1a1a2e", "#2d2d4a", "#4a4a6b", "#8b8ba8", "#c9c9dc"],
    category: "classic",
  },
  {
    id: "high-street-kensington",
    name: "High Street Kensington",
    colors: ["#2d1a2e", "#5c3a5c", "#8b6b8b", "#c9a8c9", "#f0e6f0"],
    category: "classic",
  },
  {
    id: "st-james-park",
    name: "St. James's Park",
    colors: ["#1a2634", "#3d5066", "#c9a227", "#f5f0e6"],
    category: "classic",
  },

  // ============================================================================
  // NATURE
  // ============================================================================
  // North America
  {
    id: "ellesmere",
    name: "Ellesmere",
    colors: ["#E4CAA7", "#735B47", "#4F4331", "#3B2919", "#120D03"],
    category: "nature",
  },
  {
    id: "sequoia",
    name: "Sequoia",
    colors: ["#1a0f0a", "#4a2c17", "#8b4513", "#2d5a3d", "#6b8e6b"],
    category: "nature",
  },
  {
    id: "mojave",
    name: "Mojave",
    colors: ["#f5deb3", "#d4a574", "#c77b4a", "#8b4513", "#4a2c17"],
    category: "nature",
  },
  {
    id: "monterey",
    name: "Monterey",
    colors: ["#1a3d4a", "#2e6b7a", "#5a9baa", "#8ab4c4", "#c9dce6"],
    category: "nature",
  },
  {
    id: "big-sur",
    name: "Big Sur",
    colors: ["#c9d4dc", "#dce4e8", "#e8f0f0", "#f5f8fa", "#5a7a8a"],
    category: "nature",
  },
  {
    id: "muir-woods",
    name: "Muir Woods",
    colors: ["#4a1a0a", "#8b3a1a", "#1a3d1a", "#2e6b3d", "#4a8b5a"],
    category: "nature",
  },
  {
    id: "antelope",
    name: "Antelope Canyon",
    colors: ["#8b4513", "#cd853f", "#deb887", "#f5deb3", "#2d1810"],
    category: "nature",
  },
  {
    id: "hoh",
    name: "Hoh Rainforest",
    colors: ["#0d0a14", "#1a142e", "#2e1a47", "#2e4a2e", "#4a6b4a"],
    category: "nature",
  },
  {
    id: "yellowstone",
    name: "Yellowstone",
    colors: ["#1a1a1a", "#3d3d3d", "#ff4500", "#ff6347", "#ffa07a"],
    category: "nature",
  },
  // South America
  {
    id: "perito-moreno",
    name: "Perito Moreno",
    colors: ["#e8f4f8", "#b8d8e8", "#88c4d8", "#58a8c8", "#2890b8"],
    category: "nature",
  },
  {
    id: "atacama",
    name: "Atacama",
    colors: ["#f5deb3", "#d4a574", "#ff69b4", "#da70d6", "#8b4513"],
    category: "nature",
  },
  {
    id: "pantanal",
    name: "Pantanal",
    colors: ["#1a2e1a", "#2e4a2e", "#4a6b4a", "#6b8b6b", "#8bb88b"],
    category: "nature",
  },
  {
    id: "galapagos",
    name: "Galápagos",
    colors: ["#0a1a1a", "#1a3d3d", "#2e5c5c", "#4a8b7a", "#6bb89b"],
    category: "nature",
  },
  // Europe
  {
    id: "svalbard",
    name: "Svalbard",
    colors: ["#e8f0f0", "#c9d4dc", "#8ba8b8", "#5a7080", "#3d4a52"],
    category: "nature",
  },
  {
    id: "tromso",
    name: "Tromsø",
    colors: ["#0a0a1a", "#1a472a", "#2e8b57", "#48d1cc", "#9370db"],
    category: "nature",
  },
  {
    id: "dartmoor",
    name: "Dartmoor",
    colors: ["#4a5c4a", "#6b8b6b", "#8ba88b", "#a8a8a0", "#6b6b5c"],
    category: "nature",
  },
  {
    id: "cairngorms",
    name: "Cairngorms",
    colors: ["#6b8b6b", "#8ba88b", "#a8c4a8", "#c4d4b8", "#dce8c9"],
    category: "nature",
  },
  {
    id: "bialowieza",
    name: "Białowieża",
    colors: ["#4a3c2e", "#6b5c4a", "#8b7a6b", "#a89b8b", "#c9b8a8"],
    category: "nature",
  },
  {
    id: "stromboli",
    name: "Stromboli",
    colors: ["#1a1a1a", "#2d2d2d", "#ff4500", "#ff6347", "#ffd700"],
    category: "nature",
  },
  {
    id: "connemara",
    name: "Connemara",
    colors: ["#1a120a", "#3d2914", "#5c4a2e", "#8b7a5c", "#a89b7a"],
    category: "nature",
  },
  {
    id: "plitvice",
    name: "Plitvice",
    colors: ["#0d1a26", "#1a3a5c", "#3d6b8a", "#8ab4c4", "#e8f0f5"],
    category: "nature",
  },
  // Asia
  {
    id: "cherrapunji",
    name: "Cherrapunji",
    colors: ["#1a2634", "#3d5066", "#5a7a8a", "#8ba8b8", "#c9d4dc"],
    category: "nature",
  },
  {
    id: "arashiyama",
    name: "Arashiyama",
    colors: ["#6b8e23", "#9acd32", "#c4e854", "#f0f8e0"],
    category: "nature",
  },
  {
    id: "sundarbans",
    name: "Sundarbans",
    colors: ["#1a2e1a", "#2e4a2e", "#4a6b4a", "#6b8b6b", "#c9a86c"],
    category: "nature",
  },
  {
    id: "zhangjiajie",
    name: "Zhangjiajie",
    colors: ["#3d4a52", "#5a7080", "#7a9098", "#98b0b8", "#b8d0d8"],
    category: "nature",
  },
  {
    id: "socotra",
    name: "Socotra",
    colors: ["#9b59b6", "#e74c8b", "#f39c12", "#27ae60", "#3498db"],
    category: "nature",
  },
  // Africa
  {
    id: "serengeti",
    name: "Serengeti",
    colors: ["#f5e6c8", "#d4b896", "#c9a227", "#8b6914", "#4a3c1a"],
    category: "nature",
  },
  {
    id: "namaqualand",
    name: "Namaqualand",
    colors: ["#ff6347", "#ffd700", "#ff69b4", "#9acd32", "#8b4513"],
    category: "nature",
  },
  {
    id: "okavango",
    name: "Okavango",
    colors: ["#1a1a2e", "#2e2e4a", "#4a4a6b", "#6b6b8b", "#ffd700"],
    category: "nature",
  },
  {
    id: "namib",
    name: "Namib",
    colors: ["#f5deb3", "#d4a574", "#c77b4a", "#8b4513", "#1a1a2e"],
    category: "nature",
  },
  // Oceania
  {
    id: "blue-mountains",
    name: "Blue Mountains",
    colors: ["#3d5c4a", "#5a8b6b", "#8bb89b", "#a8d4b8", "#d4e8dc"],
    category: "nature",
  },
  {
    id: "tasmania",
    name: "Tasmania",
    colors: ["#0a1a1a", "#1a3d3d", "#2e5c5c", "#4a8b7a", "#8bb89b"],
    category: "nature",
  },
  {
    id: "milford-sound",
    name: "Milford Sound",
    colors: ["#0d1a26", "#1a3a5c", "#3d6b8a", "#8ab4c4", "#c9dce8"],
    category: "nature",
  },
  {
    id: "palau",
    name: "Palau",
    colors: ["#0a3d5c", "#1a6b8a", "#ff6b6b", "#ffa07a", "#f5deb3"],
    category: "nature",
  },
  {
    id: "hokitika",
    name: "Hokitika",
    colors: ["#5c5c52", "#8b8b7a", "#a8a898", "#c4c4b8", "#e0e0d4"],
    category: "nature",
  },
  // Caribbean / Atlantic
  {
    id: "vieques",
    name: "Vieques",
    colors: ["#0a0a1a", "#1a1a3d", "#00ffff", "#00ff7f", "#7fffd4"],
    category: "nature",
  },
  // Arctic / Antarctic
  {
    id: "mcmurdo",
    name: "McMurdo",
    colors: ["#f0f8ff", "#e0f0f8", "#b0d8e8", "#80c0d8", "#50a8c8"],
    category: "nature",
  },
  // More unique locations
  {
    id: "karelia",
    name: "Karelia",
    colors: ["#f5f5f0", "#e8e8dc", "#c9c9b8", "#5c5c4a", "#2d2d1a"],
    category: "nature",
  },
  {
    id: "naica",
    name: "Naica",
    colors: ["#2e1a47", "#5c3a8b", "#8b5cb8", "#b88bd4", "#d4b8e8"],
    category: "nature",
  },

  // ============================================================================
  // KEYCAPS
  // ============================================================================
  {
    id: "2600",
    name: "2600",
    colors: ["#ffffff", "#eae146", "#75397f", "#6588c2", "#262626"],
    category: "keycaps",
  },
  {
    id: "8008",
    name: "8008",
    colors: ["#23242f", "#6c727f", "#be5567", "#dcdcdc"],
    category: "keycaps",
  },
  {
    id: "9009",
    name: "9009",
    colors: ["#FEFFF5", "#E2E1CA", "#E0B9C5", "#B2C7A6", "#3A3936"],
    category: "keycaps",
  },
  {
    id: "dualshot",
    name: "Dualshot",
    colors: ["#5F6161", "#B54743", "#B89B23", "#469B9F", "#4C6A95", "#232524"],
    category: "keycaps",
  },
  {
    id: "handarbeit-r2",
    name: "Handarbeit R2",
    colors: ["#BE897D", "#AC4438", "#DDAC3C", "#709F48", "#3A7D4A", "#86A285", "#4359A0"],
    category: "keycaps",
  },
  {
    id: "metropolis",
    name: "Metropolis",
    colors: ["#040A0D", "#2A3037", "#B45533", "#E0B95A", "#68D2B6"],
    category: "keycaps",
  },
  {
    id: "milkshake",
    name: "Milkshake",
    colors: ["#FFFFFF", "#E99FAC", "#F2F9A0", "#87E2D0", "#7CCAEC", "#B98FD9", "#9DA0AB"],
    category: "keycaps",
  },
  {
    id: "cafe",
    name: "Cafe",
    colors: ["#2d1810", "#6b4423", "#c9a86c", "#e8dcc8", "#f5f0e6"],
    category: "keycaps",
  },
  {
    id: "oblivion",
    name: "Oblivion",
    colors: ["#1a1a1a", "#2d2d2d", "#4a4a4a", "#9acd32", "#f5f5f0"],
    category: "keycaps",
  },
  {
    id: "godspeed",
    name: "Godspeed",
    colors: ["#1a2744", "#f5f0e6", "#f0c040", "#e8a030", "#2e5077"],
    category: "keycaps",
  },
  {
    id: "carbon",
    name: "Carbon",
    colors: ["#1a1a1a", "#3d3d3d", "#ff6600", "#ff9933", "#f5f5f0"],
    category: "keycaps",
  },
  {
    id: "miami",
    name: "Miami",
    colors: ["#00bcd4", "#e91e8b", "#f5f5f5", "#ff69b4", "#00e5ff"],
    category: "keycaps",
  },
  {
    id: "laser",
    name: "Laser",
    colors: ["#1a0a2e", "#2e1a47", "#ff00ff", "#00ffff", "#f5f0fa"],
    category: "keycaps",
  },
  {
    id: "nautilus",
    name: "Nautilus",
    colors: ["#0d1a26", "#1a3d5c", "#c9a227", "#f0d060", "#2e6b8a"],
    category: "keycaps",
  },
  {
    id: "botanical",
    name: "Botanical",
    colors: ["#f5f5f0", "#e8e8dc", "#2e6b3d", "#4a8b5a", "#6bb87a"],
    category: "keycaps",
  },
  {
    id: "serika",
    name: "Serika",
    colors: ["#1a1a1a", "#3d3d3d", "#e8c640", "#f0d860", "#f5f5f0"],
    category: "keycaps",
  },
  {
    id: "mizu",
    name: "Mizu",
    colors: ["#f5f8fa", "#c9dce8", "#5a9bba", "#3d7a9a", "#1a4a6b"],
    category: "keycaps",
  },
  {
    id: "bento",
    name: "Bento",
    colors: ["#1a1a1a", "#2d2d2d", "#e04040", "#f5f5f0", "#f0a0a0"],
    category: "keycaps",
  },
  {
    id: "olivia",
    name: "Olivia",
    colors: ["#1a1a1a", "#e8a8b8", "#f0c4cc", "#f5dce0", "#f5f5f0"],
    category: "keycaps",
  },
  {
    id: "dracula",
    name: "Dracula",
    colors: ["#282a36", "#44475a", "#bd93f9", "#ff79c6", "#50fa7b"],
    category: "keycaps",
  },
  {
    id: "nord-keys",
    name: "Nord",
    colors: ["#2e3440", "#3b4252", "#88c0d0", "#81a1c1", "#eceff4"],
    category: "keycaps",
  },
  {
    id: "bushido",
    name: "Bushido",
    colors: ["#1a1a1a", "#8b0000", "#c40000", "#f5f0e6", "#c9a86c"],
    category: "keycaps",
  },
  {
    id: "striker",
    name: "Striker",
    colors: ["#1a3d5c", "#2e6b8a", "#f5f5f0", "#e8e8dc", "#ffd700"],
    category: "keycaps",
  },
  {
    id: "modern-dolch",
    name: "Modern Dolch",
    colors: ["#2d2d2d", "#4a4a4a", "#6b8b8b", "#a8c8c8", "#e0f0f0"],
    category: "keycaps",
  },
  {
    id: "camping",
    name: "Camping",
    colors: ["#2d4a3e", "#4a7c59", "#f5f0e6", "#c77b4a", "#8b4513"],
    category: "keycaps",
  },
  {
    id: "noel",
    name: "Noel",
    colors: ["#f5f0e6", "#e8dcc8", "#c77b4a", "#8b4513", "#5c3a1a"],
    category: "keycaps",
  },
  {
    id: "vaporwave",
    name: "Vaporwave",
    colors: ["#ff71ce", "#01cdfe", "#05ffa1", "#b967ff", "#fffb96"],
    category: "keycaps",
  },
  {
    id: "hyperfuse",
    name: "Hyperfuse",
    colors: ["#3d3d4a", "#5a5a6b", "#6b4a8b", "#9b6bc4", "#c9a8e8"],
    category: "keycaps",
  },
  {
    id: "peaches-n-cream",
    name: "Peaches n Cream",
    colors: ["#f5f0e6", "#f0d8c8", "#e8b8a0", "#d4907a", "#c77060"],
    category: "keycaps",
  },
  {
    id: "terra",
    name: "Terra",
    colors: ["#2d2d2d", "#5c4a3d", "#8b6b52", "#c9a86c", "#f5e8d8"],
    category: "keycaps",
  },
  {
    id: "pulse",
    name: "Pulse",
    colors: ["#1a2634", "#2d4a5c", "#00bcd4", "#00e5ff", "#f5f5f5"],
    category: "keycaps",
  },
  {
    id: "evil-dolch",
    name: "Evil Dolch",
    colors: ["#1a1a1a", "#2d2d2d", "#4a4a4a", "#8b0000", "#c40000"],
    category: "keycaps",
  },
  {
    id: "taro",
    name: "Taro",
    colors: ["#f5f0fa", "#e8d8f0", "#c9a8d8", "#9b6bb8", "#6b3a8b"],
    category: "keycaps",
  },
  {
    id: "honeywell",
    name: "Honeywell",
    colors: ["#f5f5f0", "#e8e8dc", "#2d2d2d", "#8b0000", "#1a1a1a"],
    category: "keycaps",
  },
  
  // ============================================================================
  // VINTAGE (Movie references)
  // ============================================================================
  {
    id: "belafonte",
    name: "Belafonte",
    colors: ["#F0F1F0", "#CC5E3D", "#F4CB43", "#89BFD2", "#56A6C3", "#272C30"],
    category: "vintage",
  },
  {
    id: "zissou",
    name: "Team Zissou",
    colors: ["#0d4a6b", "#2e8bb8", "#f5f0e6", "#c40000", "#f0c040"],
    category: "vintage",
  },
  {
    id: "tenenbaum",
    name: "375th Street",
    colors: ["#8b0000", "#d4907a", "#e8c9a0", "#f5f0e6", "#4a7c59"],
    category: "vintage",
  },
  {
    id: "darjeeling",
    name: "The Whitman Brothers",
    colors: ["#f0c040", "#e88030", "#5a9bba", "#c77060", "#f5f0e6"],
    category: "vintage",
  },
  {
    id: "moonrise",
    name: "Khaki Scout",
    colors: ["#f0d860", "#6b8e23", "#c77b4a", "#f5f0e6", "#5a4a3d"],
    category: "vintage",
  },
  {
    id: "grand-budapest",
    name: "Mendl's",
    colors: ["#d4658f", "#9c4070", "#f5e6d3", "#7b2d5b", "#f0c040"],
    category: "vintage",
  },
  {
    id: "apocalypse-now",
    name: "The Horror",
    colors: ["#2d4a3e", "#6b8b6b", "#c9a86c", "#8b4513", "#1a1a1a"],
    category: "vintage",
  },
  {
    id: "casablanca",
    name: "Here's Looking at You",
    colors: ["#0a0a0a", "#1a1a1a", "#3d3d3d", "#6b6b6b", "#a0a0a0"],
    category: "vintage",
  },
  {
    id: "citizen-kane",
    name: "Rosebud",
    colors: ["#2d2d2e", "#5a5a58", "#8b8b88", "#b8b8b4", "#e0e0dc"],
    category: "vintage",
  },
  {
    id: "saturday-night-fever",
    name: "Staying Alive",
    colors: ["#0d0d0d", "#c9a227", "#f0d060", "#ff00ff", "#00ffff"],
    category: "vintage",
  },
  {
    id: "boogie-nights",
    name: "Dirk Diggler",
    colors: ["#8b4513", "#ff6347", "#ffd700", "#9acd32", "#9370db"],
    category: "vintage",
  },
  {
    id: "thelma-louise",
    name: "Keep Driving",
    colors: ["#c40000", "#f5f0e6", "#4a7c8a", "#c9a227", "#2d2d2d"],
    category: "vintage",
  },
  {
    id: "amelie",
    name: "Café des Deux Moulins",
    colors: ["#ff6347", "#ffd700", "#4682b4", "#228b22", "#f5f5dc"],
    category: "vintage",
  },
  {
    id: "gatsby",
    name: "Old Sport",
    colors: ["#0d0d0d", "#1a1a2e", "#c9a227", "#2e8b8b", "#f5f0e6"],
    category: "vintage",
  },
  {
    id: "metropolis",
    name: "Maschinenmensch",
    colors: ["#000000", "#dd0100", "#fac901", "#225095", "#ffffff"],
    category: "vintage",
  },
  {
    id: "american-graffiti",
    name: "Mel's Drive-In",
    colors: ["#c9a86c", "#8b6914", "#4a3c1a", "#c40000", "#f5f0e6"],
    category: "vintage",
  },
  {
    id: "grease",
    name: "Rydell High",
    colors: ["#ff1493", "#00ced1", "#ffd700", "#ff4500", "#1a1a1a"],
    category: "vintage",
  },
  {
    id: "rebel",
    name: "Chickie Run",
    colors: ["#1a1a2e", "#ff4500", "#ffd700", "#f5f0e6", "#8b0000"],
    category: "vintage",
  },
  {
    id: "psycho",
    name: "Bates Motel",
    colors: ["#1a1a2e", "#ff1493", "#00ffff", "#ff6600", "#f5f0e6"],
    category: "vintage",
  },
  {
    id: "memento",
    name: "Remember Sammy Jankis",
    colors: ["#f5f5f0", "#ff4500", "#ffd700", "#228b22", "#4169e1"],
    category: "vintage",
  },
  {
    id: "videodrome",
    name: "Long Live the New Flesh",
    colors: ["#1a1a1a", "#0000ff", "#ff0000", "#00ff00", "#ffffff"],
    category: "vintage",
  },
  {
    id: "tron",
    name: "End of Line",
    colors: ["#000000", "#ff4136", "#ff851b", "#2ecc40", "#7fdbff"],
    category: "vintage",
  },
  {
    id: "blade-runner",
    name: "Voight-Kampff",
    colors: ["#40318d", "#7869c4", "#5a4fc4", "#a0a0ff", "#ffffff"],
    category: "vintage",
  },
  {
    id: "crimson-peak",
    name: "Allerdale Hall",
    colors: ["#2d1a2e", "#5c3a5c", "#8b6b8b", "#c9a227", "#f5f0e6"],
    category: "vintage",
  },
  {
    id: "chicago",
    name: "Cell Block Tango",
    colors: ["#1a0f0a", "#3d2914", "#c9a227", "#f0d060", "#8b0000"],
    category: "vintage",
  },
  {
    id: "la-la-land",
    name: "Griffith Observatory",
    colors: ["#1a1a2e", "#8b0000", "#c9a227", "#f5f0e6", "#2e4a6b"],
    category: "vintage",
  },
  

  // ============================================================================
  // MODERN
  // ============================================================================
  {
    id: "tech-startup",
    name: "Tech Startup",
    colors: ["#0d0d0d", "#1a1a2e", "#4361ee", "#7209b7", "#f72585"],
    category: "modern",
  },
  {
    id: "canabalt",
    name: "Canabalt",
    colors: ["#111111", "#333333", "#666666", "#999999", "#ffffff"],
    category: "modern",
  },
  {
    id: "neon-tokyo",
    name: "Neon Tokyo",
    colors: ["#0f0e17", "#2e2157", "#ff2a6d", "#05d9e8", "#d1f7ff"],
    category: "modern",
  },
  {
    id: "linkedin",
    name: "Easy Apply",
    colors: ["#1a365d", "#2b6cb0", "#4299e1", "#bee3f8", "#ebf8ff"],
    category: "modern",
  },
  {
    id: "melatonin",
    name: "Melatonin",
    colors: ["#667eea", "#764ba2", "#f093fb", "#f5576c", "#ffd89b"],
    category: "modern",
  },
  {
    id: "figma",
    name: "Auto Layout",
    colors: ["#0acf83", "#a259ff", "#f24e1e", "#ff7262", "#1abcfe"],
    category: "modern",
  },
  {
    id: "notion",
    name: "Synced Block",
    colors: ["#000000", "#37352f", "#9b9a97", "#e8e8e8", "#ffffff"],
    category: "modern",
  },
  {
    id: "vercel",
    name: "Edge Request",
    colors: ["#000000", "#171717", "#333333", "#666666", "#ffffff"],
    category: "modern",
  },
  {
    id: "stripe",
    name: "Test Mode",
    colors: ["#0a2540", "#425466", "#635bff", "#80e9ff", "#ffffff"],
    category: "modern",
  },
  {
    id: "discord",
    name: "Kitten Daddy",
    colors: ["#23272a", "#2c2f33", "#5865f2", "#99aab5", "#ffffff"],
    category: "modern",
  },
  {
    id: "spotify",
    name: "War Machine",
    colors: ["#121212", "#1db954", "#191414", "#b3b3b3", "#ffffff"],
    category: "modern",
  },
  {
    id: "duolingo",
    name: "Class Traitor",
    colors: ["#58cc02", "#89e219", "#ffc800", "#ff4b4b", "#ffffff"],
    category: "modern",
  },
  {
    id: "calm-app",
    name: "Sleep Story",
    colors: ["#1e3a5f", "#2e5a8a", "#6b9dc4", "#a8d8ea", "#f5f8fa"],
    category: "modern",
  },
  {
    id: "linear",
    name: "Triage",
    colors: ["#000000", "#171717", "#5e6ad2", "#a1a5ff", "#ffffff"],
    category: "modern",
  },
  {
    id: "arc-browser",
    name: "Chromatic",
    colors: ["#1a1a2e", "#4a90d9", "#f65f53", "#fbbc04", "#34a853"],
    category: "modern",
  },
  {
    id: "obsidian",
    name: "Graph View",
    colors: ["#1e1e1e", "#262626", "#483699", "#7f6df2", "#d4c4ff"],
    category: "modern",
  },
  {
    id: "tailwind",
    name: "Utility First",
    colors: ["#0f172a", "#38bdf8", "#818cf8", "#f472b6", "#fbbf24"],
    category: "modern",
  },
  {
    id: "supabase",
    name: "Row Level Security",
    colors: ["#1c1c1c", "#2e2e2e", "#3ecf8e", "#1c8656", "#f5f5f5"],
    category: "modern",
  },
  {
    id: "github",
    name: "Force Push",
    colors: ["#0d1117", "#161b22", "#238636", "#58a6ff", "#f0f6fc"],
    category: "modern",
  },
  {
    id: "raycast",
    name: "Hotkey",
    colors: ["#1a1a1a", "#2d2d2d", "#ff6363", "#ff7eb3", "#ffffff"],
    category: "modern",
  },
  {
    id: "framer",
    name: "Code Override",
    colors: ["#0055ff", "#00aaff", "#7b61ff", "#000000", "#ffffff"],
    category: "modern",
  },
  {
    id: "glassmorphism",
    name: "Glassmorphism",
    colors: ["#ffffff20", "#ffffff40", "#c9d4dc", "#e8f0f0", "#f5f8fa"],
    category: "modern",
  },
  {
    id: "brutalist",
    name: "Brutalist",
    colors: ["#000000", "#ffffff", "#ff0000", "#0000ff", "#ffff00"],
    category: "modern",
  },
  {
    id: "neumorphism",
    name: "Neumorphism",
    colors: ["#e0e5ec", "#c8d0db", "#a3b1c6", "#9baacf", "#ffffff"],
    category: "modern",
  },
  {
    id: "dark-mode",
    name: "Dark Mode",
    colors: ["#0d0d0d", "#1a1a1a", "#2d2d2d", "#4a4a4a", "#6b6b6b"],
    category: "modern",
  },

  // ============================================================================
  // BOLD
  // ============================================================================
  {
    id: "tropical-punch",
    name: "Tropical Punch",
    colors: ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93"],
    category: "bold",
  },
  {
    id: "holmquist",
    name: "Holmquist",
    colors: ["#f72585", "#b5179e", "#7209b7", "#560bad", "#480ca8"],
    category: "bold",
  },
  {
    id: "candy-shop",
    name: "Candy Shop",
    colors: ["#ff69b4", "#ff6b6b", "#feca57", "#48dbfb", "#1dd1a1"],
    category: "bold",
  },
  {
    id: "pinata",
    name: "Piñata",
    colors: ["#ff1493", "#ff6600", "#ffd700", "#00ff7f", "#00bfff"],
    category: "bold",
  },
  {
    id: "carnival",
    name: "Carnival",
    colors: ["#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00"],
    category: "bold",
  },
  {
    id: "neon-sign",
    name: "Neon Sign",
    colors: ["#ff00ff", "#00ffff", "#ff0080", "#80ff00", "#ff8000"],
    category: "bold",
  },
  {
    id: "memphis-design",
    name: "Memphis Design",
    colors: ["#ff4d6d", "#45caff", "#ffda22", "#ff9a3c", "#24d05a"],
    category: "bold",
  },
  {
    id: "pop-art",
    name: "Pop Art",
    colors: ["#ff0000", "#ffff00", "#0000ff", "#ff00ff", "#00ffff"],
    category: "bold",
  },
  {
    id: "highlighter",
    name: "Highlighter",
    colors: ["#ffff00", "#ff69b4", "#00ff00", "#ff8c00", "#00ffff"],
    category: "bold",
  },
  {
    id: "pride",
    name: "Pride",
    colors: ["#e40303", "#ff8c00", "#ffed00", "#008026", "#004dff", "#750787"],
    category: "bold",
  },
  {
    id: "fiesta",
    name: "Fiesta",
    colors: ["#e41a1c", "#ff7f00", "#ffd700", "#4daf4a", "#377eb8"],
    category: "bold",
  },
  {
    id: "mardi-gras",
    name: "Mardi Gras",
    colors: ["#7b1fa2", "#ffc107", "#388e3c"],
    category: "bold",
  },
  {
    id: "circus",
    name: "Circus",
    colors: ["#e41a1c", "#ffd700", "#1e88e5", "#ffffff", "#000000"],
    category: "bold",
  },
  {
    id: "gumball",
    name: "Gumball",
    colors: ["#ff6b6b", "#4ecdc4", "#ffe66d", "#95e1d3", "#f38181"],
    category: "bold",
  },
  {
    id: "roller-rink",
    name: "Roller Rink",
    colors: ["#ff00ff", "#00ffff", "#ff6600", "#ffff00", "#ff0080"],
    category: "bold",
  },
  {
    id: "arcade",
    name: "Arcade",
    colors: ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff"],
    category: "bold",
  },
  {
    id: "jelly-bean",
    name: "Jelly Bean",
    colors: ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#c56cf0"],
    category: "bold",
  },
  {
    id: "beach-towel",
    name: "Beach Towel",
    colors: ["#ff6b35", "#f7c59f", "#efefd0", "#004e89", "#1a659e"],
    category: "bold",
  },
  {
    id: "kindergarten",
    name: "Kindergarten",
    colors: ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93"],
    category: "bold",
  },
  {
    id: "fruit-salad",
    name: "Fruit Salad",
    colors: ["#ff6b6b", "#ffa502", "#2ed573", "#ff4757", "#7bed9f"],
    category: "bold",
  },
  {
    id: "electric",
    name: "Electric",
    colors: ["#00f5ff", "#f400a1", "#e6fb04", "#7fff00"],
    category: "bold",
  },


  // ============================================================================
  // SOFT
  // ============================================================================
  {
    id: "cashmere",
    name: "Cashmere",
    colors: ["#f5f0e6", "#e8dcc8", "#d4c4a8", "#c9b896", "#b8a888"],
    category: "soft",
  },
  {
    id: "macaron",
    name: "Macaron",
    colors: ["#f8b4c4", "#f0e6a8", "#b8e8c8", "#a8d8f0", "#d4b8f0"],
    category: "soft",
  },
  {
    id: "rose-quartz",
    name: "Rose Quartz",
    colors: ["#f7cac9", "#f0b8b8", "#e8a8a8", "#f5dcd8", "#fdf5f5"],
    category: "soft",
  },
  {
    id: "linen",
    name: "Linen",
    colors: ["#faf0e6", "#f5e6d3", "#e8d8c4", "#dcc8b4", "#d0b8a4"],
    category: "soft",
  },
  {
    id: "powder-room",
    name: "Powder Room",
    colors: ["#fdf5f5", "#f8e8e8", "#f0d8d8", "#e8c8c8", "#e0b8b8"],
    category: "soft",
  },
  {
    id: "hygge",
    name: "Hygge",
    colors: ["#f5f0e6", "#e8dcc8", "#c9a86c", "#8b6b52", "#5c4a3d"],
    category: "soft",
  },
  {
    id: "lavender-fields",
    name: "Lavender Fields",
    colors: ["#e6e6fa", "#d8d8f0", "#c9c9e8", "#b8b8dc", "#a8a8d0"],
    category: "soft",
  },
  {
    id: "cherry-blossom",
    name: "Cherry Blossom",
    colors: ["#ffb7c5", "#ffc8d4", "#ffd8e0", "#ffe8ec", "#fff5f7"],
    category: "soft",
  },
  {
    id: "dawn",
    name: "Dawn",
    colors: ["#ffecd2", "#fcb69f", "#f8a4a4", "#e8b4b8", "#d8c4cc"],
    category: "soft",
  },
  {
    id: "mist",
    name: "Mist",
    colors: ["#e8f0f0", "#dce8e8", "#d0e0e0", "#c4d8d8", "#b8d0d0"],
    category: "soft",
  },
  {
    id: "seashell",
    name: "Seashell",
    colors: ["#fff5ee", "#ffe4d4", "#ffd4c4", "#ffc4b4", "#ffb4a4"],
    category: "soft",
  },
  {
    id: "dove",
    name: "Dove",
    colors: ["#f5f5f5", "#e8e8e8", "#dcdcdc", "#d0d0d0", "#c4c4c4"],
    category: "soft",
  },
  {
    id: "petal",
    name: "Petal",
    colors: ["#fce4ec", "#f8bbd9", "#f48fb1", "#f06292", "#ec407a"],
    category: "soft",
  },
  {
    id: "cotton",
    name: "Cotton",
    colors: ["#ffffff", "#faf8f5", "#f5f0eb", "#f0e8e0", "#ebe0d6"],
    category: "soft",
  },
  {
    id: "blush",
    name: "Blush",
    colors: ["#fef0f0", "#fce0e0", "#fad0d0", "#f8c0c0", "#f6b0b0"],
    category: "soft",
  },
  {
    id: "whisper",
    name: "Whisper",
    colors: ["#f8f8ff", "#f0f0f8", "#e8e8f0", "#e0e0e8", "#d8d8e0"],
    category: "soft",
  },
  {
    id: "porcelain",
    name: "Porcelain",
    colors: ["#fefefe", "#f8f8f8", "#f0f0f0", "#e8e8e8", "#e0e0e0"],
    category: "soft",
  },
  {
    id: "oat-milk",
    name: "Oat Milk",
    colors: ["#f8f4ef", "#f0e8dc", "#e8dcc8", "#e0d0b4", "#d8c4a0"],
    category: "soft",
  },
  {
    id: "seafoam",
    name: "Seafoam",
    colors: ["#e8f8f0", "#d8f0e8", "#c8e8e0", "#b8e0d8", "#a8d8d0"],
    category: "soft",
  },
  {
    id: "peach-fuzz",
    name: "Peach Fuzz",
    colors: ["#ffcdb2", "#ffb4a2", "#e5989b", "#b5838d", "#6d6875"],
    category: "soft",
  },
  {
    id: "cloud",
    name: "Cloud",
    colors: ["#f0f4f8", "#e4e8ec", "#d8dce0", "#ccd0d4", "#c0c4c8"],
    category: "soft",
  },
  {
    id: "buttercream",
    name: "Buttercream",
    colors: ["#fffef0", "#fff8dc", "#fff0c8", "#ffe8b4", "#ffe0a0"],
    category: "soft",
  },
  {
    id: "ballet",
    name: "Ballet",
    colors: ["#f8e8ec", "#f0d8e0", "#e8c8d4", "#e0b8c8", "#d8a8bc"],
    category: "soft",
  },
  {
    id: "morning-dew",
    name: "Morning Dew",
    colors: ["#e8f4e8", "#d8ecd8", "#c8e4c8", "#b8dcb8", "#a8d4a8"],
    category: "soft",
  },
  {
    id: "chamomile",
    name: "Chamomile",
    colors: ["#fdfcf0", "#faf8e0", "#f7f4d0", "#f4f0c0", "#f1ecb0"],
    category: "soft",
  },

  // ============================================================================
  // MONOCHROME
  // ============================================================================
  {
    id: "blue-mono",
    name: "Blue Mono",
    colors: ["#03045e", "#023e8a", "#0077b6", "#00b4d8", "#90e0ef"],
    category: "monochrome",
  },
  {
    id: "forest-mono",
    name: "Forest Mono",
    colors: ["#1a2f1a", "#2d4a2d", "#3f6b3f", "#5a8f5a", "#7ab67a"],
    category: "monochrome",
  },
  {
    id: "burgunmono",
    name: "Burgundy Mono",
    colors: ["#2d0a1e", "#5c1a3b", "#8b2a5c", "#b83d78", "#d66b9a"],
    category: "monochrome",
  },
  {
    id: "urine",
    name: "Urine Mono",
    colors: ["#5c4813", "#8b6914", "#c49b1a", "#e6c229", "#f5dc69"],
    category: "monochrome",
  },
  {
    id: "steel-mono",
    name: "Steel Mono",
    colors: ["#1e2832", "#374955", "#5a7186", "#8da1b4", "#c7d4df"],
    category: "monochrome",
  },
  {
    id: "terracotta-mono",
    name: "Terracotta Mono",
    colors: ["#4a2c17", "#7d4e2c", "#b87240", "#d9956a", "#f0c4a0"],
    category: "monochrome",
  },
  {
    id: "violet-mono",
    name: "Violet Mono",
    colors: ["#1a0a2e", "#3d1a5c", "#6b2d8a", "#9a47b8", "#c77ddb"],
    category: "monochrome",
  },
  {
    id: "midnight-mono",
    name: "Midnight Mono",
    colors: ["#0a0a14", "#14142b", "#232346", "#3d3d6b", "#5c5c94"],
    category: "monochrome",
  },
  {
    id: "sage-mono",
    name: "Sage Mono",
    colors: ["#3d4a3d", "#5a6b5a", "#7a8b7a", "#9aab9a", "#bacbba"],
    category: "monochrome",
  },
  {
    id: "rust-mono",
    name: "Rust Mono",
    colors: ["#4a1a0a", "#7a2d14", "#aa4020", "#da5430", "#ea7850"],
    category: "monochrome",
  },
  {
    id: "charcoal-mono",
    name: "Charcoal Mono",
    colors: ["#1a1a1a", "#2d2d2d", "#404040", "#535353", "#666666"],
    category: "monochrome",
  },
  {
    id: "plum-mono",
    name: "Plum Mono",
    colors: ["#2e1a2e", "#4a2e4a", "#664266", "#825a82", "#9e729e"],
    category: "monochrome",
  },
  {
    id: "slate-mono",
    name: "Slate Mono",
    colors: ["#1e293b", "#334155", "#475569", "#64748b", "#94a3b8"],
    category: "monochrome",
  },
  {
    id: "copper-mono",
    name: "Copper Mono",
    colors: ["#4a2c17", "#7a4a2a", "#aa6840", "#ca8860", "#eaa880"],
    category: "monochrome",
  },
  {
    id: "indigo-mono",
    name: "Indigo Mono",
    colors: ["#1a1a4a", "#2e2e6b", "#42428c", "#5656ad", "#6a6ace"],
    category: "monochrome",
  },
  {
    id: "olive-mono",
    name: "Olive Mono",
    colors: ["#2a2e1a", "#3f452a", "#545c3a", "#69734a", "#7e8a5a"],
    category: "monochrome",
  },
  {
    id: "amber-mono",
    name: "Amber Mono",
    colors: ["#4a3000", "#7a5000", "#aa7000", "#da9000", "#fab000"],
    category: "monochrome",
  },
  {
    id: "wine-mono",
    name: "Wine Mono",
    colors: ["#2e0a14", "#5c1428", "#8a1e3c", "#b82850", "#d64070"],
    category: "monochrome",
  },
  {
    id: "ink-mono",
    name: "Ink Mono",
    colors: ["#0a0a0f", "#14141f", "#1e1e2f", "#28283f", "#32324f"],
    category: "monochrome",
  },
  {
    id: "cream-mono",
    name: "Cream Mono",
    colors: ["#c8c0b0", "#d4ccc0", "#e0d8d0", "#ece4e0", "#f8f0f0"],
    category: "monochrome",
  },
  {
    id: "teal-mono",
    name: "Teal Mono",
    colors: ["#0a2a2a", "#144040", "#1e5656", "#286c6c", "#328282"],
    category: "monochrome",
  },
  {
    id: "mauve-mono",
    name: "Mauve Mono",
    colors: ["#3c2a3c", "#5a3e5a", "#785278", "#966696", "#b47ab4"],
    category: "monochrome",
  },
  {
    id: "espresso-mono",
    name: "Espresso Mono",
    colors: ["#1a0f0a", "#2e1a14", "#42251e", "#563028", "#6a3b32"],
    category: "monochrome",
  },
  {
    id: "storm-mono",
    name: "Storm Mono",
    colors: ["#1a1e2e", "#2e3446", "#424a5e", "#566076", "#6a768e"],
    category: "monochrome",
  },

  // ============================================================================
  // SEASONAL
  // ============================================================================
  {
    id: "january",
    name: "January",
    colors: ["#e8f4f8", "#c9dce8", "#8ab4c4", "#5a8faa", "#2d5a6b"],
    category: "seasonal",
  },
  {
    id: "february",
    name: "February",
    colors: ["#fce4ec", "#f8bbd9", "#ec407a", "#ad1457", "#880e4f"],
    category: "seasonal",
  },
  {
    id: "march",
    name: "March",
    colors: ["#e8f5e9", "#a5d6a7", "#66bb6a", "#43a047", "#2e7d32"],
    category: "seasonal",
  },
  {
    id: "april",
    name: "April",
    colors: ["#b8d8e8", "#90c4d8", "#68b0c8", "#409cb8", "#2088a8"],
    category: "seasonal",
  },
  {
    id: "may",
    name: "May",
    colors: ["#ffebee", "#f8bbd9", "#ce93d8", "#ba68c8", "#ab47bc"],
    category: "seasonal",
  },
  {
    id: "june",
    name: "June",
    colors: ["#fff8e1", "#ffecb3", "#ffd54f", "#ffca28", "#ffc107"],
    category: "seasonal",
  },
  {
    id: "july",
    name: "July",
    colors: ["#ff8a65", "#ff7043", "#ff5722", "#f4511e", "#e64a19"],
    category: "seasonal",
  },
  {
    id: "august",
    name: "August",
    colors: ["#fff3e0", "#ffe0b2", "#ffb74d", "#ffa726", "#ff9800"],
    category: "seasonal",
  },
  {
    id: "september",
    name: "September",
    colors: ["#efebe9", "#d7ccc8", "#a1887f", "#8d6e63", "#6d4c41"],
    category: "seasonal",
  },
  {
    id: "october",
    name: "October",
    colors: ["#1a1a1a", "#4e342e", "#bf360c", "#e65100", "#f57c00"],
    category: "seasonal",
  },
  {
    id: "november",
    name: "November",
    colors: ["#3e2723", "#5d4037", "#795548", "#a1887f", "#d7ccc8"],
    category: "seasonal",
  },
  {
    id: "december",
    name: "December",
    colors: ["#1b5e20", "#c62828", "#ffd54f", "#efebe9", "#37474f"],
    category: "seasonal",
  },
  {
    id: "spring-equinox",
    name: "Spring Equinox",
    colors: ["#c8e6c9", "#a5d6a7", "#81c784", "#66bb6a", "#4caf50"],
    category: "seasonal",
  },
  {
    id: "summer-solstice",
    name: "Summer Solstice",
    colors: ["#fff59d", "#fff176", "#ffee58", "#ffeb3b", "#fdd835"],
    category: "seasonal",
  },
  {
    id: "autumn-equinox",
    name: "Autumn Equinox",
    colors: ["#8d6e63", "#a1887f", "#bcaaa4", "#d7ccc8", "#efebe9"],
    category: "seasonal",
  },
  {
    id: "winter-solstice",
    name: "Winter Solstice",
    colors: ["#0d1a26", "#1a3a5c", "#2e5a8a", "#4a8ab4", "#8ab8d8"],
    category: "seasonal",
  },
  {
    id: "first-frost",
    name: "First Frost",
    colors: ["#e3f2fd", "#bbdefb", "#90caf9", "#64b5f6", "#42a5f5"],
    category: "seasonal",
  },
  {
    id: "harvest-moon",
    name: "Harvest Moon",
    colors: ["#ffcc80", "#ffb74d", "#ffa726", "#ff9800", "#fb8c00"],
    category: "seasonal",
  },
  {
    id: "indian-summer",
    name: "Indian Summer",
    colors: ["#c9a86c", "#d4a574", "#deb887", "#e8c9a0", "#f5deb3"],
    category: "seasonal",
  },
  {
    id: "spring-rain",
    name: "Spring Rain",
    colors: ["#b0bec5", "#90a4ae", "#78909c", "#607d8b", "#546e7a"],
    category: "seasonal",
  },
  {
    id: "midwinter",
    name: "Midwinter",
    colors: ["#1a2634", "#2d4052", "#405a70", "#53748e", "#668eac"],
    category: "seasonal",
  },
  {
    id: "dog-days",
    name: "Dog Days",
    colors: ["#ff8a65", "#ffab91", "#ffccbc", "#fbe9e7", "#fff3e0"],
    category: "seasonal",
  },
  {
    id: "falling-leaves",
    name: "Falling Leaves",
    colors: ["#8d6e63", "#bf360c", "#e65100", "#ff9800", "#ffc107"],
    category: "seasonal",
  },
  {
    id: "snowfall",
    name: "Snowfall",
    colors: ["#eceff1", "#e0e0e0", "#bdbdbd", "#9e9e9e", "#757575"],
    category: "seasonal",
  },

  // ============================================================================
  // ARTISTIC
  // ============================================================================
  {
    id: "monet",
    name: "Monet",
    colors: ["#2b4a5c", "#4a7c8a", "#8ab4c4", "#c5dce6", "#e8f1f5"],
    category: "artistic",
  },
  {
    id: "van-gogh",
    name: "Vincent",
    colors: ["#0c1445", "#1e3a5f", "#2e5a7e", "#f0c14b", "#f5e6a3"],
    category: "artistic",
  },
  {
    id: "mondrian",
    name: "Mondrian",
    colors: ["#000000", "#ffffff", "#dd0100", "#fac901", "#225095"],
    category: "artistic",
  },
  {
    id: "klimt",
    name: "Klimt",
    colors: ["#1a1a0f", "#4a4528", "#8b7d3c", "#c9a227", "#f0d060"],
    category: "artistic",
  },
  {
    id: "go-fuck-yourself",
    name: "Warhol",
    colors: ["#f50057", "#ffea00", "#00e5ff", "#76ff03", "#d500f9"],
    category: "artistic",
  },
  {
    id: "rothko-chapel",
    name: "Rothko",
    colors: ["#1a1a1a", "#2d2d2d", "#3d3d3d", "#4a4a4a", "#5c5c5c"],
    category: "artistic",
  },
  {
    id: "hokusai-wave",
    name: "Hokusai",
    colors: ["#1a2744", "#2e5077", "#4e8aaa", "#8ab4c4", "#f5efe6"],
    category: "artistic",
  },
  {
    id: "picasso-blue",
    name: "Picasso (Blue)",
    colors: ["#0a1628", "#1a3a5c", "#2e5a8a", "#4a8ab4", "#8ab8d8"],
    category: "artistic",
  },
  {
    id: "matisse-cut-outs",
    name: "Matisse (Cut-Outs)",
    colors: ["#1a237e", "#e53935", "#fdd835", "#43a047", "#ff9800"],
    category: "artistic",
  },
  {
    id: "seurat-dots",
    name: "Seurat",
    colors: ["#5c7a4e", "#8b9a6b", "#d4c88e", "#e8d5a8", "#a67c52"],
    category: "artistic",
  },
  {
    id: "basquiat",
    name: "Basquiat",
    colors: ["#000000", "#ff0000", "#ffff00", "#0000ff", "#ffffff"],
    category: "artistic",
  },
  {
    id: "hockney",
    name: "Hockney",
    colors: ["#00bfff", "#40e0d0", "#ff6b6b", "#ffd93d", "#ff69b4"],
    category: "artistic",
  },
  {
    id: "okeeffe",
    name: "O'Keeffe",
    colors: ["#f5deb3", "#deb887", "#d2691e", "#8b4513", "#2f4f4f"],
    category: "artistic",
  },
  {
    id: "kahlo",
    name: "Kahlo",
    colors: ["#c62828", "#f9a825", "#2e7d32", "#1565c0", "#6a1b9a"],
    category: "artistic",
  },
  {
    id: "pollock",
    name: "Pollock",
    colors: ["#000000", "#ffffff", "#ffeb3b", "#2196f3", "#f44336"],
    category: "artistic",
  },
  {
    id: "kandinsky",
    name: "Kandinsky",
    colors: ["#1a237e", "#c62828", "#ffd600", "#000000", "#ffffff"],
    category: "artistic",
  },
  {
    id: "magritte",
    name: "Magritte",
    colors: ["#87ceeb", "#2e8b57", "#8b4513", "#f5f5dc", "#000000"],
    category: "artistic",
  },
  {
    id: "dali",
    name: "Dalí",
    colors: ["#f4a460", "#deb887", "#87ceeb", "#ffd700", "#8b0000"],
    category: "artistic",
  },
  {
    id: "vermeer",
    name: "Vermeer",
    colors: ["#1a1a2e", "#4a5568", "#f0e6d3", "#c9a227", "#2e5a8a"],
    category: "artistic",
  },
  {
    id: "rembrandt",
    name: "Rembrandt",
    colors: ["#1a0f0a", "#3d2914", "#6b4423", "#c9a86c", "#f0e6d3"],
    category: "artistic",
  },
  {
    id: "turner",
    name: "Turner",
    colors: ["#ffd89b", "#f0c040", "#e88030", "#c77060", "#8ab4c4"],
    category: "artistic",
  },
  {
    id: "whistler",
    name: "Whistler",
    colors: ["#2d2d2d", "#4a4a4a", "#6b6b6b", "#8b8b8b", "#ababab"],
    category: "artistic",
  },
  {
    id: "hopper",
    name: "Hopper",
    colors: ["#1a2634", "#c9a86c", "#8b0000", "#2e5a3d", "#f5f0e6"],
    category: "artistic",
  },
  {
    id: "thiebaud",
    name: "Thiebaud",
    colors: ["#ff69b4", "#fffacd", "#add8e6", "#f5deb3", "#ffffff"],
    category: "artistic",
  },
  {
    id: "lichtenstein",
    name: "Lichtenstein",
    colors: ["#ffff00", "#ff0000", "#0000ff", "#000000", "#ffffff"],
    category: "artistic",
  },
  {
    id: "koons",
    name: "Koons",
    colors: ["#ff69b4", "#00bfff", "#ffd700", "#ff4500", "#9400d3"],
    category: "artistic",
  },
  {
    id: "hirst",
    name: "Hirst",
    colors: ["#00ffff", "#ff00ff", "#ffff00", "#ff0000", "#00ff00"],
    category: "artistic",
  },
  {
    id: "banksy",
    name: "Banksy",
    colors: ["#000000", "#ff0000", "#ffffff", "#808080"],
    category: "artistic",
  },
  {
    id: "caravaggio",
    name: "Caravaggio",
    colors: ["#0a0a0a", "#1a1a1a", "#4a3c2e", "#8b6b52", "#c9a86c"],
    category: "artistic",
  },
  {
    id: "botticelli",
    name: "Botticelli",
    colors: ["#f0e6d3", "#e8c9a0", "#d4a574", "#8ab4c4", "#6b8e6b"],
    category: "artistic",
  },
  {
    id: "degas",
    name: "Degas",
    colors: ["#f8e8ec", "#e8c9d4", "#c9a8b8", "#a88b9b", "#8b6b7a"],
    category: "artistic",
  },
  {
    id: "renoir",
    name: "Renoir",
    colors: ["#ffcdb2", "#ffb4a2", "#e5989b", "#b5838d", "#6d6875"],
    category: "artistic",
  },
  {
    id: "cezanne",
    name: "Cézanne",
    colors: ["#6b8e6b", "#8bb89b", "#c9d4a8", "#e8c9a0", "#f0e6d3"],
    category: "artistic",
  },
  {
    id: "gauguin",
    name: "Gauguin",
    colors: ["#ff6347", "#ffd700", "#32cd32", "#4169e1", "#9932cc"],
    category: "artistic",
  },
  {
    id: "toulouse-lautrec",
    name: "Toulouse-Lautrec",
    colors: ["#000000", "#8b0000", "#ffd700", "#2e8b57", "#f5f5dc"],
    category: "artistic",
  },
  {
    id: "munch",
    name: "Munch",
    colors: ["#ff4500", "#ffd700", "#1e90ff", "#2e2e2e", "#f5f5dc"],
    category: "artistic",
  },
  {
    id: "schiele",
    name: "Schiele",
    colors: ["#2e2e2e", "#8b4513", "#d2691e", "#f4a460", "#f5f5dc"],
    category: "artistic",
  },
  {
    id: "klee",
    name: "Klee",
    colors: ["#ff69b4", "#ffd700", "#90ee90", "#87ceeb", "#dda0dd"],
    category: "artistic",
  },
  {
    id: "miro",
    name: "Miró",
    colors: ["#000000", "#ff0000", "#ffff00", "#0000ff", "#228b22"],
    category: "artistic",
  },
  {
    id: "chagall",
    name: "Chagall",
    colors: ["#4169e1", "#9932cc", "#ff69b4", "#ffd700", "#32cd32"],
    category: "artistic",
  },
  {
    id: "escher",
    name: "Escher",
    colors: ["#000000", "#333333", "#666666", "#999999", "#ffffff"],
    category: "artistic",
  },
  {
    id: "winslow-homer",
    name: "Winslow Homer",
    colors: ["#2e5a8a", "#4a8ab4", "#8ab8d8", "#c9dce8", "#f5f0e6"],
    category: "artistic",
  },
  {
    id: "sargent",
    name: "Sargent",
    colors: ["#1a1a2e", "#2d2d4a", "#f5f0e6", "#e8c9a0", "#c77b4a"],
    category: "artistic",
  },
  {
    id: "morisot",
    name: "Morisot",
    colors: ["#e8f0f0", "#c9dce8", "#a8c8d8", "#88b4c8", "#68a0b8"],
    category: "artistic",
  },
  {
    id: "cassatt",
    name: "Cassatt",
    colors: ["#f8e8ec", "#e8d0d8", "#d8b8c4", "#c8a0b0", "#b8889c"],
    category: "artistic",
  },
];

// Helper to get palettes by category
export function getPalettesByCategory(): Record<PaletteCollectionCategory, CuratedPalette[]> {
  const result: Record<PaletteCollectionCategory, CuratedPalette[]> = {
    classic: [],
    nature: [],
    keycaps: [],
    vintage: [],
    modern: [],
    bold: [],
    soft: [],
    monochrome: [],
    seasonal: [],
    artistic: [],
  };

  for (const palette of CURATED_PALETTES) {
    result[palette.category].push(palette);
  }

  return result;
}
