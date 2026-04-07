import { useState, useRef, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Send, CheckCircle2, ArrowRight, Sparkles, RotateCcw, ChevronRight, CreditCard, Clock, Users } from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type StepType = "choice" | "multiselect" | "text" | "contact" | "notes";

interface Step {
  id: string;
  question: string;
  subtext?: string;
  type: StepType;
  options?: string[];
  show?: (a: Answers) => boolean;
  placeholder?: string;
  optional?: boolean;
}

interface Answers {
  serviceType?: string;
  // Moving / Junk / Labor
  fromZip?: string;
  toZip?: string;
  moveDate?: string;
  homeSize?: string;
  originFloor?: string;
  originElevator?: string;
  destFloor?: string;
  destElevator?: string;
  parkingDistance?: string;
  furniture?: string[];
  boxCount?: string;
  specialItems?: string[];
  packingHelp?: string;
  truckSituation?: string;
  // Snow / Handyman / Painting / Flooring
  propertyType?: string;
  scopeSize?: string;
  projectDate?: string;
  serviceAddress?: string;
  // Window Cleaning
  windowCount?: string;
  windowAddress?: string;
  // Trash Valet
  trashUnits?: string;
  trashAddress?: string;
  // Contact (all services)
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
}

interface Quote {
  crew: number;
  minHrs: number;
  maxHrs: number;
  minPrice: number;
  maxPrice: number;
  tokensEstimate: number;
  specialSurcharge: number;
  isFlat?: boolean;       // flat-rate services (window, trash)
  isTiered?: boolean;     // size-tier services (snow, handyman, painting, flooring)
  serviceLabel?: string;
}

interface SelectedPackage {
  id: string;
  label: string;
  price: number;        // for moving packages (exact)
  minPrice?: number;    // for range packages
  maxPrice?: number;
  crew?: number;
  hours?: number;
}

interface Message {
  from: "bot" | "user";
  text: string;
  ts: number;
}

interface Pricing {
  ratePerMoverHour: number;
  earnRatePerDollar?: number;
  bookingRequestBonus?: number;
  completionFlatBonus?: number;
  snowRemovalHourlyRate?: number;
  handymanHourlyRate?: number;
  paintingHourlyRate?: number;
  flooringPerSqFt?: number;
  windowCleaningPerPane?: number;
  trashValetBaseMonthly?: number;
}

// ─────────────────────────────────────────────
// Service group helpers
// ─────────────────────────────────────────────
const MOVING_SERVICES = [
  "📦 Local Move (origin → destination)",
  "💪 Loading Help Only (you drive)",
  "🏠 Unloading Help Only (you arrive)",
  "🗑️ Junk Removal",
  "📫 Packing Only (no truck)",
];
const TIERED_SERVICES = [
  "❄️ Snow Removal",
  "🔧 Handyman",
  "🎨 Painting",
  "🪵 Flooring",
];
const FLAT_SERVICES = [
  "🪟 Window Cleaning",
  "🗑️ Trash Valet (weekly curbside)",
];

function isMovingSvc(s?: string) { return MOVING_SERVICES.includes(s || ""); }
function isJunkSvc(s?: string) { return s === "🗑️ Junk Removal"; }
function isTieredSvc(s?: string) { return TIERED_SERVICES.includes(s || ""); }
function isWindowSvc(s?: string) { return s === "🪟 Window Cleaning"; }
function isTrashSvc(s?: string) { return s === "🗑️ Trash Valet (weekly curbside)"; }
function isSnowSvc(s?: string) { return s === "❄️ Snow Removal"; }
function isHandymanSvc(s?: string) { return s === "🔧 Handyman"; }
function isPaintingSvc(s?: string) { return s === "🎨 Painting"; }
function isFlooringSvc(s?: string) { return s === "🪵 Flooring"; }

// ─────────────────────────────────────────────
// Step Definitions
// ─────────────────────────────────────────────
const STEPS: Step[] = [
  // ── 1. Service type ──────────────────────────
  {
    id: "serviceType",
    question: "What service do you need?",
    subtext: "Pick the one that best describes your situation.",
    type: "choice",
    options: [
      ...MOVING_SERVICES,
      ...TIERED_SERVICES,
      ...FLAT_SERVICES,
    ],
  },

  // ── Moving / Junk / Labor ────────────────────
  {
    id: "fromZip",
    question: "What ZIP code are you moving FROM?",
    subtext: "Enter the 5-digit ZIP of the pickup address.",
    type: "text",
    placeholder: "e.g. 48201",
    show: (a) => isMovingSvc(a.serviceType),
  },
  {
    id: "toZip",
    question: "What ZIP code are you moving TO?",
    subtext: "Enter the 5-digit ZIP of the drop-off address.",
    type: "text",
    placeholder: "e.g. 48103",
    show: (a) => a.serviceType === "📦 Local Move (origin → destination)",
  },
  {
    id: "moveDate",
    question: "When do you need this done?",
    type: "choice",
    options: [
      "🔥 ASAP / This week",
      "📅 Next week",
      "🗓️ 2–3 weeks out",
      "📆 Next month",
      "⏳ 2+ months out",
      "🌀 Flexible / Not sure",
    ],
    show: (a) => isMovingSvc(a.serviceType),
  },
  {
    id: "homeSize",
    question: "What's the size of the space being moved?",
    subtext: "Pick the closest match.",
    type: "choice",
    options: [
      "Studio / Single Room",
      "1 Bedroom Apartment",
      "2 Bedroom Apartment",
      "3 Bedroom Apartment",
      "4+ Bedroom Apartment",
      "1–2 Bedroom House",
      "3 Bedroom House",
      "4+ Bedroom House",
      "Commercial / Office",
    ],
    show: (a) => isMovingSvc(a.serviceType),
  },
  {
    id: "originFloor",
    question: "Which floor are you on at the PICKUP location?",
    type: "choice",
    options: ["Ground Floor / 1st", "2nd Floor", "3rd Floor", "4th Floor or Higher"],
    show: (a) => isMovingSvc(a.serviceType) && !isJunkSvc(a.serviceType),
  },
  {
    id: "originElevator",
    question: "Is there a working elevator at the pickup location?",
    type: "choice",
    options: ["✅ Yes, there's an elevator", "🪜 No elevator — stairs only"],
    show: (a) =>
      isMovingSvc(a.serviceType) &&
      !isJunkSvc(a.serviceType) &&
      !["Ground Floor / 1st"].includes(a.originFloor || ""),
  },
  {
    id: "destFloor",
    question: "Which floor at the DROP-OFF location?",
    type: "choice",
    options: ["Ground Floor / 1st", "2nd Floor", "3rd Floor", "4th Floor or Higher"],
    show: (a) => a.serviceType === "📦 Local Move (origin → destination)",
  },
  {
    id: "destElevator",
    question: "Is there a working elevator at the drop-off location?",
    type: "choice",
    options: ["✅ Yes, there's an elevator", "🪜 No elevator — stairs only"],
    show: (a) =>
      a.serviceType === "📦 Local Move (origin → destination)" &&
      !["Ground Floor / 1st"].includes(a.destFloor || ""),
  },
  {
    id: "parkingDistance",
    question: "How far is truck parking from your door?",
    subtext: "Longer carries take more time.",
    type: "choice",
    options: [
      "🚛 Right outside the door (<30 ft)",
      "🚶 Short walk (30–100 ft)",
      "🏃 Long carry (100 ft+)",
    ],
    show: (a) =>
      isMovingSvc(a.serviceType) &&
      !isJunkSvc(a.serviceType) &&
      a.serviceType !== "📫 Packing Only (no truck)",
  },
  {
    id: "furniture",
    question: "Select all large furniture items you have:",
    subtext: "Tap everything that applies. Tap again to deselect.",
    type: "multiselect",
    options: [
      "King Bed", "Queen Bed", "Full / Twin Bed",
      "Sofa", "Sectional Sofa", "Loveseat",
      "Dining Table", "Dining Chairs (4+)",
      "Desk / Office Chair", "Dresser",
      "Wardrobe / Armoire", "Large Bookshelf",
      "TV (65\"+)", "TV (under 65\")",
      "Refrigerator", "Washer / Dryer",
      "Stove / Range", "None of the above",
    ],
    show: (a) => isMovingSvc(a.serviceType) && !isJunkSvc(a.serviceType),
  },
  {
    id: "boxCount",
    question: "Roughly how many packed boxes?",
    subtext: "Boxes under 20 lbs count. Don't overthink it.",
    type: "choice",
    options: [
      "Under 10 boxes", "10–25 boxes", "25–50 boxes",
      "50–75 boxes", "75–100 boxes", "100+ boxes",
    ],
    show: (a) => isMovingSvc(a.serviceType) && !isJunkSvc(a.serviceType),
  },
  {
    id: "specialItems",
    question: "Any specialty / heavy items?",
    subtext: "These require extra crew or equipment.",
    type: "multiselect",
    options: [
      "🎹 Upright Piano",
      "🎹 Grand Piano",
      "🎱 Pool Table",
      "♨️ Hot Tub",
      "🔒 Heavy Safe (300 lbs+)",
      "None of these",
    ],
    show: (a) => isMovingSvc(a.serviceType),
  },
  {
    id: "packingHelp",
    question: "Do you need packing help?",
    subtext: "We bring all supplies.",
    type: "choice",
    options: [
      "✅ No — I'm already packed",
      "📦 Pack a few fragile items",
      "🏠 Full packing service (whole home)",
    ],
    show: (a) => isMovingSvc(a.serviceType) && !isJunkSvc(a.serviceType),
  },
  {
    id: "truckSituation",
    question: "Truck situation?",
    type: "choice",
    options: [
      "🚛 I need JC to provide a truck",
      "🚗 I have my own truck / rental",
      "📋 Not sure yet",
    ],
    show: (a) => ["📦 Local Move (origin → destination)", "💪 Loading Help Only (you drive)"].includes(a.serviceType || ""),
  },

  // ── Snow / Handyman / Painting / Flooring ────
  {
    id: "propertyType",
    question: "What type of property?",
    type: "choice",
    options: [
      "🏠 Single-Family Home",
      "🏢 Condo / Apartment",
      "🏗️ Commercial / Business",
      "🏡 Multi-Unit Building",
    ],
    show: (a) => isTieredSvc(a.serviceType),
  },
  {
    id: "scopeSize",
    question: "How would you describe the scope of work?",
    type: "choice",
    options: [
      "Small — quick task or single area",
      "Medium — half-day project",
      "Large — full day or multiple areas",
      "XL — multi-day or whole home",
      "Not sure — I need a quote on-site",
    ],
    show: (a) => isTieredSvc(a.serviceType),
  },
  {
    id: "projectDate",
    question: "When are you looking to get this done?",
    type: "choice",
    options: [
      "🔥 ASAP / This week",
      "📅 Next week",
      "🗓️ 2–3 weeks out",
      "📆 Next month",
      "🌀 Flexible",
    ],
    show: (a) => isTieredSvc(a.serviceType),
  },
  {
    id: "serviceAddress",
    question: "What's the service address or ZIP code?",
    type: "text",
    placeholder: "e.g. 123 Main St or ZIP 48201",
    show: (a) => isTieredSvc(a.serviceType),
  },

  // ── Window Cleaning ──────────────────────────
  {
    id: "windowCount",
    question: "Roughly how many windows (panes) need cleaning?",
    type: "choice",
    options: [
      "1–5 panes",
      "6–10 panes",
      "11–20 panes",
      "21–30 panes",
      "30+ panes",
    ],
    show: (a) => isWindowSvc(a.serviceType),
  },
  {
    id: "windowAddress",
    question: "What's the service address or ZIP?",
    type: "text",
    placeholder: "e.g. 123 Main St or ZIP 48201",
    show: (a) => isWindowSvc(a.serviceType),
  },

  // ── Trash Valet ──────────────────────────────
  {
    id: "trashUnits",
    question: "How many units need weekly trash valet service?",
    type: "choice",
    options: [
      "1 unit",
      "2–5 units",
      "6–15 units",
      "16–30 units",
      "31+ units",
    ],
    show: (a) => isTrashSvc(a.serviceType),
  },
  {
    id: "trashAddress",
    question: "What's the property address or ZIP code?",
    type: "text",
    placeholder: "e.g. 123 Main St or ZIP 48201",
    show: (a) => isTrashSvc(a.serviceType),
  },

  // ── Contact (all) ────────────────────────────
  {
    id: "contact",
    question: "Almost done! What's the best way to reach you?",
    subtext: "Your quote will be reviewed by Darrell personally before anything is finalized.",
    type: "contact",
  },
  {
    id: "notes",
    question: "Anything else we should know?",
    subtext: "Special access, tight deadlines, etc. Type 'skip' or leave blank if none.",
    type: "notes",
    optional: true,
    placeholder: "e.g. 'Gate code 1234, narrow driveway, moving out-of-state in 10 days'",
  },
];

// ─────────────────────────────────────────────
// Quote Engine
// ─────────────────────────────────────────────
function computeQuote(a: Answers, pricing: Pricing | undefined): Quote {
  const rate = pricing?.ratePerMoverHour ?? 85;

  // ── Window Cleaning ──────────────────
  if (isWindowSvc(a.serviceType)) {
    const paneRate = pricing?.windowCleaningPerPane ?? 5;
    const paneMap: Record<string, number> = {
      "1–5 panes": 3, "6–10 panes": 8, "11–20 panes": 15,
      "21–30 panes": 25, "30+ panes": 35,
    };
    const midPanes = paneMap[a.windowCount || "6–10 panes"] ?? 8;
    const minPrice = Math.max(50, Math.round(midPanes * paneRate * 0.8 / 5) * 5);
    const maxPrice = Math.round(midPanes * paneRate * 1.2 / 5) * 5;
    return { crew: 1, minHrs: 1, maxHrs: 3, minPrice, maxPrice, tokensEstimate: Math.round((minPrice + maxPrice) / 2 * 50), specialSurcharge: 0, isFlat: true, serviceLabel: "Window Cleaning" };
  }

  // ── Trash Valet ──────────────────────
  if (isTrashSvc(a.serviceType)) {
    const baseRate = pricing?.trashValetBaseMonthly ?? 35;
    const unitMap: Record<string, number> = {
      "1 unit": 1, "2–5 units": 3, "6–15 units": 10,
      "16–30 units": 20, "31+ units": 35,
    };
    const units = unitMap[a.trashUnits || "1 unit"] ?? 1;
    const minPrice = Math.round(units * baseRate * 0.9);
    const maxPrice = Math.round(units * baseRate * 1.1);
    return { crew: 1, minHrs: 0, maxHrs: 0, minPrice, maxPrice, tokensEstimate: Math.round((minPrice + maxPrice) / 2 * 50), specialSurcharge: 0, isFlat: true, serviceLabel: "Trash Valet (monthly)" };
  }

  // ── Snow / Handyman / Painting / Flooring ────
  if (isTieredSvc(a.serviceType)) {
    const scopeMap: Record<string, [number, number]> = {
      "Small — quick task or single area": [0.5, 2],
      "Medium — half-day project": [2, 4],
      "Large — full day or multiple areas": [4, 8],
      "XL — multi-day or whole home": [8, 16],
      "Not sure — I need a quote on-site": [2, 8],
    };
    const [minH, maxH] = scopeMap[a.scopeSize || "Medium — half-day project"] ?? [2, 4];

    let hrRate = rate;
    let label = "Service";
    if (isSnowSvc(a.serviceType))     { hrRate = pricing?.snowRemovalHourlyRate ?? 85;  label = "Snow Removal"; }
    if (isHandymanSvc(a.serviceType)) { hrRate = pricing?.handymanHourlyRate    ?? 85;  label = "Handyman"; }
    if (isPaintingSvc(a.serviceType)) { hrRate = pricing?.paintingHourlyRate    ?? 85;  label = "Painting"; }
    if (isFlooringSvc(a.serviceType)) {
      const sqftRate = pricing?.flooringPerSqFt ?? 3;
      const sqftMap: Record<string, [number, number]> = {
        "Small — quick task or single area": [100, 200],
        "Medium — half-day project": [300, 600],
        "Large — full day or multiple areas": [600, 1200],
        "XL — multi-day or whole home": [1200, 2500],
        "Not sure — I need a quote on-site": [300, 1200],
      };
      const [minSq, maxSq] = sqftMap[a.scopeSize || "Medium — half-day project"] ?? [300, 600];
      const minPrice = Math.round(minSq * sqftRate / 25) * 25;
      const maxPrice = Math.round(maxSq * sqftRate / 25) * 25;
      return { crew: 2, minHrs: minH, maxHrs: maxH, minPrice, maxPrice, tokensEstimate: Math.round((minPrice + maxPrice) / 2 * 50), specialSurcharge: 0, isTiered: true, serviceLabel: "Flooring" };
    }

    const minPrice = Math.round(minH * hrRate / 25) * 25;
    const maxPrice = Math.round(maxH * hrRate / 25) * 25;
    return { crew: 1, minHrs: minH, maxHrs: maxH, minPrice, maxPrice, tokensEstimate: Math.round((minPrice + maxPrice) / 2 * 50), specialSurcharge: 0, isTiered: true, serviceLabel: label };
  }

  // ── Moving / Junk / Labor ────────────────────
  const sizeMap: Record<string, { crew: number; minH: number; maxH: number }> = {
    "Studio / Single Room":   { crew: 2, minH: 1.5, maxH: 2.5 },
    "1 Bedroom Apartment":    { crew: 2, minH: 2,   maxH: 3   },
    "2 Bedroom Apartment":    { crew: 2, minH: 3,   maxH: 4.5 },
    "3 Bedroom Apartment":    { crew: 3, minH: 4,   maxH: 6   },
    "4+ Bedroom Apartment":   { crew: 3, minH: 5,   maxH: 7   },
    "1–2 Bedroom House":      { crew: 2, minH: 3,   maxH: 5   },
    "3 Bedroom House":        { crew: 3, minH: 5,   maxH: 7   },
    "4+ Bedroom House":       { crew: 4, minH: 6,   maxH: 9   },
    "Commercial / Office":    { crew: 3, minH: 5,   maxH: 8   },
  };

  const cfg = sizeMap[a.homeSize || ""] || { crew: 2, minH: 2, maxH: 4 };
  let { crew } = cfg;
  let minH = cfg.minH;
  let maxH = cfg.maxH;

  const oFloor = { "Ground Floor / 1st": 1, "2nd Floor": 2, "3rd Floor": 3, "4th Floor or Higher": 4 }[a.originFloor || ""] || 1;
  if (oFloor >= 2 && a.originElevator === "🪜 No elevator — stairs only") { minH += (oFloor - 1) * 0.4; maxH += (oFloor - 1) * 0.6; }

  const dFloor = { "Ground Floor / 1st": 1, "2nd Floor": 2, "3rd Floor": 3, "4th Floor or Higher": 4 }[a.destFloor || ""] || 1;
  if (dFloor >= 2 && a.destElevator === "🪜 No elevator — stairs only") { minH += (dFloor - 1) * 0.4; maxH += (dFloor - 1) * 0.6; }

  if (a.parkingDistance === "🚶 Short walk (30–100 ft)") { minH += 0.25; maxH += 0.5; }
  if (a.parkingDistance === "🏃 Long carry (100 ft+)") { minH += 0.5; maxH += 1; }

  const furn = (a.furniture || []).filter(f => f !== "None of the above").length;
  minH += Math.floor(furn / 5) * 0.25;
  maxH += Math.floor(furn / 3) * 0.5;

  const boxAdj: Record<string, [number, number]> = {
    "Under 10 boxes": [0, 0], "10–25 boxes": [0.25, 0.5], "25–50 boxes": [0.5, 1],
    "50–75 boxes": [1, 1.5], "75–100 boxes": [1.5, 2], "100+ boxes": [2.5, 3.5],
  };
  const [bMin, bMax] = boxAdj[a.boxCount || ""] || [0, 0];
  minH += bMin; maxH += bMax;

  let specialSurcharge = 0;
  const specials = (a.specialItems || []).filter(s => s !== "None of these");
  if (specials.includes("🎹 Grand Piano"))   { crew = Math.max(crew, 4); minH += 2; maxH += 3; specialSurcharge += 250; }
  if (specials.includes("🎹 Upright Piano")) { crew = Math.max(crew, 3); minH += 1; maxH += 2; specialSurcharge += 150; }
  if (specials.includes("🎱 Pool Table"))    { crew = Math.max(crew, 3); minH += 1; maxH += 2; specialSurcharge += 150; }
  if (specials.includes("♨️ Hot Tub"))       { crew = Math.max(crew, 3); minH += 1; maxH += 2; specialSurcharge += 200; }
  if (specials.includes("🔒 Heavy Safe (300 lbs+)")) { minH += 0.5; maxH += 1; specialSurcharge += 75; }

  if (a.packingHelp === "📦 Pack a few fragile items") { minH += 0.5; maxH += 1; }
  if (a.packingHelp === "🏠 Full packing service (whole home)") { minH += 2; maxH += 4; crew = Math.max(crew, 3); }

  if (["💪 Loading Help Only (you drive)", "🏠 Unloading Help Only (you arrive)"].includes(a.serviceType || "")) {
    minH *= 0.55; maxH *= 0.55;
  }

  if (isJunkSvc(a.serviceType)) {
    crew = Math.min(crew, 2);
    minH = Math.max(1, minH * 0.45);
    maxH = Math.max(2, maxH * 0.55);
  }

  const round25 = (n: number) => Math.ceil(n / 25) * 25;
  const minPrice = round25(crew * minH * rate) + specialSurcharge;
  const maxPrice = round25(crew * maxH * rate) + specialSurcharge;
  const midPrice = (minPrice + maxPrice) / 2;
  const tokensEstimate = Math.round(midPrice * 50);

  return {
    crew,
    minHrs: Math.round(minH * 2) / 2,
    maxHrs: Math.round(maxH * 2) / 2,
    minPrice,
    maxPrice,
    tokensEstimate,
    specialSurcharge,
    serviceLabel: isJunkSvc(a.serviceType) ? "Junk Removal" : "Moving",
  };
}

// ─────────────────────────────────────────────
// Package builders (for package selection step)
// ─────────────────────────────────────────────
function buildMovingPackages(quote: Quote, rate: number): SelectedPackage[] {
  const round = (n: number) => Math.round(n / 10) * 10;
  const pkgs: SelectedPackage[] = [];
  const { crew, minHrs, maxHrs } = quote;
  const minCrew = Math.max(2, crew - 1);
  const maxCrew = crew + 1;
  for (let c = minCrew; c <= maxCrew; c++) {
    const hoursToTry = Array.from(new Set([Math.floor(minHrs), Math.ceil((minHrs + maxHrs) / 2), Math.ceil(maxHrs)]));
    for (const h of hoursToTry) {
      if (h < 1 || h > 12) continue;
      const price = round(c * h * rate);
      const disc = h >= 7 ? 0.20 : h >= 5 ? 0.15 : h >= 3 ? 0.10 : 0;
      const finalPrice = disc ? Math.round(price * (1 - disc) / 10) * 10 : price;
      const tag = disc ? `${(disc * 100).toFixed(0)}% Off` : (c === crew && h === Math.ceil((minHrs + maxHrs) / 2) ? "Recommended" : undefined);
      pkgs.push({ id: `mv_${c}m_${h}h`, label: `${c} Movers × ${h} hrs`, price: finalPrice, crew: c, hours: h, ...(tag ? {} : {}), minPrice: finalPrice, maxPrice: finalPrice });
      if (tag) pkgs[pkgs.length - 1] = { ...pkgs[pkgs.length - 1] };
    }
  }
  // deduplicate by id and limit to 6
  const seen = new Set<string>();
  return pkgs.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; }).slice(0, 6);
}

function buildJunkPackages(): SelectedPackage[] {
  return [
    { id: "junk_single", label: "Single Item", minPrice: 100, maxPrice: 200, price: 150 },
    { id: "junk_quarter", label: "¼ Truck Load", minPrice: 300, maxPrice: 500, price: 400 },
    { id: "junk_half", label: "½ Truck Load", minPrice: 500, maxPrice: 800, price: 650 },
    { id: "junk_full", label: "Full Truck Load", minPrice: 1000, maxPrice: 1400, price: 1200 },
  ];
}

function buildTieredPackages(quote: Quote, answers: Answers, pricing: Pricing | undefined): SelectedPackage[] {
  const { minPrice, maxPrice } = quote;
  const mid = Math.round((minPrice + maxPrice) / 2);
  const svc = answers.serviceType || "";

  if (isFlooringSvc(svc)) {
    return [
      { id: "floor_room", label: "Single Room (~150 sq ft)", minPrice: Math.round(minPrice * 0.3), maxPrice: Math.round(maxPrice * 0.3), price: Math.round(mid * 0.3) },
      { id: "floor_multi", label: "Multi-Room (2–4 rooms)", minPrice: Math.round(minPrice * 0.6), maxPrice: Math.round(maxPrice * 0.6), price: Math.round(mid * 0.6) },
      { id: "floor_home", label: "Whole Home", minPrice, maxPrice, price: mid },
      { id: "floor_custom", label: "Custom — Quote on Site", minPrice: 0, maxPrice: 0, price: 0 },
    ];
  }

  return [
    { id: "tier_small", label: "Small", minPrice: Math.round(minPrice * 0.4), maxPrice: Math.round(maxPrice * 0.4), price: Math.round(mid * 0.4) },
    { id: "tier_medium", label: "Medium", minPrice: Math.round(minPrice * 0.6), maxPrice: Math.round(maxPrice * 0.7), price: Math.round(mid * 0.65) },
    { id: "tier_large", label: "Large", minPrice, maxPrice, price: mid },
    { id: "tier_custom", label: "Custom — Quote on Site", minPrice: 0, maxPrice: 0, price: 0 },
  ];
}

function buildWindowPackages(quote: Quote, answers: Answers, pricing: Pricing | undefined): SelectedPackage[] {
  const paneRate = pricing?.windowCleaningPerPane ?? 5;
  const paneMap: Record<string, number[]> = {
    "1–5 panes": [1, 5], "6–10 panes": [6, 10], "11–20 panes": [11, 20],
    "21–30 panes": [21, 30], "30+ panes": [30, 40],
  };
  const [minP, maxP] = paneMap[answers.windowCount || "6–10 panes"] ?? [6, 10];
  return [
    { id: "win_interior", label: "Interior Windows Only", minPrice: Math.round(minP * paneRate * 0.6), maxPrice: Math.round(maxP * paneRate * 0.6), price: Math.round((minP + maxP) / 2 * paneRate * 0.6) },
    { id: "win_exterior", label: "Exterior Windows Only", minPrice: Math.round(minP * paneRate * 0.7), maxPrice: Math.round(maxP * paneRate * 0.7), price: Math.round((minP + maxP) / 2 * paneRate * 0.7) },
    { id: "win_both", label: "Interior + Exterior (Both Sides)", minPrice: Math.round(minP * paneRate), maxPrice: Math.round(maxP * paneRate), price: Math.round((minP + maxP) / 2 * paneRate) },
  ];
}

function buildTrashPackages(answers: Answers, pricing: Pricing | undefined): SelectedPackage[] {
  const baseRate = pricing?.trashValetBaseMonthly ?? 35;
  const unitMap: Record<string, number> = {
    "1 unit": 1, "2–5 units": 3, "6–15 units": 10, "16–30 units": 20, "31+ units": 35,
  };
  const units = unitMap[answers.trashUnits || "1 unit"] ?? 1;
  return [
    { id: "trash_monthly", label: `Monthly (${units} unit${units > 1 ? "s" : ""})`, minPrice: Math.round(units * baseRate * 0.9), maxPrice: Math.round(units * baseRate * 1.1), price: Math.round(units * baseRate) },
    { id: "trash_quarterly", label: `Quarterly (3 months · save 5%)`, minPrice: Math.round(units * baseRate * 2.85), maxPrice: Math.round(units * baseRate * 3.15), price: Math.round(units * baseRate * 3 * 0.95) },
  ];
}

// ─────────────────────────────────────────────
// Short answer for chat bubbles
// ─────────────────────────────────────────────
function shortAnswer(stepId: string, val: string | string[]): string {
  if (Array.isArray(val)) {
    if (val.includes("None of the above") || val.includes("None of these")) {
      const others = val.filter(v => v !== "None of the above" && v !== "None of these");
      return others.length > 0 ? others.join(", ") : "None";
    }
    return val.length <= 3 ? val.join(", ") : `${val.slice(0, 2).join(", ")} +${val.length - 2} more`;
  }
  return val;
}

// ─────────────────────────────────────────────
// Deposit amount (configurable later)
// ─────────────────────────────────────────────
const DEPOSIT_AMOUNT = 75;

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
export function BookingChatbot({
  onClose,
  embedded = false,
  showCloseButton,
  className,
  initialService,
}: {
  onClose?: () => void;
  embedded?: boolean;
  showCloseButton?: boolean;
  className?: string;
  initialService?: string;
}) {
  const showClose = showCloseButton ?? !embedded;
  const { toast } = useToast();
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: pricing } = useQuery<Pricing>({ queryKey: ["/api/pricing"] });

  // Derive initial answers from initialService prop
  const initialAnswers = useMemo<Answers>(() => {
    if (!initialService) return {};
    const svcMap: Record<string, string> = {
      residential: "📦 Local Move (origin → destination)",
      junk: "🗑️ Junk Removal",
      snow: "❄️ Snow Removal",
      handyman: "🔧 Handyman",
      labor: "💪 Loading Help Only (you drive)",
      painting: "🎨 Painting",
      flooring: "🪵 Flooring",
      window_cleaning: "🪟 Window Cleaning",
      trash_valet: "🗑️ Trash Valet (weekly curbside)",
    };
    const mapped = svcMap[initialService];
    return mapped ? { serviceType: mapped } : {};
  }, [initialService]);

  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [messages, setMessages] = useState<Message[]>(() => {
    const greeting = "👋 Hi — I'm JC from Northwoods Moving. I'll help you get an instant estimate and lock in your appointment. No pressure, no spam — real human review before anything is finalized.";
    return [{ from: "bot", text: greeting, ts: Date.now() }];
  });

  // If initialService is set, skip the first step (serviceType)
  const [stepIdx, setStepIdx] = useState(() => initialService ? 1 : 0);
  const [textInput, setTextInput] = useState("");
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [contactName, setContactName] = useState(() => user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : "");
  const [contactPhone, setContactPhone] = useState(() => user?.phoneNumber || "");
  const [contactEmail, setContactEmail] = useState(() => user?.email || "");

  // Phases: "chat" | "packages" | "deposit" | "submitted"
  const [phase, setPhase] = useState<"chat" | "packages" | "deposit" | "submitted">("chat");
  const [pendingQuote, setPendingQuote] = useState<Quote | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<SelectedPackage | null>(null);
  const [depositPaid, setDepositPaid] = useState(false);

  // Visible steps filtered by show()
  const visibleSteps = useMemo(
    () => STEPS.filter(s => !s.show || s.show(answers)),
    [answers]
  );

  const currentStep = visibleSteps[stepIdx];

  // Pre-fill contact info when user data becomes available
  useEffect(() => {
    if (user) {
      setContactName(prev => prev || [user.firstName, user.lastName].filter(Boolean).join(" "));
      setContactPhone(prev => prev || (user.phoneNumber || ""));
      setContactEmail(prev => prev || (user.email || ""));
    }
  }, [user]);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, phase, selectedPackage]);

  function botSay(text: string, delay = 0) {
    setTimeout(() => {
      setMessages(prev => [...prev, { from: "bot", text, ts: Date.now() + delay }]);
    }, delay);
  }

  function userSay(text: string) {
    setMessages(prev => [...prev, { from: "user", text, ts: Date.now() }]);
  }

  function advanceStep(stepId: string, value: string | string[]) {
    const newAnswers = { ...answers };

    if (stepId === "contact") {
      newAnswers.contactName = contactName.trim();
      newAnswers.contactPhone = contactPhone.trim();
      newAnswers.contactEmail = contactEmail.trim();
    } else if (Array.isArray(value)) {
      (newAnswers as Record<string, unknown>)[stepId] = value;
    } else {
      (newAnswers as Record<string, unknown>)[stepId] = value;
    }
    setAnswers(newAnswers);

    if (stepId === "contact") {
      userSay(`${contactName} · ${contactPhone} · ${contactEmail}`);
    } else {
      userSay(shortAnswer(stepId, value));
    }

    const nextVisibleSteps = STEPS.filter(s => !s.show || s.show(newAnswers));
    const nextIdx = stepIdx + 1;

    if (nextIdx < nextVisibleSteps.length) {
      const nextStep = nextVisibleSteps[nextIdx];
      setTimeout(() => {
        botSay(nextStep.question + (nextStep.subtext ? `\n\n_${nextStep.subtext}_` : ""));
        setStepIdx(nextIdx);
        setTextInput("");
        setMultiSel([]);
      }, 500);
    } else {
      // All questions answered — compute quote and enter package selection phase
      setTimeout(() => {
        const q = computeQuote(newAnswers, pricing);
        setPendingQuote(q);
        botSay(
          `Perfect! Based on your answers, I've put together a quote estimate. Review it below and **select a package** that fits your needs — then we'll confirm your appointment with a small deposit. 👇`
        );
        setTimeout(() => setPhase("packages"), 600);
        setStepIdx(nextVisibleSteps.length);
      }, 500);
    }
  }

  function handleChoice(opt: string) {
    if (!currentStep) return;
    advanceStep(currentStep.id, opt);
  }

  function handleTextSubmit() {
    if (!currentStep) return;
    const val = textInput.trim();
    if (!val && !currentStep.optional) return;
    advanceStep(currentStep.id, val || "(none)");
  }

  function handleMultiSubmit() {
    if (!currentStep) return;
    if (multiSel.length === 0) return;
    advanceStep(currentStep.id, multiSel);
    setMultiSel([]);
  }

  function toggleMulti(opt: string) {
    setMultiSel(prev => {
      const isExclusive = opt === "None of the above" || opt === "None of these";
      if (isExclusive) return [opt];
      const withoutExcl = prev.filter(x => x !== "None of the above" && x !== "None of these");
      return withoutExcl.includes(opt)
        ? withoutExcl.filter(x => x !== opt)
        : [...withoutExcl, opt];
    });
  }

  function handleContactSubmit() {
    if (!contactName.trim() || !contactPhone.trim() || !contactEmail.trim()) return;
    advanceStep("contact", "");
  }

  function handlePackageSelect(pkg: SelectedPackage) {
    setSelectedPackage(pkg);
  }

  function handlePackageContinue() {
    if (!selectedPackage) return;
    botSay(`Great choice — **${selectedPackage.label}**! Now let's confirm your appointment with a $${DEPOSIT_AMOUNT} deposit. This holds your spot on the schedule.`);
    setPhase("deposit");
  }

  const [depositInvoiceSent, setDepositInvoiceSent] = useState(false);
  const [depositInvoiceUrl, setDepositInvoiceUrl] = useState<string | null>(null);

  // Submission
  const submitMutation = useMutation({
    mutationFn: async (withDeposit: boolean) => {
      if (!pendingQuote) throw new Error("No quote");
      const result = await apiRequest("POST", "/api/chatbot-quote", {
        answers,
        quote: pendingQuote,
        selectedPackage,
        depositPaid: withDeposit,
      });
      return result as { leadId: string; message: string; depositInvoiceSent?: boolean; depositInvoiceUrl?: string };
    },
    onSuccess: (data, withDeposit) => {
      setDepositPaid(withDeposit);
      setDepositInvoiceSent(data?.depositInvoiceSent ?? false);
      setDepositInvoiceUrl(data?.depositInvoiceUrl ?? null);
      setPhase("submitted");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Please try again.";
      toast({ title: "Submission failed", description: msg, variant: "destructive" });
    },
  });

  function handleDepositPay() {
    // Server will create the Square invoice and email it — no need to open a URL manually
    submitMutation.mutate(true);
  }

  function handleSkipDeposit() {
    submitMutation.mutate(false);
  }

  function resetChat() {
    setAnswers({});
    setMessages([{
      from: "bot",
      text: "👋 Hi — I'm JC from Northwoods Moving. I'll help you get an instant estimate and lock in your appointment. No pressure, no spam — real human review before anything is finalized.",
      ts: Date.now(),
    }]);
    setStepIdx(0);
    setTextInput("");
    setMultiSel([]);
    setContactName(user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : "");
    setContactPhone(user?.phoneNumber || "");
    setContactEmail(user?.email || "");
    setPhase("chat");
    setPendingQuote(null);
    setSelectedPackage(null);
    setDepositPaid(false);
  }

  const isDone = stepIdx >= visibleSteps.length;
  const progress = isDone || phase !== "chat" ? 100 : Math.round((stepIdx / visibleSteps.length) * 100);

  // Build packages for the package selection phase
  const rate = pricing?.ratePerMoverHour ?? 85;
  const packages: SelectedPackage[] = useMemo(() => {
    if (!pendingQuote) return [];
    const svc = answers.serviceType || "";
    if (isMovingSvc(svc) && !isJunkSvc(svc)) return buildMovingPackages(pendingQuote, rate);
    if (isJunkSvc(svc)) return buildJunkPackages();
    if (isTieredSvc(svc)) return buildTieredPackages(pendingQuote, answers, pricing);
    if (isWindowSvc(svc)) return buildWindowPackages(pendingQuote, answers, pricing);
    if (isTrashSvc(svc)) return buildTrashPackages(answers, pricing);
    return [];
  }, [pendingQuote, answers, pricing, rate]);

  return (
    <div className={`flex flex-col h-full min-h-[500px]${className ? " " + className : ""}`}>
      {/* Progress bar */}
      <div className="px-1 pb-2 shrink-0">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span>
            {phase === "submitted" ? "✅ Appointment confirmed!" :
             phase === "deposit"   ? "Step 3 of 3 — Deposit" :
             phase === "packages"  ? "Step 2 of 3 — Select Package" :
             isDone                ? "Step 1 of 3 — Quote ready!" :
             "Step 1 of 3 — Your quote (~60 sec)"}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.from === "bot" ? "justify-start" : "justify-end"}`}>
            {m.from === "bot" && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0 mr-2 mt-0.5">JC</div>
            )}
            <div
              className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                m.from === "bot"
                  ? "bg-slate-800 text-slate-100 rounded-tl-sm"
                  : "bg-teal-600 text-white rounded-tr-sm"
              }`}
              dangerouslySetInnerHTML={{
                __html: m.text
                  .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                  .replace(/_(.*?)_/g, "<em class='text-teal-300 not-italic'>$1</em>"),
              }}
            />
          </div>
        ))}

        {/* ── PHASE: Package Selection ── */}
        {phase === "packages" && pendingQuote && (
          <div className="mx-1 mt-2 space-y-3">
            {/* Quote summary */}
            <div className="rounded-2xl border border-teal-500/30 bg-gradient-to-br from-teal-900/30 to-slate-900/60 overflow-hidden">
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-teal-400" />
                  <span className="text-sm font-bold text-teal-300 uppercase tracking-wide">Your Estimated Quote</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {!pendingQuote.isFlat && (
                    <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-slate-400 mb-1">Crew Size</p>
                      <p className="text-xl font-bold text-white">{pendingQuote.crew}</p>
                      <p className="text-[10px] text-slate-400">movers</p>
                    </div>
                  )}
                  {!pendingQuote.isFlat && (
                    <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-slate-400 mb-1">Est. Hours</p>
                      <p className="text-xl font-bold text-white">{pendingQuote.minHrs}–{pendingQuote.maxHrs}</p>
                      <p className="text-[10px] text-slate-400">hours</p>
                    </div>
                  )}
                  <div className={`bg-slate-800/60 rounded-xl p-3 text-center ${pendingQuote.isFlat ? "col-span-2" : ""}`}>
                    <p className="text-[10px] text-slate-400 mb-1">JCMOVES Earned</p>
                    <p className="text-lg font-bold text-yellow-400">{(pendingQuote.tokensEstimate / 1000).toFixed(0)}K+</p>
                    <p className="text-[10px] text-slate-400">tokens</p>
                  </div>
                </div>
                <div className="bg-slate-900/60 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-400 mb-1">Estimated Price Range</p>
                  <p className="text-2xl font-bold text-white">
                    ${pendingQuote.minPrice.toLocaleString()} – ${pendingQuote.maxPrice.toLocaleString()}
                  </p>
                  {pendingQuote.specialSurcharge > 0 && (
                    <p className="text-xs text-orange-400 mt-1">Includes ${pendingQuote.specialSurcharge} specialty item surcharge</p>
                  )}
                  <p className="text-[11px] text-slate-500 mt-1">Final price confirmed by Darrell after review</p>
                </div>
              </div>
            </div>

            {/* Package cards */}
            <div>
              <p className="text-xs font-semibold text-slate-300 mb-2 px-1">Select a package:</p>
              <div className="grid grid-cols-1 gap-2">
                {packages.map((pkg) => {
                  const isSelected = selectedPackage?.id === pkg.id;
                  const isCustom = pkg.price === 0;
                  return (
                    <button
                      key={pkg.id}
                      onClick={() => handlePackageSelect(pkg)}
                      className={`flex items-center justify-between p-3.5 rounded-xl border-2 text-left transition-all ${
                        isSelected
                          ? "border-teal-500 bg-teal-900/30"
                          : "border-slate-700/60 bg-slate-800/40 hover:border-teal-500/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-teal-400 shrink-0" />}
                        {!isSelected && <div className="h-4 w-4 rounded-full border-2 border-slate-600 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-100 truncate">{pkg.label}</p>
                          {pkg.crew && pkg.hours && (
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="flex items-center gap-1 text-[11px] text-slate-400"><Users className="h-2.5 w-2.5" />{pkg.crew} movers</span>
                              <span className="flex items-center gap-1 text-[11px] text-slate-400"><Clock className="h-2.5 w-2.5" />{pkg.hours} hrs</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        {isCustom ? (
                          <p className="text-sm font-bold text-slate-400">Custom Quote</p>
                        ) : pkg.minPrice !== pkg.maxPrice ? (
                          <p className="text-sm font-bold text-teal-300">${pkg.minPrice}–${pkg.maxPrice}</p>
                        ) : (
                          <p className="text-sm font-bold text-teal-300">${pkg.price.toLocaleString()}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              onClick={handlePackageContinue}
              disabled={!selectedPackage}
              className="w-full bg-gradient-to-r from-teal-600 to-blue-600 hover:from-teal-500 hover:to-blue-500 text-white font-bold py-3 rounded-xl text-sm"
            >
              Continue with {selectedPackage ? `"${selectedPackage.label}"` : "Selected Package"} <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* ── PHASE: Deposit ── */}
        {phase === "deposit" && pendingQuote && (
          <div className="mx-1 mt-2">
            <div className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-900/20 to-slate-900/60 overflow-hidden">
              <div className="px-4 pt-4 pb-4 space-y-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-orange-400" />
                  <span className="text-sm font-bold text-orange-300 uppercase tracking-wide">Confirm Your Appointment</span>
                </div>

                <div className="bg-slate-900/60 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-white">${DEPOSIT_AMOUNT}</p>
                  <p className="text-sm text-slate-400 mt-1">Appointment Deposit</p>
                  <p className="text-xs text-slate-500 mt-2">Applied toward your final invoice · Fully refundable if rescheduled 24 hrs in advance</p>
                </div>

                {selectedPackage && (
                  <div className="flex items-center justify-between bg-slate-800/60 rounded-xl px-3 py-2.5">
                    <span className="text-sm text-slate-300">Selected Package</span>
                    <span className="text-sm font-semibold text-teal-300">{selectedPackage.label}</span>
                  </div>
                )}

                <div className="flex items-start gap-2 bg-blue-900/20 border border-blue-500/20 rounded-lg px-3 py-2">
                  <span className="text-base shrink-0">🔍</span>
                  <p className="text-xs text-slate-300">
                    After submitting, Darrell reviews your request and sends a <strong className="text-white">finalized invoice to your email</strong>. Payment locks in your spot on the schedule.
                  </p>
                </div>

                <div className="space-y-2">
                  <Button
                    onClick={handleDepositPay}
                    disabled={submitMutation.isPending}
                    className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold py-3 rounded-xl text-sm"
                  >
                    {submitMutation.isPending ? (
                      "Sending invoice…"
                    ) : (
                      <><CreditCard className="h-4 w-4 mr-2" />Send ${DEPOSIT_AMOUNT} Deposit Invoice &amp; Confirm</>
                    )}
                  </Button>
                  <p className="text-[11px] text-slate-500 text-center px-2">
                    Invoice emailed instantly · Applied toward final balance · Refundable with 24 hr notice
                  </p>
                  <Button
                    variant="ghost"
                    onClick={handleSkipDeposit}
                    disabled={submitMutation.isPending}
                    className="w-full text-slate-400 hover:text-slate-200 text-xs py-2"
                  >
                    {submitMutation.isPending ? "Submitting…" : "Skip deposit — submit for review only"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PHASE: Submitted ── */}
        {phase === "submitted" && (
          <div className="mx-1 mt-2">
            <div className="rounded-2xl border border-green-500/30 bg-gradient-to-br from-green-900/20 to-slate-900/60 px-4 py-6 flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-green-400" />
              </div>
              <div>
                <p className="font-bold text-white text-base">
                  {depositPaid ? "Deposit Invoice Sent!" : "Quote Submitted!"}
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  {depositPaid && depositInvoiceSent
                    ? `A $${DEPOSIT_AMOUNT} deposit invoice was emailed to ${answers.contactEmail || "you"}. Paying it confirms your appointment.`
                    : depositPaid && !depositInvoiceSent
                    ? `Your quote is in — Darrell will send a $${DEPOSIT_AMOUNT} deposit invoice to your email shortly.`
                    : "Darrell will review and reach out with a finalized quote soon."}
                </p>
              </div>

              {depositInvoiceUrl && (
                <a
                  href={depositInvoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full"
                >
                  <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div className="text-left">
                      <p className="text-sm font-semibold text-orange-300">Open Deposit Invoice</p>
                      <p className="text-xs text-slate-400">Pay ${DEPOSIT_AMOUNT} to lock in your spot</p>
                    </div>
                    <CreditCard className="h-5 w-5 text-orange-400 shrink-0" />
                  </div>
                </a>
              )}

              <div className="bg-slate-800/60 rounded-xl px-4 py-3 w-full">
                <p className="text-xs text-slate-400 font-medium mb-2">What happens next:</p>
                <div className="space-y-1.5 text-left">
                  <div className="flex items-start gap-2">
                    <span className="text-teal-400 text-xs shrink-0 mt-0.5">1.</span>
                    <p className="text-xs text-slate-300">
                      {depositPaid ? "Pay the deposit invoice (check your email)" : "Admin reviews your quote (2–4 hrs)"}
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-teal-400 text-xs shrink-0 mt-0.5">2.</span>
                    <p className="text-xs text-slate-300">Darrell confirms details &amp; sends finalized invoice</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-teal-400 text-xs shrink-0 mt-0.5">3.</span>
                    <p className="text-xs text-slate-300">Full payment confirms your scheduled date</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-teal-400 text-xs shrink-0 mt-0.5">4.</span>
                    <p className="text-xs text-slate-300">Crew is auto-dispatched on your chosen day ✅</p>
                  </div>
                </div>
              </div>
              {onClose && showClose && (
                <Button variant="outline" size="sm" onClick={onClose} className="border-slate-600 text-slate-300 hover:bg-slate-800">
                  Close <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              )}
              <button onClick={resetChat} className="text-xs text-slate-500 hover:text-slate-400 flex items-center gap-1">
                <RotateCcw className="h-3 w-3" /> Start a new quote
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Input area — only show during chat phase and not done */}
      {phase === "chat" && !isDone && currentStep && (
        <div className="shrink-0 pt-2 border-t border-slate-800/60">
          {/* CHOICE */}
          {currentStep.type === "choice" && (
            <div className="grid grid-cols-1 gap-1.5">
              {currentStep.options!.map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleChoice(opt)}
                  className="text-left px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-teal-800/60 border border-slate-700/60 hover:border-teal-500/60 text-sm text-slate-200 transition-all flex items-center justify-between group"
                >
                  <span>{opt}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-teal-400 transition-colors" />
                </button>
              ))}
            </div>
          )}

          {/* MULTISELECT */}
          {currentStep.type === "multiselect" && (
            <div>
              <div className="flex flex-wrap gap-1.5 mb-2 max-h-36 overflow-y-auto">
                {currentStep.options!.map((opt) => {
                  const sel = multiSel.includes(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() => toggleMulti(opt)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        sel
                          ? "bg-teal-600 border-teal-500 text-white"
                          : "bg-slate-800 border-slate-700 text-slate-300 hover:border-teal-500/60"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              <Button
                onClick={handleMultiSubmit}
                disabled={multiSel.length === 0}
                size="sm"
                className="w-full bg-teal-600 hover:bg-teal-500 text-white"
              >
                Continue ({multiSel.length} selected) <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}

          {/* TEXT */}
          {currentStep.type === "text" && (
            <div className="flex gap-2">
              <Input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
                placeholder={currentStep.placeholder || "Type your answer…"}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                autoFocus
              />
              <Button onClick={handleTextSubmit} size="icon" className="bg-teal-600 hover:bg-teal-500 shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* NOTES */}
          {currentStep.type === "notes" && (
            <div className="space-y-2">
              <Textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={currentStep.placeholder || "Type here or leave blank to skip…"}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm resize-none"
                rows={2}
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => advanceStep(currentStep.id, "(no additional notes)")}
                  className="border-slate-600 text-slate-400 hover:bg-slate-800">
                  Skip
                </Button>
                <Button onClick={handleTextSubmit} size="sm" className="flex-1 bg-teal-600 hover:bg-teal-500 text-white">
                  Submit Notes <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* CONTACT */}
          {currentStep.type === "contact" && (
            <div className="space-y-2">
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Full name"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
              />
              <Input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="Phone number"
                type="tel"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
              />
              <Input
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="Email address"
                type="email"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleContactSubmit()}
              />
              <Button
                onClick={handleContactSubmit}
                disabled={!contactName.trim() || !contactPhone.trim() || !contactEmail.trim()}
                className="w-full bg-teal-600 hover:bg-teal-500 text-white"
                size="sm"
              >
                Continue <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
