// Shared lawn-care visual yard card data + plain-English explainers.
// Used by booking flow, confirmation page, and crew job brief.

export interface YardCard {
  id: string;
  label: string;
  /** Plain English description ("what this looks like") */
  desc: string;
  /** Square-foot hint for size; visual cue for condition */
  hint: string;
  /** Inline SVG illustration as a function (so we can re-color) */
  illustration: string; // emoji shorthand for now (e.g. "🏡")
  /** Tailwind tint applied when selected */
  accent?: string;
}

export const SIZE_CARDS: YardCard[] = [
  {
    id: "small",
    label: "Small Yard",
    desc: "Townhouse, condo, or small starter home — a quick mow.",
    hint: "Under 5,000 sq ft",
    illustration: "🏠",
    accent: "border-lime-500/60 bg-lime-500/10",
  },
  {
    id: "medium",
    label: "Medium Yard",
    desc: "Standard suburban lot — front and back grass, normal trim.",
    hint: "5,000–10,000 sq ft",
    illustration: "🏡",
    accent: "border-lime-500/60 bg-lime-500/10",
  },
  {
    id: "large",
    label: "Large Yard",
    desc: "Bigger lot or corner property — extra mowing time.",
    hint: "10,000–20,000 sq ft (~¼–½ acre)",
    illustration: "🌳",
    accent: "border-lime-500/60 bg-lime-500/10",
  },
  {
    id: "xlarge",
    label: "Acreage",
    desc: "Half-acre or more — open yard, fields, or rural property.",
    hint: "20,000+ sq ft (½ acre+)",
    illustration: "🚜",
    accent: "border-lime-500/60 bg-lime-500/10",
  },
  {
    id: "custom",
    label: "Not Sure",
    desc: "We'll measure it for you and confirm before any work.",
    hint: "Custom estimate",
    illustration: "📋",
    accent: "border-slate-500/60 bg-slate-500/10",
  },
];

export const CONDITION_CARDS: YardCard[] = [
  {
    id: "well_maintained",
    label: "Well-Maintained",
    desc: "Mowed within the last week or two — grass at normal height.",
    hint: "Standard rate",
    illustration: "🌱",
    accent: "border-green-500/60 bg-green-500/10",
  },
  {
    id: "slightly_overgrown",
    label: "Slightly Overgrown",
    desc: "A bit shaggy — about ankle-high or it's been ~3 weeks.",
    hint: "1.2× — one extra pass",
    illustration: "🌿",
    accent: "border-yellow-500/60 bg-yellow-500/10",
  },
  {
    id: "overgrown",
    label: "Overgrown",
    desc: "Mid-shin grass, weeds creeping in. Skipped a month+.",
    hint: "1.5× — two passes + cleanup",
    illustration: "🌾",
    accent: "border-orange-500/60 bg-orange-500/10",
  },
  {
    id: "heavily_overgrown",
    label: "Heavily Overgrown",
    desc: "Knee-high or taller. Brush, weeds, possibly a clean-out.",
    hint: "2× — multiple passes, brush trim",
    illustration: "🌲",
    accent: "border-red-500/60 bg-red-500/10",
  },
];

export const SERVICE_CARDS: YardCard[] = [
  {
    id: "mowing",
    label: "Mowing",
    desc: "Cut grass to height, blow off walks. Clean and quick.",
    hint: "Most common",
    illustration: "🌿",
  },
  {
    id: "trimming",
    label: "Trimming & Edging",
    desc: "Sharp edges along walks, driveways, and beds.",
    hint: "Add to mowing or solo",
    illustration: "✂️",
  },
  {
    id: "cleanup",
    label: "Yard Cleanup",
    desc: "Leaf removal, debris pickup, full tidy-up.",
    hint: "Spring/fall favorite",
    illustration: "🍂",
  },
  {
    id: "full_service",
    label: "Full Service",
    desc: "Mow + trim + edge + blow + light cleanup. The works.",
    hint: "Best value bundle",
    illustration: "🏡",
  },
  {
    id: "custom",
    label: "Custom / Estimate",
    desc: "Something different? Darrell will reach out to scope it.",
    hint: "We'll quote it",
    illustration: "📋",
  },
];

export const FREQUENCY_CARDS: YardCard[] = [
  {
    id: "one_time",
    label: "One-Time",
    desc: "Single visit — no commitment.",
    hint: "Standard rate",
    illustration: "1️⃣",
  },
  {
    id: "weekly",
    label: "Weekly",
    desc: "Same day every week. Best price + first dibs on slots.",
    hint: "15% off — best value",
    illustration: "📅",
  },
  {
    id: "bi_weekly",
    label: "Every 2 Weeks",
    desc: "Most popular for normal lawns in Michigan.",
    hint: "10% off",
    illustration: "🗓️",
  },
  {
    id: "monthly",
    label: "Monthly",
    desc: "Touch-ups for slow-growing lawns or occasional cleanup.",
    hint: "5% off",
    illustration: "📆",
  },
];

// Plain-English explainers shown in "What this means" disclosures
export const EXPLAINERS = {
  size: "Yard size sets the base price. Pick what looks closest — when the crew arrives we'll measure, and we'll only adjust the price if it's way off (we tell you first, always).",
  condition: "If your grass is taller or weedier than usual, it takes more passes and time. We multiply the base price by a small factor so it stays fair to both sides.",
  frequency: "Recurring plans get a discount because they save us setup and travel time. Weekly is the best deal; one-time is the standard rate.",
  addOns: "Add-ons are extras like edging, fertilization, or hauling away leaves. Each has a flat add-on price you'll see itemized on your quote.",
};

export function sqFtToTier(sqFt: number): "small" | "medium" | "large" | "xlarge" {
  if (sqFt < 5000) return "small";
  if (sqFt < 10000) return "medium";
  if (sqFt < 20000) return "large";
  return "xlarge";
}

export const ADD_ON_LABELS: Record<string, string> = {
  edging: "Edging",
  blowing: "Blowing / Cleanup",
  weeding: "Weeding",
  fertilization: "Fertilization",
  aeration: "Aeration",
  overseeding: "Overseeding",
  leaf_removal: "Leaf Removal",
  mulching: "Mulching",
  hedge_trimming: "Hedge Trimming",
  gutter_cleaning: "Gutter Cleaning",
};
