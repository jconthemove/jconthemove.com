import { useState, useRef, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Send, CheckCircle2, ArrowRight, Sparkles, RotateCcw, ChevronRight, AlertCircle, Users, DollarSign } from "lucide-react";
import { calculateWindowCleaningQuote } from "@shared/windowCleaningPricing";
import { calculateTrashValetQuote } from "@shared/trashValetPricing";
import { PlacesAutocomplete } from "@/components/places-autocomplete";

// ─────────────────────────────────────────────
// Service categories
// ─────────────────────────────────────────────
const PRICEABLE_SERVICES = ["Moving", "Junk Removal", "Trash Valet", "Window Cleaning"];
const QUOTE_ONLY_SERVICES = ["Painting", "Flooring", "Roofing", "Handyman", "Lawn Care", "Snow Removal"];
const IRONWOOD_ZIP = "49938";

function isIronwoodZip(zip: string): boolean {
  const clean = zip.trim();
  if (clean === IRONWOOD_ZIP) return true;
  const match = clean.match(/\b(\d{5})\b/);
  return match ? match[1] === IRONWOOD_ZIP : false;
}

function getDepositInfo(service: string, zip: string): { required: boolean; amount: number; termsHtml: string } {
  const isLocal = isIronwoodZip(zip);

  if (service === "Handyman") {
    if (isLocal) {
      return {
        required: true,
        amount: 50,
        termsHtml: "$50 non-refundable estimate deposit (credited toward your project upon booking).",
      };
    } else {
      return {
        required: true,
        amount: 100,
        termsHtml: "$100 non-refundable estimate deposit (credited toward your project upon booking).",
      };
    }
  }

  if (["Painting", "Flooring", "Roofing"].includes(service)) {
    if (isLocal) {
      return { required: false, amount: 0, termsHtml: "" };
    } else {
      return {
        required: true,
        amount: 100,
        termsHtml: "$100 non-refundable estimate deposit (credited toward your project if you book within 6 months).",
      };
    }
  }

  return { required: false, amount: 0, termsHtml: "" };
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type StepType = "choice" | "multiselect" | "text" | "address" | "contact" | "notes" | "deposit_ack" | "package_select";

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
  serviceCategory?: "priceable" | "quote_only";
  // Moving fields
  fromZip?: string;
  toZip?: string;
  loadType?: string;
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
  // Trash Valet fields
  trashCans?: string;
  trashBags?: string;
  recyclingEnabled?: string;
  trashPlanType?: string;
  // Window Cleaning fields
  standardWindows?: string;
  largeWindows?: string;
  ladderWindows?: string;
  windowInside?: string;
  windowOutside?: string;
  // Quote-only fields
  jobScope?: string;
  jobLocation?: string;
  // Deposit
  depositZip?: string;
  depositAcknowledged?: string;
  // Package selection
  selectedPackage?: string;
  // Promo code
  promoCode?: string;
  // Contact
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
}

interface MovingQuote {
  type: "moving";
  tier: "tiny" | "small" | "medium" | "large";
  crew: number;
  minHrs: number;
  maxHrs: number;
  minPrice: number;
  maxPrice: number;
  tokensEstimate: number;
  specialSurcharge: number;
  promoApplied?: boolean;
  promoCode?: string;
  rawMinPrice?: number;
}

interface TrashValetQuoteResult {
  type: "trash_valet";
  finalMonthlyPrice: number;
  minPrice: number;
  maxPrice: number;
}

interface WindowQuoteResult {
  type: "window_cleaning";
  paneCount: number;
  minPrice: number;
  maxPrice: number;
  total: number;
}

interface QuoteOnlyResult {
  type: "quote_only";
  service: string;
  minPrice: number;
  maxPrice: number;
}

type QuoteResult = MovingQuote | TrashValetQuoteResult | WindowQuoteResult | QuoteOnlyResult;

interface CrewPackage {
  id: string;
  label: string;
  desc: string;
  minPrice: number;
  maxPrice: number;
  crew?: number;
  hours?: number;
  tag?: string;
}

interface Message {
  from: "bot" | "user";
  text: string;
  ts: number;
}

// ─────────────────────────────────────────────
// Step Definitions
// ─────────────────────────────────────────────

function getServiceLabel(rawType: string): string {
  if (rawType.includes("Moving") || rawType.includes("Local Move") || rawType.includes("Loading") || rawType.includes("Unloading") || rawType.includes("Packing Only")) return "Moving";
  if (rawType.includes("Junk")) return "Junk Removal";
  if (rawType.includes("Trash Valet")) return "Trash Valet";
  if (rawType.includes("Window")) return "Window Cleaning";
  if (rawType.includes("Painting")) return "Painting";
  if (rawType.includes("Flooring")) return "Flooring";
  if (rawType.includes("Roofing")) return "Roofing";
  if (rawType.includes("Handyman")) return "Handyman";
  if (rawType.includes("Lawn")) return "Lawn Care";
  if (rawType.includes("Snow")) return "Snow Removal";
  return "Moving";
}

function isMovingService(a: Answers) {
  const s = a.serviceType || "";
  return s.includes("Move") || s.includes("Loading") || s.includes("Unloading") || s.includes("Packing Only");
}

function isJunkService(a: Answers) {
  return (a.serviceType || "").includes("Junk");
}

function isTrashValetService(a: Answers) {
  return (a.serviceType || "").includes("Trash Valet");
}

function isWindowCleaningService(a: Answers) {
  return (a.serviceType || "").includes("Window");
}

function isPriceableService(a: Answers) {
  const svc = getServiceLabel(a.serviceType || "");
  return PRICEABLE_SERVICES.includes(svc);
}

function isQuoteOnlyService(a: Answers) {
  const svc = getServiceLabel(a.serviceType || "");
  return QUOTE_ONLY_SERVICES.includes(svc);
}

function needsDepositCheck(a: Answers) {
  return isQuoteOnlyService(a);
}

const STEPS: Step[] = [
  {
    id: "serviceType",
    question: "What service do you need?",
    subtext: "Pick the one that best describes your situation.",
    type: "choice",
    options: [
      "📦 Moving (local or long-distance)",
      "🗑️ Junk Removal",
      "🗑️ Trash Valet (weekly curbside)",
      "🪟 Window Cleaning",
      "🎨 Painting",
      "🪵 Flooring",
      "🏠 Roofing",
      "🔧 Handyman",
      "❄️ Snow Removal",
      "🌿 Lawn Care",
    ],
  },

  // ── MOVING STEPS ──────────────────────────────────────────────────────────
  {
    id: "fromZip",
    question: "What's the pickup address?",
    subtext: "Start typing — we'll suggest addresses as you go.",
    type: "address",
    placeholder: "123 Main St, Ironwood, MI",
    show: (a) => isMovingService(a),
  },
  {
    id: "toZip",
    question: "What's the delivery address?",
    subtext: "Where are we dropping everything off?",
    type: "address",
    placeholder: "456 Oak Ave, Hurley, WI",
    show: (a) => isMovingService(a) && (a.serviceType || "").includes("Moving"),
  },
  {
    id: "loadType",
    question: "What are we doing?",
    subtext: "Load only = we load the truck at the pickup. Unload only = we unload at the destination. Both = full move.",
    type: "choice",
    options: [
      "🔼 Load only (we load the truck)",
      "🔽 Unload only (we unload at destination)",
      "🔄 Both — load AND unload",
    ],
    show: (a) => isMovingService(a),
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
    show: (a) => isMovingService(a) || isJunkService(a),
  },
  {
    id: "homeSize",
    question: "What's the size of the space or job?",
    subtext: "Pick the closest match.",
    type: "choice",
    options: [
      "1–2 Items (Tiny Job)",
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
    show: (a) => isMovingService(a) || isJunkService(a),
  },
  {
    id: "originFloor",
    question: "Which floor are you on at the PICKUP location?",
    type: "choice",
    options: ["Ground Floor / 1st", "2nd Floor", "3rd Floor", "4th Floor or Higher"],
    show: (a) => isMovingService(a),
  },
  {
    id: "originElevator",
    question: "Is there a working elevator at the pickup location?",
    type: "choice",
    options: ["✅ Yes, there's an elevator", "🪜 No elevator — stairs only"],
    show: (a) =>
      isMovingService(a) &&
      !["Ground Floor / 1st"].includes(a.originFloor || ""),
  },
  {
    id: "destFloor",
    question: "Which floor at the DROP-OFF location?",
    type: "choice",
    options: ["Ground Floor / 1st", "2nd Floor", "3rd Floor", "4th Floor or Higher"],
    show: (a) => isMovingService(a) && (a.serviceType || "").includes("Moving"),
  },
  {
    id: "destElevator",
    question: "Is there a working elevator at the drop-off location?",
    type: "choice",
    options: ["✅ Yes, there's an elevator", "🪜 No elevator — stairs only"],
    show: (a) =>
      isMovingService(a) &&
      (a.serviceType || "").includes("Moving") &&
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
    show: (a) => isMovingService(a),
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
    show: (a) => isMovingService(a),
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
    show: (a) => isMovingService(a),
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
    show: (a) => isMovingService(a) || isJunkService(a),
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
    show: (a) => isMovingService(a),
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
    show: (a) => isMovingService(a) && (a.serviceType || "").includes("Moving"),
  },

  // ── TRASH VALET STEPS ──────────────────────────────────────────────────────
  {
    id: "trashCans",
    question: "How many trash cans do you have?",
    subtext: "This is for weekly trash pickup.",
    type: "choice",
    options: ["1 can", "2 cans", "3 cans", "4+ cans"],
    show: (a) => isTrashValetService(a),
  },
  {
    id: "trashBags",
    question: "Any extra bags beyond your cans?",
    type: "choice",
    options: ["No extra bags", "1–4 extra bags", "5–9 extra bags", "10+ extra bags"],
    show: (a) => isTrashValetService(a),
  },
  {
    id: "recyclingEnabled",
    question: "Do you want bi-weekly recycling pickup?",
    type: "choice",
    options: ["✅ Yes, add recycling", "❌ No, trash only"],
    show: (a) => isTrashValetService(a),
  },
  {
    id: "trashPlanType",
    question: "What plan type works best for you?",
    type: "choice",
    options: ["📅 Monthly (pay each month)", "📆 Yearly (save 1 month — 11 months charged)"],
    show: (a) => isTrashValetService(a),
  },
  {
    id: "depositZip",
    question: "What's your service address?",
    subtext: "We'll use this to confirm service availability.",
    type: "address",
    placeholder: "123 Main St, Ironwood, MI",
    show: (a) => isTrashValetService(a),
  },

  // ── WINDOW CLEANING STEPS ─────────────────────────────────────────────────
  {
    id: "standardWindows",
    question: "How many standard-size windows do you have?",
    subtext: "Standard = typical residential window.",
    type: "text",
    placeholder: "e.g. 10",
    show: (a) => isWindowCleaningService(a),
  },
  {
    id: "largeWindows",
    question: "How many large / picture windows?",
    subtext: "Large = floor-to-ceiling or oversized pane (counts as 2 panes).",
    type: "text",
    placeholder: "e.g. 3",
    show: (a) => isWindowCleaningService(a),
  },
  {
    id: "ladderWindows",
    question: "How many windows require a ladder?",
    subtext: "2nd floor or higher. These are $10/pane.",
    type: "text",
    placeholder: "e.g. 0",
    show: (a) => isWindowCleaningService(a),
  },
  {
    id: "windowInside",
    question: "Do you want inside cleaning too?",
    type: "choice",
    options: ["✅ Yes — inside + outside", "❌ Outside only"],
    show: (a) => isWindowCleaningService(a),
  },

  // ── QUOTE-ONLY SERVICE STEPS ──────────────────────────────────────────────
  {
    id: "jobScope",
    question: "Describe the scope of work:",
    subtext: "Rough size, number of rooms, square footage, or area — whatever you know.",
    type: "text",
    placeholder: "e.g. 2 bedrooms, approx 800 sq ft of hardwood",
    show: (a) => isQuoteOnlyService(a),
  },
  {
    id: "jobLocation",
    question: "What's the job address?",
    subtext: "We use this to determine if a free local estimate applies.",
    type: "address",
    placeholder: "123 Main St, Ironwood, MI",
    show: (a) => isQuoteOnlyService(a),
  },
  {
    id: "moveDate",
    question: "When are you looking to get started?",
    type: "choice",
    options: [
      "🔥 ASAP / This week",
      "📅 Next week",
      "🗓️ 2–3 weeks out",
      "📆 Next month",
      "⏳ 2+ months out",
      "🌀 Flexible / Not sure",
    ],
    show: (a) => isQuoteOnlyService(a),
  },
  {
    id: "depositAcknowledged",
    question: "Estimate deposit acknowledgment",
    type: "deposit_ack",
    show: (a) => {
      if (!isQuoteOnlyService(a)) return false;
      const zip = a.jobLocation || "";
      const svc = getServiceLabel(a.serviceType || "");
      const dep = getDepositInfo(svc, zip);
      return dep.required;
    },
  },

  // ── PACKAGE SELECTION (priceable services) ────────────────────────────────
  {
    id: "selectedPackage",
    question: "Choose your crew package:",
    type: "package_select",
    show: (a) => isPriceableService(a) && !isQuoteOnlyService(a),
  },

  // ── PROMO CODE (moving & junk — after package select, near the end) ───────
  {
    id: "promoCode",
    question: "Got a promo code? Enter it here — or skip.",
    subtext: "JC222 unlocks special pricing on qualifying small jobs. Leave blank to skip.",
    type: "text",
    placeholder: "e.g. JC222",
    optional: true,
    show: (a) => {
      const svc = getServiceLabel(a.serviceType || "");
      return svc === "Moving" || svc === "Junk Removal";
    },
  },

  // ── CONTACT + NOTES (all services) ───────────────────────────────────────
  {
    id: "contact",
    question: "Almost done! What's the best way to reach you?",
    subtext: "Your quote will be reviewed by Darrell personally before anything is sent.",
    type: "contact",
  },
  {
    id: "notes",
    question: "Anything else we should know?",
    subtext: "Narrow hallways, parking restrictions, tight deadlines, etc. Leave blank to skip.",
    type: "notes",
    optional: true,
    placeholder: "e.g. 'Moving out-of-state in 10 days, tight hallways, big sectional needs to be disassembled'",
  },
];

// ─────────────────────────────────────────────
// Moving Quote Engine
// ─────────────────────────────────────────────
function computeMovingQuote(a: Answers): MovingQuote {
  const RATE = 85;
  const round5 = (n: number) => Math.ceil(n / 5) * 5;

  // ── Load type ──────────────────────────────────────────────────────────────
  const loadTypeRaw = a.loadType || "";
  const isBoth = loadTypeRaw.includes("Both");

  // ── Stairs ─────────────────────────────────────────────────────────────────
  const floorNum = (f: string | undefined) =>
    ({ "Ground Floor / 1st": 1, "2nd Floor": 2, "3rd Floor": 3, "4th Floor or Higher": 4 }[f || ""] || 1);
  const oFloor = floorNum(a.originFloor);
  const dFloor = floorNum(a.destFloor);
  const hasOriginStairs = oFloor >= 2 && a.originElevator === "🪜 No elevator — stairs only";
  const hasDestStairs   = dFloor >= 2 && a.destElevator   === "🪜 No elevator — stairs only";
  const hasAnyStairs    = hasOriginStairs || hasDestStairs;
  const highStairFloors = (hasOriginStairs ? oFloor - 1 : 0) + (hasDestStairs ? dFloor - 1 : 0);

  // ── Special items ──────────────────────────────────────────────────────────
  const specials = (a.specialItems || []).filter(s => s !== "None of these");
  const hasGrandPiano   = specials.includes("🎹 Grand Piano");
  const hasUprightPiano = specials.includes("🎹 Upright Piano");
  const hasPoolTable    = specials.includes("🎱 Pool Table");
  const hasHotTub       = specials.includes("♨️ Hot Tub");
  const hasHeavySafe    = specials.includes("🔒 Heavy Safe (300 lbs+)");
  const hasMajorSpecial = hasGrandPiano || hasUprightPiano || hasPoolTable || hasHotTub;

  let specialSurcharge = 0;
  if (hasGrandPiano)   specialSurcharge += 250;
  if (hasUprightPiano) specialSurcharge += 150;
  if (hasPoolTable)    specialSurcharge += 150;
  if (hasHotTub)       specialSurcharge += 200;
  if (hasHeavySafe)    specialSurcharge += 75;

  // ── Furniture & box counts ─────────────────────────────────────────────────
  const furnCount = (a.furniture || []).filter(f => f !== "None of the above").length;
  const boxIdx = ["Under 10 boxes", "10–25 boxes", "25–50 boxes", "50–75 boxes", "75–100 boxes", "100+ boxes"]
    .indexOf(a.boxCount || "Under 10 boxes");

  // ── Size score → base tier ─────────────────────────────────────────────────
  // score: -1 = force tiny, 0-2 = small, 3-5 = medium, 6+ = large
  const sizeScore: Record<string, number> = {
    "1–2 Items (Tiny Job)": -1,
    "Studio / Single Room": 0,
    "1 Bedroom Apartment":  1,
    "2 Bedroom Apartment":  3,
    "3 Bedroom Apartment":  5,
    "4+ Bedroom Apartment": 6,
    "1–2 Bedroom House":    4,
    "3 Bedroom House":      7,
    "4+ Bedroom House":     9,
    "Commercial / Office":  8,
  };
  let score = sizeScore[a.homeSize || ""] ?? 2;

  // Adjust score for complexity
  if (isBoth)             score += 2;   // Load + Unload = more work
  if (hasAnyStairs)       score += 1;
  if (highStairFloors >= 2) score += 1; // 3rd floor or higher, or stairs at both ends
  if (furnCount >= 6)     score += 1;
  if (furnCount >= 12)    score += 1;
  if (boxIdx >= 3)        score += 1;   // 50–75 boxes
  if (boxIdx >= 5)        score += 1;   // 100+ boxes
  if (hasMajorSpecial)    score = Math.max(score, 4); // at least Medium
  if (hasGrandPiano)      score = Math.max(score, 7); // Large
  if (a.packingHelp === "🏠 Full packing service (whole home)") score += 2;
  if (a.parkingDistance === "🏃 Long carry (100 ft+)") score += 1;

  // ── Determine tier ─────────────────────────────────────────────────────────
  let tier: "tiny" | "small" | "medium" | "large";
  if (score === -1 && !isBoth && !hasMajorSpecial && !hasHeavySafe) {
    tier = "tiny";
  } else if (score <= 2) {
    tier = "small";
  } else if (score <= 5) {
    tier = "medium";
  } else {
    tier = "large";
  }

  // Special upgrade rules
  // Heavy safe + stairs → minimum Small with 3 movers
  if (tier === "tiny" && hasHeavySafe && hasAnyStairs) tier = "small";
  // Load+Unload always minimum Medium
  if (isBoth && tier === "small") tier = "medium";

  // ── Crew & hours from tier ─────────────────────────────────────────────────
  let crew: number;
  let minHrs: number;
  let maxHrs: number;

  if (tier === "tiny") {
    crew   = 1;
    minHrs = 0.5;
    maxHrs = 1;
  } else if (tier === "small") {
    crew   = (hasHeavySafe || hasMajorSpecial) && hasAnyStairs ? 3 : 2;
    minHrs = 2;
    maxHrs = isBoth ? 3 : 2;
  } else if (tier === "medium") {
    // Default 2×4; with stairs or heavy items 3×2.5
    if (hasAnyStairs || hasMajorSpecial || hasHeavySafe || highStairFloors >= 2) {
      crew   = 3;
      minHrs = 2.5;
      maxHrs = 3.5;
    } else {
      crew   = 2;
      minHrs = 4;
      maxHrs = 4;
    }
  } else { // large
    if (hasGrandPiano || score >= 9) {
      crew   = 4;
      minHrs = 4;
      maxHrs = 5;
    } else {
      crew   = 3;
      minHrs = 5;
      maxHrs = 7;
    }
  }

  // ── Fine-tune hours from context ───────────────────────────────────────────
  if (hasOriginStairs && tier !== "tiny") maxHrs += (oFloor - 1) * 0.3;
  if (hasDestStairs   && tier !== "tiny") maxHrs += (dFloor - 1) * 0.3;
  if (a.parkingDistance === "🚶 Short walk (30–100 ft)") maxHrs += 0.25;
  if (a.parkingDistance === "🏃 Long carry (100 ft+)")   maxHrs += 0.75;
  if (a.packingHelp === "📦 Pack a few fragile items")       maxHrs += 0.5;
  if (a.packingHelp === "🏠 Full packing service (whole home)") { maxHrs += 2; crew = Math.max(crew, 3); }
  if (furnCount >= 8)  maxHrs += 0.5;
  if (boxIdx >= 4)     maxHrs += 0.5;

  // ── Junk Removal adjustments ──────────────────────────────────────────────
  if (a.serviceType?.includes("Junk")) {
    crew   = Math.min(crew, 2);
    minHrs = Math.max(1, minHrs * 0.5);
    maxHrs = Math.max(2, maxHrs * 0.6);
  }

  // ── Enforce load+unload minimum 3 hrs ─────────────────────────────────────
  if (isBoth && !a.serviceType?.includes("Junk")) {
    minHrs = Math.max(minHrs, 3);
    maxHrs = Math.max(maxHrs, 3);
  }

  // Round to nearest 0.5
  minHrs = Math.round(minHrs * 2) / 2;
  maxHrs = Math.max(minHrs, Math.round(maxHrs * 2) / 2);

  // ── Pricing ───────────────────────────────────────────────────────────────
  const rawMin = round5(crew * minHrs * RATE) + specialSurcharge;
  const rawMax = round5(crew * maxHrs * RATE) + specialSurcharge;

  // JC222 promo: lowers $300 Small job floor to $222
  const SMALL_JOB_FLOOR = 300;
  const promoCodeRaw   = (a.promoCode || "").toUpperCase().trim();
  const isJC222        = promoCodeRaw === "JC222";
  const effectiveFloor = isJC222 ? 222 : SMALL_JOB_FLOOR;
  const isSmallJob     = rawMax <= SMALL_JOB_FLOOR;

  const minPrice = isSmallJob ? Math.max(rawMin, effectiveFloor) : rawMin;
  const maxPrice = isSmallJob ? Math.max(rawMax, effectiveFloor) : rawMax;
  const midPrice = (minPrice + maxPrice) / 2;
  const tokensEstimate = Math.round(midPrice * 50);

  return {
    type: "moving",
    tier,
    crew,
    minHrs,
    maxHrs,
    minPrice,
    maxPrice,
    tokensEstimate,
    specialSurcharge,
    promoApplied: isSmallJob && isJC222,
    promoCode:    isJC222 ? "JC222" : undefined,
    rawMinPrice:  isSmallJob ? rawMin : undefined,
  };
}

// ─────────────────────────────────────────────
// Compute Quote for Any Service
// ─────────────────────────────────────────────
function computeQuoteForAnswers(a: Answers): QuoteResult | null {
  const svc = getServiceLabel(a.serviceType || "");

  if (QUOTE_ONLY_SERVICES.includes(svc)) {
    const ranges: Record<string, [number, number]> = {
      "Painting":   [500, 5000],
      "Flooring":   [800, 8000],
      "Roofing":    [2000, 15000],
      "Handyman":   [100, 1200],
      "Lawn Care":  [50, 400],
    };
    const [min, max] = ranges[svc] || [500, 5000];
    return { type: "quote_only", service: svc, minPrice: min, maxPrice: max };
  }

  if (svc === "Trash Valet") {
    const canMap: Record<string, number> = { "1 can": 1, "2 cans": 2, "3 cans": 3, "4+ cans": 4 };
    const bagMap: Record<string, number> = { "No extra bags": 0, "1–4 extra bags": 2, "5–9 extra bags": 7, "10+ extra bags": 12 };
    const cans = canMap[a.trashCans || "1 can"] || 1;
    const bags = bagMap[a.trashBags || "No extra bags"] || 0;
    const recycling = (a.recyclingEnabled || "").includes("Yes");
    const planType = (a.trashPlanType || "").includes("Yearly") ? "yearly" : "monthly";

    const quote = calculateTrashValetQuote({ cans, bagCount: bags, recyclingEnabled: recycling, planType });
    return {
      type: "trash_valet",
      finalMonthlyPrice: quote.finalMonthlyPrice,
      minPrice: quote.finalMonthlyPrice,
      maxPrice: quote.finalMonthlyPrice + 10,
    };
  }

  if (svc === "Window Cleaning") {
    const std = parseInt(a.standardWindows || "0") || 0;
    const lg = parseInt(a.largeWindows || "0") || 0;
    const lad = parseInt(a.ladderWindows || "0") || 0;
    const inside = (a.windowInside || "").includes("inside + outside");
    const quote = calculateWindowCleaningQuote({
      standardWindows: std,
      largeWindows: lg,
      ladderWindows: lad,
      includeInside: inside,
      includeOutside: true,
      seasonMode: "normal",
    });
    return {
      type: "window_cleaning",
      paneCount: quote.paneCount,
      minPrice: quote.total,
      maxPrice: quote.total,
      total: quote.total,
    };
  }

  // Moving or Junk
  return computeMovingQuote(a);
}

// ─────────────────────────────────────────────
// Build Crew Packages for priceable services
// ─────────────────────────────────────────────
function buildCrewPackages(a: Answers, q: QuoteResult | null): CrewPackage[] {
  if (!q) return [];

  if (q.type === "moving") {
    const mq = q as MovingQuote;
    const RATE = 85;
    const sur  = mq.specialSurcharge;
    const r5   = (n: number) => Math.ceil(n / 5) * 5;
    const price = (crew: number, hrs: number) => r5(crew * hrs * RATE) + sur;

    if (mq.tier === "tiny") {
      return [
        {
          id: "pkg_tiny",
          label: "Tiny Move · 1 Mover",
          desc: "1–2 light items (≤200 lbs) · 30–60 min · single task",
          minPrice: price(1, 0.5),
          maxPrice: price(1, 1),
          crew: 1,
          hours: 1,
          tag: "Quick Job",
        },
        {
          id: "pkg_small_upgrade",
          label: "Small Move · 2 Movers × 2 hrs",
          desc: "More flexibility — ideal if your needs grow day-of",
          minPrice: price(2, 2),
          maxPrice: price(2, 2),
          crew: 2,
          hours: 2,
        },
      ];
    }

    if (mq.tier === "small") {
      const pkgs: CrewPackage[] = [
        {
          id: "pkg_small",
          label: "2 Movers × 2 hrs",
          desc: "Studio / single room · load only or unload only · 2-hr minimum",
          minPrice: price(2, 2),
          maxPrice: price(2, 2),
          crew: 2,
          hours: 2,
          tag: "Recommended",
        },
        {
          id: "pkg_small_3hr",
          label: "2 Movers × 3 hrs",
          desc: "Extra time buffer — best if you have stairs or more items",
          minPrice: price(2, 3),
          maxPrice: price(2, 3),
          crew: 2,
          hours: 3,
        },
      ];
      // If heavy item + stairs, lead with 3-mover option
      const specials = (a.specialItems || []).filter(s => s !== "None of these");
      const hasHeavy = specials.includes("🔒 Heavy Safe (300 lbs+)") ||
                       specials.includes("🎹 Upright Piano") ||
                       specials.includes("🎱 Pool Table") ||
                       specials.includes("♨️ Hot Tub");
      const hasStairs = (a.originFloor !== "Ground Floor / 1st" && a.originElevator === "🪜 No elevator — stairs only") ||
                        (a.destFloor   !== "Ground Floor / 1st" && a.destElevator   === "🪜 No elevator — stairs only");
      if (hasHeavy && hasStairs) {
        pkgs.unshift({
          id: "pkg_small_3crew",
          label: "3 Movers × 2 hrs (Heavy + Stairs)",
          desc: "Required for heavy items on stairs — safest option",
          minPrice: price(3, 2),
          maxPrice: price(3, 2),
          crew: 3,
          hours: 2,
          tag: "Safety Pick",
        });
      }
      return pkgs;
    }

    if (mq.tier === "medium") {
      return [
        {
          id: "pkg_med_a",
          label: "2 Movers × 4 hrs",
          desc: "Steady pace · best for ground-floor or elevator access",
          minPrice: price(2, 4),
          maxPrice: price(2, 4),
          crew: 2,
          hours: 4,
        },
        {
          id: "pkg_med_b",
          label: "3 Movers × 2.5 hrs",
          desc: "Faster crew · recommended with stairs or tight schedule",
          minPrice: price(3, 2.5),
          maxPrice: price(3, 3),
          crew: 3,
          hours: 2.5,
          tag: "Recommended",
        },
      ];
    }

    // large
    return [
      {
        id: "pkg_lg_c",
        label: "2 Movers × 7 hrs",
        desc: "Budget option · plenty of time · best without stairs",
        minPrice: price(2, 7),
        maxPrice: price(2, 7),
        crew: 2,
        hours: 7,
      },
      {
        id: "pkg_lg_b",
        label: "3 Movers × 5 hrs",
        desc: "Balanced crew · great for 3BR house or 2+ flights of stairs",
        minPrice: price(3, 5),
        maxPrice: price(3, 5),
        crew: 3,
        hours: 5,
        tag: "Recommended",
      },
      {
        id: "pkg_lg_a",
        label: "4 Movers × 4 hrs",
        desc: "Power crew · fastest option · best for 4BR+ or pianos",
        minPrice: price(4, 4),
        maxPrice: price(4, 4),
        crew: 4,
        hours: 4,
      },
    ];
  }

  if (q.type === "trash_valet") {
    const tq = q as TrashValetQuoteResult;
    return [
      {
        id: "pkg_tv_monthly",
        label: "Monthly Plan",
        desc: "Pay month-to-month — cancel anytime.",
        minPrice: tq.finalMonthlyPrice,
        maxPrice: tq.finalMonthlyPrice,
        tag: "Flexible",
      },
      {
        id: "pkg_tv_yearly",
        label: "Yearly Plan",
        desc: "11 months charged, 12 months of service.",
        minPrice: Math.round(tq.finalMonthlyPrice * 11 / 12),
        maxPrice: Math.round(tq.finalMonthlyPrice * 11 / 12),
        tag: "Best Value",
      },
    ];
  }

  if (q.type === "window_cleaning") {
    const wq = q as WindowQuoteResult;
    const insideExtra = Math.round(wq.total * 0.4);
    return [
      {
        id: "pkg_wc_outside",
        label: "Outside Only",
        desc: "Streak-free exterior cleaning · $5/pane",
        minPrice: Math.round(wq.total * 0.6),
        maxPrice: Math.round(wq.total * 0.65),
        tag: "Popular",
      },
      {
        id: "pkg_wc_both",
        label: "Inside + Outside",
        desc: "Full deep clean both sides · $5/pane/side",
        minPrice: wq.total,
        maxPrice: wq.total + insideExtra,
        tag: "Best Value",
      },
    ];
  }

  return [];
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
  if (stepId === "depositAcknowledged") return "Deposit terms acknowledged ✓";
  if (stepId === "selectedPackage") return `Package selected: ${val}`;
  if (stepId === "promoCode") {
    const code = (val as string).toUpperCase().trim();
    return code ? `Promo code: ${code}` : "No promo code";
  }
  return val;
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
const SERVICE_SLUG_MAP: Record<string, string> = {
  moving: "📦 Moving (local or long-distance)",
  junk: "🗑️ Junk Removal",
  trash_valet: "🗑️ Trash Valet (weekly curbside)",
  window_cleaning: "🪟 Window Cleaning",
  painting: "🎨 Painting",
  flooring: "🪵 Flooring",
  roofing: "🏠 Roofing",
  handyman: "🔧 Handyman",
  "lawn-care": "🌿 Lawn Care",
  lawn: "🌿 Lawn Care",
  snow: "❄️ Snow Removal",
  snow_removal: "❄️ Snow Removal",
};

export function BookingChatbot({ onClose, embedded = false, showCloseButton, className, initialService }: { onClose?: () => void; embedded?: boolean; showCloseButton?: boolean; className?: string; initialService?: string }) {
  const showClose = showCloseButton ?? !embedded;
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [answers, setAnswers] = useState<Answers>({});
  const [messages, setMessages] = useState<Message[]>([
    {
      from: "bot",
      text: "👋 Hi — I'm JC! I'll help you get a quote for any of our services in about 60 seconds. No pressure, no spam — real human review before anything is sent.",
      ts: Date.now(),
    },
  ]);
  const [stepIdx, setStepIdx] = useState(0);
  const [textInput, setTextInput] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [contactName, setContactName] = useState(() => user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : "");
  const [contactPhone, setContactPhone] = useState(() => user?.phoneNumber || "");
  const [contactEmail, setContactEmail] = useState(() => user?.email || "");
  const [submitted, setSubmitted] = useState(false);
  const [quoteVisible, setQuoteVisible] = useState(false);
  const [pendingQuote, setPendingQuote] = useState<QuoteResult | null>(null);
  const [crewPackages, setCrewPackages] = useState<CrewPackage[]>([]);
  const [selectedPackageObj, setSelectedPackageObj] = useState<CrewPackage | null>(null);
  const [depositInfo, setDepositInfo] = useState<{ required: boolean; amount: number; termsHtml: string } | null>(null);
  const [depositChecked, setDepositChecked] = useState(false);

  const visibleSteps = useMemo(
    () => STEPS.filter(s => !s.show || s.show(answers)),
    [answers]
  );

  const currentStep = visibleSteps[stepIdx];

  useEffect(() => {
    if (user) {
      setContactName(prev => prev || [user.firstName, user.lastName].filter(Boolean).join(" "));
      setContactPhone(prev => prev || (user.phoneNumber || ""));
      setContactEmail(prev => prev || (user.email || ""));
    }
  }, [user]);

  useEffect(() => {
    if (!initialService) return;
    const mapped = SERVICE_SLUG_MAP[initialService.toLowerCase()];
    if (!mapped) return;
    const newAnswers: Answers = { serviceType: mapped };
    setAnswers(newAnswers);
    const nextSteps = STEPS.filter(s => !s.show || s.show(newAnswers));
    const nextStep = nextSteps[1];
    setMessages(prev => [
      ...prev,
      { from: "bot", text: `You selected: ${mapped}`, ts: Date.now() },
      ...(nextStep ? [{ from: "bot" as const, text: nextStep.question + (nextStep.subtext ? `\n\n_${nextStep.subtext}_` : ""), ts: Date.now() + 1 }] : []),
    ]);
    setStepIdx(1);
  }, [initialService]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, quoteVisible]);

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
      (newAnswers as any)[stepId] = value;
    } else {
      (newAnswers as any)[stepId] = value;
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

      // When we reach the deposit step, compute deposit info
      if (nextStep.id === "depositAcknowledged") {
        const svc = getServiceLabel(newAnswers.serviceType || "");
        const zip = newAnswers.jobLocation || newAnswers.depositZip || "";
        const dep = getDepositInfo(svc, zip);
        setDepositInfo(dep);
        setDepositChecked(false);
      }

      // When we reach the package select step, compute packages
      if (nextStep.id === "selectedPackage") {
        const q = computeQuoteForAnswers(newAnswers);
        setPendingQuote(q);
        const pkgs = buildCrewPackages(newAnswers, q);
        setCrewPackages(pkgs);
      }

      setTimeout(() => {
        if (nextStep.id !== "depositAcknowledged" && nextStep.id !== "selectedPackage") {
          botSay(nextStep.question + (nextStep.subtext ? `\n\n_${nextStep.subtext}_` : ""));
        }
        setStepIdx(nextIdx);
        setTextInput("");
        setAddressInput("");
        setMultiSel([]);
      }, 500);
    } else {
      // All done — compute final quote & show
      setTimeout(() => {
        const q = computeQuoteForAnswers(newAnswers);
        setPendingQuote(q);

        const svc = getServiceLabel(newAnswers.serviceType || "");
        const isQuoteOnly = QUOTE_ONLY_SERVICES.includes(svc);

        if (isQuoteOnly) {
          botSay(
            `Got it! I've put together a placeholder estimate range for your ${svc} job. This is a starting point — Darrell will reach out to schedule a free on-site estimate (or a virtual one) to give you an exact number. Tap **Request My Quote** below to submit. 👇`
          );
        } else {
          botSay(
            `Perfect! Based on everything you've told me, here's your estimated quote. Hit **Submit for Review** and Darrell will finalize it personally. 👇`
          );
        }

        setTimeout(() => setQuoteVisible(true), 600);
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

  function handleAddressSubmit() {
    if (!currentStep) return;
    const val = addressInput.trim();
    if (!val) return;
    advanceStep(currentStep.id, val);
    setAddressInput("");
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

  function handleDepositAck() {
    if (!depositChecked) return;
    advanceStep("depositAcknowledged", "acknowledged");
  }

  function handlePackageSelect(pkg: CrewPackage) {
    setSelectedPackageObj(pkg);
  }

  function handlePackageContinue() {
    if (!selectedPackageObj) return;
    advanceStep("selectedPackage", selectedPackageObj.id);
  }

  const [depositInvoiceSent, setDepositInvoiceSent] = useState(false);
  const [depositInvoiceUrl, setDepositInvoiceUrl] = useState<string | null>(null);

  // Build the submit payload
  const submitMutation = useMutation({
    mutationFn: async (withDeposit: boolean) => {
      if (!pendingQuote) throw new Error("No quote");
      const svc = getServiceLabel(answers.serviceType || "");
      const isQuoteOnly = QUOTE_ONLY_SERVICES.includes(svc);
      const dep = depositInfo;
      const zip = answers.jobLocation || answers.depositZip || answers.fromZip || "";

      const result = await apiRequest("POST", "/api/chatbot-quote", {
        answers,
        quote: pendingQuote,
        selectedPackage: selectedPackageObj || null,
        depositRequired: dep?.required || false,
        depositAmount: dep?.amount || 0,
        serviceLabel: svc,
        isQuoteOnly,
        customerZip: zip,
        depositPaid: withDeposit,
      });
      return result as { leadId: string; message: string; depositInvoiceSent?: boolean; depositInvoiceUrl?: string };
    },
    onSuccess: (data, withDeposit) => {
      setDepositPaid(withDeposit);
      setDepositInvoiceSent(data?.depositInvoiceSent ?? false);
      setDepositInvoiceUrl(data?.depositInvoiceUrl ?? null);
      setSubmitted(true);
      const svc = getServiceLabel(answers.serviceType || "");
      const isQuoteOnly = QUOTE_ONLY_SERVICES.includes(svc);
      if (isQuoteOnly) {
        botSay("✅ Your quote request has been submitted! Darrell will reach out to schedule your estimate. Typically within 2–4 hours during business hours.");
      } else {
        botSay("✅ Your quote request has been submitted! Darrell will review it and send you a finalized quote. Typically within 2–4 hours during business hours.");
      }
    },
    onError: (err: any) => {
      toast({ title: "Submission failed", description: err.message || "Please try again.", variant: "destructive" });
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
      text: "👋 Hi — I'm JC! I'll help you get a quote for any of our services in about 60 seconds. No pressure, no spam — real human review before anything is sent.",
      ts: Date.now(),
    }]);
    setStepIdx(0);
    setTextInput("");
    setAddressInput("");
    setMultiSel([]);
    setContactName(user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : "");
    setContactPhone(user?.phoneNumber || "");
    setContactEmail(user?.email || "");
    setSubmitted(false);
    setQuoteVisible(false);
    setPendingQuote(null);
    setCrewPackages([]);
    setSelectedPackageObj(null);
    setDepositInfo(null);
    setDepositChecked(false);
  }

  const isDone = stepIdx >= visibleSteps.length;
  const progress = isDone ? 100 : Math.round((stepIdx / visibleSteps.length) * 100);

  const svc = getServiceLabel(answers.serviceType || "");
  const isQuoteOnly = QUOTE_ONLY_SERVICES.includes(svc);

  const phase = submitted ? "submitted" : (quoteVisible && pendingQuote ? "deposit" : null);

  return (
    <div className={`flex flex-col h-full min-h-[500px]${className ? " " + className : ""}`}>
      {/* Progress bar */}
      <div className="px-1 pb-2 shrink-0">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span>{isDone ? "✅ All done!" : "Takes about 60 seconds"}</span>
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

        {/* Quote Card */}
        {quoteVisible && pendingQuote && (
          <div className="mx-1 mt-2 rounded-2xl border border-teal-500/30 bg-gradient-to-br from-teal-900/30 to-slate-900/60 overflow-hidden">
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-teal-400" />
                <span className="text-sm font-bold text-teal-300 uppercase tracking-wide">
                  {isQuoteOnly ? "Placeholder Estimate" : "Your Estimated Quote"}
                </span>
              </div>

              {isQuoteOnly && (
                <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-500/30 rounded-xl px-3 py-2 mb-3">
                  <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-200/90">
                    This is a <strong>placeholder range</strong> — a formal quote requires an in-person estimate. Darrell will contact you to schedule it.
                  </p>
                </div>
              )}

              {pendingQuote.type === "moving" && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-400 mb-1">Crew Size</p>
                    <p className="text-xl font-bold text-white">{(pendingQuote as MovingQuote).crew}</p>
                    <p className="text-[10px] text-slate-400">movers</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-400 mb-1">Est. Hours</p>
                    <p className="text-xl font-bold text-white">{(pendingQuote as MovingQuote).minHrs}–{(pendingQuote as MovingQuote).maxHrs}</p>
                    <p className="text-[10px] text-slate-400">hours</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-400 mb-1">JCMOVES Earned</p>
                    <p className="text-lg font-bold text-yellow-400">{((pendingQuote as MovingQuote).tokensEstimate / 1000).toFixed(0)}K</p>
                    <p className="text-[10px] text-slate-400">tokens</p>
                  </div>
                </div>
              )}

              {pendingQuote.type === "trash_valet" && (
                <div className="bg-slate-800/60 rounded-xl p-3 text-center mb-3">
                  <p className="text-xs text-slate-400 mb-1">Monthly Rate</p>
                  <p className="text-2xl font-bold text-teal-300">${(pendingQuote as TrashValetQuoteResult).finalMonthlyPrice}/mo</p>
                  <p className="text-[11px] text-slate-500 mt-1">Based on your can &amp; bag count</p>
                </div>
              )}

              {pendingQuote.type === "window_cleaning" && (
                <div className="bg-slate-800/60 rounded-xl p-3 text-center mb-3">
                  <p className="text-xs text-slate-400 mb-1">{(pendingQuote as WindowQuoteResult).paneCount} panes · $5/pane</p>
                  <p className="text-2xl font-bold text-teal-300">${(pendingQuote as WindowQuoteResult).total}</p>
                  <p className="text-[11px] text-slate-500 mt-1">Streak-free guarantee</p>
                </div>
              )}

              <div className="bg-slate-900/60 rounded-xl p-3 text-center mb-3">
                  <p className="text-xs text-slate-400 mb-1">
                    {pendingQuote.type === "trash_valet" ? "Price Range" : "Estimated Price Range"}
                  </p>
                  <p className="text-2xl font-bold text-white">
                    {pendingQuote.minPrice === pendingQuote.maxPrice
                      ? `$${pendingQuote.minPrice.toLocaleString()}`
                      : `$${pendingQuote.minPrice.toLocaleString()} – $${pendingQuote.maxPrice.toLocaleString()}`}
                  </p>
                  {pendingQuote.type === "moving" && (pendingQuote as MovingQuote).specialSurcharge > 0 && (
                    <p className="text-xs text-orange-400 mt-1">Includes ${(pendingQuote as MovingQuote).specialSurcharge} specialty item surcharge</p>
                  )}
                  {pendingQuote.type === "moving" && (pendingQuote as MovingQuote).promoApplied && (
                    <div className="mt-2 inline-flex items-center gap-1 bg-green-900/50 border border-green-500/40 rounded-full px-3 py-1">
                      <span className="text-[11px] font-bold text-green-400">🏷️ JC222 Applied</span>
                      <span className="text-[10px] text-green-300/80">— $300 floor → $222</span>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500 mt-1">Final price confirmed by Darrell after review</p>
                </div>
              </div>

            {/* Package cards */}
            <div>
              <p className="text-xs font-semibold text-slate-300 mb-2 px-1">Select a package:</p>
              <div className="grid grid-cols-1 gap-2">
                {crewPackages.map((pkg) => {
                  const isSelected = selectedPackageObj?.id === pkg.id;
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
                        {pkg.minPrice !== pkg.maxPrice ? (
                          <p className="text-sm font-bold text-teal-300">${pkg.minPrice}–${pkg.maxPrice}</p>
                        ) : (
                          <p className="text-sm font-bold text-teal-300">${pkg.minPrice.toLocaleString()}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              onClick={handlePackageContinue}
              disabled={!selectedPackageObj}
              className="w-full bg-gradient-to-r from-teal-600 to-blue-600 hover:from-teal-500 hover:to-blue-500 text-white font-bold py-3 rounded-xl text-sm"
            >
              Continue with {selectedPackageObj ? `"${selectedPackageObj.label}"` : "Selected Package"} <ArrowRight className="h-4 w-4 ml-2" />
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

                {selectedPackageObj && (
                  <div className="flex items-center justify-between bg-slate-800/60 rounded-xl px-3 py-2.5">
                    <span className="text-sm text-slate-300">Selected Package</span>
                    <span className="text-sm font-semibold text-teal-300">{selectedPackageObj.label}</span>
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
            </div>
          </div>
        )}

      </div>

      {/* Input area */}
      {!isDone && currentStep && (
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

          {/* ADDRESS autocomplete */}
          {currentStep.type === "address" && (
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <PlacesAutocomplete
                  value={addressInput}
                  onChange={setAddressInput}
                  onPlaceSelect={(place) => {
                    setAddressInput(place.fullAddress);
                  }}
                  placeholder={currentStep.placeholder || "Start typing an address…"}
                  onKeyDown={(e) => e.key === "Enter" && handleAddressSubmit()}
                  autoFocus
                />
              </div>
              <Button
                onClick={handleAddressSubmit}
                size="icon"
                disabled={!addressInput.trim()}
                className="bg-teal-600 hover:bg-teal-500 shrink-0 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}

          {currentStep.type === "text" && (
            <div className="flex gap-2">
              <Input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
                placeholder={currentStep.placeholder || "Type your answer…"}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                autoFocus
                type={currentStep.id.includes("windows") || currentStep.id === "trashCans" ? "number" : "text"}
                min="0"
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

          {/* DEPOSIT ACKNOWLEDGMENT */}
          {currentStep.type === "deposit_ack" && depositInfo && (
            <div className="space-y-3">
              <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-orange-400" />
                  <p className="text-sm font-bold text-orange-300">Estimate Deposit Required</p>
                </div>
                <p className="text-sm text-orange-100/80 mb-3">
                  A <strong className="text-white">${depositInfo.amount} non-refundable deposit</strong> is required to schedule your in-person estimate.
                </p>
                <p className="text-xs text-orange-300/70 mb-3">{depositInfo.termsHtml}</p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={depositChecked}
                    onChange={(e) => setDepositChecked(e.target.checked)}
                    className="mt-0.5 shrink-0 accent-orange-500"
                  />
                  <span className="text-xs text-slate-300">
                    I understand and agree to the ${depositInfo.amount} non-refundable estimate deposit. This amount will be credited toward my project upon booking.
                  </span>
                </label>
              </div>
              <Button
                onClick={handleDepositAck}
                disabled={!depositChecked}
                className="w-full bg-orange-600 hover:bg-orange-500 text-white"
                size="sm"
              >
                Acknowledge & Continue <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}

          {/* PACKAGE SELECT */}
          {currentStep.type === "package_select" && crewPackages.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-200 mb-1">Choose your crew package:</p>
              {crewPackages.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => handlePackageSelect(pkg)}
                  className="w-full text-left p-3 rounded-xl border border-slate-700/60 bg-slate-800/60 hover:border-teal-500/60 hover:bg-teal-900/20 transition-all"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-white">{pkg.label}</span>
                    <div className="flex items-center gap-2">
                      {pkg.tag && <Badge className="text-[10px] bg-teal-700/60 text-teal-200 border-0">{pkg.tag}</Badge>}
                      <span className="text-sm font-bold text-teal-300">
                        {pkg.minPrice === pkg.maxPrice
                          ? `$${pkg.minPrice}`
                          : `$${pkg.minPrice}–$${pkg.maxPrice}`}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">{pkg.desc}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
