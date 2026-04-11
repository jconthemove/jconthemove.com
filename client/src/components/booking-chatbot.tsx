import { useState, useRef, useEffect, useMemo } from "react";
import BookingConfirmedTiles from "@/components/BookingConfirmedTiles";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Send, CheckCircle2, ArrowRight, Sparkles, RotateCcw, ChevronRight, AlertCircle, Users, DollarSign, Camera, X, CreditCard, Clock } from "lucide-react";
import { calculateWindowCleaningQuote } from "@shared/windowCleaningPricing";
import { calculateTrashValetQuote, TRASH_VALET_TRAVEL_THRESHOLD_MILES, TRASH_VALET_OUT_OF_AREA_MINIMUM } from "@shared/trashValetPricing";
import { PlacesAutocomplete } from "@/components/places-autocomplete";

// ─────────────────────────────────────────────
// Service categories
// ─────────────────────────────────────────────
const PRICEABLE_SERVICES = ["Moving", "Junk Removal", "Trash Valet", "Window Cleaning"];
const QUOTE_ONLY_SERVICES = ["Painting", "Flooring", "Roofing", "Handyman", "Lawn Care", "Snow Removal", "Move-In/Out Cleaning", "Light Demolition"];
const IRONWOOD_ZIP = "49938";
const TRAVEL_CHARGE_PER_TIER = 50;  // $50 per 25-mile band from Ironwood
const TRAVEL_TIER_MILES      = 25;  // miles per tier

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
type StepType = "choice" | "multiselect" | "text" | "address" | "contact" | "notes" | "deposit_ack" | "package_select" | "photo_upload";

interface Step {
  id: string;
  question: string;
  subtext?: string;
  type: StepType;
  options?: string[];
  show?: (a: Answers) => boolean;
  placeholder?: string;
  optional?: boolean;
  employeeOnly?: boolean;
}

export interface Answers {
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
  // Junk Removal fields
  junkLocation?: string;
  // Window Cleaning fields
  windowLocation?: string;
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
  // Snow Removal fields
  snowDrivewayType?: string;
  snowAddons?: string[];
  // Move-In/Out Cleaning fields
  cleanHomeSize?: string;
  cleanType?: string;
  cleanAddons?: string[];
  // Light Demolition fields
  demoCrewSize?: string;
  demoDuration?: string;
  demoHazards?: string[];
  demoWasteRemoval?: string;
  demoScope?: string[];
  // Handyman fields
  handymanScale?: string;
  handymanCategory?: string;
  // Flooring fields
  flooringOldRemoval?: string;
  flooringCurrentType?: string;
  flooringNewProduct?: string;
  flooringMaterials?: string;
  flooringRoomsSqft?: string;
  flooringHaulAway?: string;
  flooringTrim?: string;
  // Painting fields
  paintingIntExt?: string;
  paintingType?: string;
  paintingRoomCount?: string;
  paintingRoomSize?: string;
  paintingCeilings?: string;
  paintingAddons?: string[];
  paintingPrep?: string;
  paintingMaterials?: string;
  paintingPrimer?: string;
  paintingSurfaceCondition?: string;
  paintingSpecialtyAreas?: string;
  // Roofing fields
  roofingCurrentType?: string;
  roofingStories?: string;
  roofingPitch?: string;
  roofingTearOff?: string;
  roofingWasteRemoval?: string;
  roofingMaterials?: string;
  // Employee photo upload
  employeePhotos?: string;
}

export interface MovingQuote {
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
  travelCharge?: number;
  jcmovesApplied?: boolean;
  jcmovesDiscount?: number;
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

interface JunkQuote {
  type: "junk";
  tier: "tiny" | "small" | "medium" | "large";
  crew: number;
  minHrs: number;
  maxHrs: number;
  minPrice: number;
  maxPrice: number;
  tokensEstimate: number;
  specialSurcharge: number;
  travelCharge?: number;
  jcmovesApplied?: boolean;
  jcmovesDiscount?: number;
}

interface QuoteOnlyResult {
  type: "quote_only";
  service: string;
  minPrice: number;
  maxPrice: number;
}

type QuoteResult = MovingQuote | JunkQuote | TrashValetQuoteResult | WindowQuoteResult | QuoteOnlyResult;

export interface CrewPackage {
  id: string;
  label: string;
  desc: string;
  minPrice: number;
  maxPrice: number;
  crew?: number;
  hours?: number;
  tag?: string;
  originalPrice?: number;
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
  if (rawType.includes("Cleaning") || rawType.includes("Move-In")) return "Move-In/Out Cleaning";
  if (rawType.includes("Demo") || rawType.includes("Demolition")) return "Light Demolition";
  return "Moving";
}

function isMovingService(a: Answers) {
  const s = a.serviceType || "";
  return s.includes("Moving") || s.includes("Move") || s.includes("Loading") || s.includes("Unloading") || s.includes("Packing Only");
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

function isSnowService(a: Answers) {
  return getServiceLabel(a.serviceType || "") === "Snow Removal";
}

function isCleaningService(a: Answers) {
  return getServiceLabel(a.serviceType || "") === "Move-In/Out Cleaning";
}

function isDemoService(a: Answers) {
  return getServiceLabel(a.serviceType || "") === "Light Demolition";
}

function isHandymanService(a: Answers) {
  return getServiceLabel(a.serviceType || "") === "Handyman";
}

function isFlooringService(a: Answers) {
  return getServiceLabel(a.serviceType || "") === "Flooring";
}

function isPaintingService(a: Answers) {
  return getServiceLabel(a.serviceType || "") === "Painting";
}

function isRoofingService(a: Answers) {
  return getServiceLabel(a.serviceType || "") === "Roofing";
}

function isLawnService(a: Answers) {
  return getServiceLabel(a.serviceType || "") === "Lawn Care";
}

function hasStructuredSteps(a: Answers) {
  return isSnowService(a) || isCleaningService(a) || isDemoService(a) ||
    isHandymanService(a) || isFlooringService(a) || isPaintingService(a) || isRoofingService(a);
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
      "✨ Move-In/Out Cleaning",
      "⚒️ Light Demolition",
    ],
  },

  // ── MOVING STEPS ──────────────────────────────────────────────────────────
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
    id: "fromZip",
    question: "What's the pickup address?",
    subtext: "Start typing — we'll suggest addresses as you go.",
    type: "address",
    placeholder: "123 Main St, Ironwood, MI",
    show: (a) => isMovingService(a) && !(a.loadType || "").includes("Unload only"),
  },
  {
    id: "toZip",
    question: "What's the delivery address?",
    subtext: "Where are we dropping everything off?",
    type: "address",
    placeholder: "456 Oak Ave, Hurley, WI",
    show: (a) => isMovingService(a) && !(a.loadType || "").includes("Load only"),
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
    show: (a) => isMovingService(a) && !(a.loadType || "").includes("Unload only"),
  },
  {
    id: "originElevator",
    question: "Is there a working elevator at the pickup location?",
    type: "choice",
    options: ["✅ Yes, there's an elevator", "🪜 No elevator — stairs only"],
    show: (a) =>
      isMovingService(a) &&
      !(a.loadType || "").includes("Unload only") &&
      !["Ground Floor / 1st"].includes(a.originFloor || ""),
  },
  {
    id: "destFloor",
    question: "Which floor at the DROP-OFF location?",
    type: "choice",
    options: ["Ground Floor / 1st", "2nd Floor", "3rd Floor", "4th Floor or Higher"],
    show: (a) => isMovingService(a) && !(a.loadType || "").includes("Load only"),
  },
  {
    id: "destElevator",
    question: "Is there a working elevator at the drop-off location?",
    type: "choice",
    options: ["✅ Yes, there's an elevator", "🪜 No elevator — stairs only"],
    show: (a) =>
      isMovingService(a) &&
      !(a.loadType || "").includes("Load only") &&
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
    id: "junkLocation",
    question: "Where's the junk located?",
    subtext: "We need your address to schedule pickup.",
    type: "address",
    placeholder: "123 Main St, Ironwood, MI",
    show: (a) => isJunkService(a),
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
    id: "windowLocation",
    question: "What's the address for the window cleaning?",
    subtext: "We'll confirm local availability and scheduling.",
    type: "address",
    placeholder: "123 Main St, Ironwood, MI",
    show: (a) => isWindowCleaningService(a),
  },
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

  // Generic scope — only for Lawn Care (all other quote-only services have structured steps)
  {
    id: "jobScope",
    question: "Describe the scope of work:",
    subtext: "Rough size, number of rooms, square footage, or area — whatever you know.",
    type: "text",
    placeholder: "e.g. front and back yard, approx 1/4 acre",
    show: (a) => isQuoteOnlyService(a) && isLawnService(a),
  },

  // ── SNOW REMOVAL ─────────────────────────────────────────────────────────
  {
    id: "snowDrivewayType",
    question: "What's your driveway situation?",
    subtext: "Tap the option that best describes it.",
    type: "choice",
    options: [
      "🚗 Single car — short (1 car wide, under 40 ft)",
      "🚗 Single car — long (1 car wide, 40 ft+)",
      "🚙 Double car — short (2 cars wide, under 40 ft)",
      "🚙 Double car — long (2 cars wide, 40 ft+)",
      "📋 Custom / Commercial — need a quote",
    ],
    show: (a) => isSnowService(a),
  },
  {
    id: "snowAddons",
    question: "Any add-ons?",
    subtext: "Select all that apply.",
    type: "multiselect",
    options: [
      "🚶 Walkway + front steps",
      "🚪 Back or side door path",
      "None — driveway only",
    ],
    show: (a) => isSnowService(a) && !(a.snowDrivewayType || "").includes("Custom"),
  },

  // ── MOVE-IN/OUT CLEANING ──────────────────────────────────────────────────
  {
    id: "cleanHomeSize",
    question: "What's the size of the home?",
    type: "choice",
    options: [
      "🏠 Studio",
      "🏠 1 Bedroom",
      "🏠 2 Bedrooms",
      "🏠 3 Bedrooms",
      "🏠 4 Bedrooms+",
    ],
    show: (a) => isCleaningService(a),
  },
  {
    id: "cleanType",
    question: "What type of clean do you need?",
    subtext: "Deep clean includes inside appliances, baseboards, and detailed scrubbing.",
    type: "choice",
    options: [
      "✨ Light Clean — surface-level refresh",
      "🧹 Deep Clean — thorough top-to-bottom",
    ],
    show: (a) => isCleaningService(a),
  },
  {
    id: "cleanAddons",
    question: "Any add-ons?",
    subtext: "Select all that apply.",
    type: "multiselect",
    options: [
      "🛋️ Carpet cleaning",
      "🪟 Extra window cleaning",
      "🍳 Appliance cleaning (inside oven, fridge, etc.)",
      "None",
    ],
    show: (a) => isCleaningService(a),
  },

  // ── LIGHT DEMOLITION ──────────────────────────────────────────────────────
  {
    id: "demoCrewSize",
    question: "How big of a crew do you estimate needing?",
    type: "choice",
    options: [
      "👤 1 person",
      "👥 2 people",
      "👥👥 3+ people",
      "❓ Not sure — need advice",
    ],
    show: (a) => isDemoService(a),
  },
  {
    id: "demoDuration",
    question: "How long do you think the job will take?",
    type: "choice",
    options: [
      "⏱️ 2–4 hours",
      "🕐 Half day (~4–6 hrs)",
      "📅 Full day (6–8 hrs)",
      "📆 Multi-day project",
    ],
    show: (a) => isDemoService(a),
  },
  {
    id: "demoHazards",
    question: "Any hazardous conditions we should know about?",
    subtext: "Hazardous materials affect crew requirements. Select all that apply.",
    type: "multiselect",
    options: [
      "🦠 Mold present",
      "🐛 Bed bugs",
      "☢️ Asbestos suspected",
      "✅ None / Other",
    ],
    show: (a) => isDemoService(a),
  },
  {
    id: "demoWasteRemoval",
    question: "How will demo waste be handled?",
    type: "choice",
    options: [
      "🗑️ Dumpster already on site",
      "🚛 JC hauls everything away",
      "❓ Unsure — need guidance",
    ],
    show: (a) => isDemoService(a),
  },
  {
    id: "demoScope",
    question: "What's being demolished?",
    subtext: "Select all that apply.",
    type: "multiselect",
    options: [
      "🪵 Flooring",
      "🧱 Walls / Sheetrock",
      "🏠 Insulation",
      "🔲 Ceilings",
      "🏚️ Full room tearout",
      "Other",
    ],
    show: (a) => isDemoService(a),
  },

  // ── HANDYMAN ──────────────────────────────────────────────────────────────
  {
    id: "handymanScale",
    question: "How big is the project?",
    subtext: "Pick the closest match.",
    type: "choice",
    options: [
      "🔩 Tiny — about 1 hour",
      "🔧 Small — half day",
      "🛠️ Medium — 2–4 hours",
      "⚙️ Large — half day or more",
    ],
    show: (a) => isHandymanService(a),
  },
  {
    id: "handymanCategory",
    question: "What category best fits the work?",
    type: "choice",
    options: [
      "🚿 Bathroom",
      "🍳 Kitchen",
      "🏠 Exterior",
      "🛋️ Interior (general)",
      "📋 Custom / Mixed",
    ],
    show: (a) => isHandymanService(a),
  },

  // ── FLOORING ──────────────────────────────────────────────────────────────
  {
    id: "flooringOldRemoval",
    question: "Does the old flooring need to be removed first?",
    type: "choice",
    options: [
      "✅ Yes — remove existing floor",
      "❌ No — installing over subfloor",
      "❓ Not sure",
    ],
    show: (a) => isFlooringService(a),
  },
  {
    id: "flooringCurrentType",
    question: "What's the current floor type?",
    type: "choice",
    options: [
      "🪵 Hardwood",
      "🔲 Laminate / Vinyl",
      "⬛ Tile / Stone",
      "🟫 Carpet",
      "Subfloor / Bare",
      "Other",
    ],
    show: (a) => isFlooringService(a),
  },
  {
    id: "flooringNewProduct",
    question: "What type of new flooring are you installing?",
    type: "choice",
    options: [
      "🪵 Hardwood (solid or engineered)",
      "🔲 Luxury vinyl plank (LVP)",
      "⬛ Tile / Stone",
      "🟫 Carpet",
      "Other / Undecided",
    ],
    show: (a) => isFlooringService(a),
  },
  {
    id: "flooringMaterials",
    question: "Who's supplying the materials?",
    type: "choice",
    options: [
      "📦 I'm supplying the materials",
      "🏪 JC provides materials",
      "💬 Need advice on materials",
    ],
    show: (a) => isFlooringService(a),
  },
  {
    id: "flooringRoomsSqft",
    question: "How many rooms and what's the approximate square footage?",
    subtext: "Give us your best estimate — exact measurements aren't required yet.",
    type: "text",
    placeholder: "e.g. 2 rooms, ~400 sq ft",
    show: (a) => isFlooringService(a),
  },
  {
    id: "flooringHaulAway",
    question: "Should we haul away the old flooring material?",
    type: "choice",
    options: [
      "✅ Yes — haul away old material",
      "❌ No — I'll dispose of it",
    ],
    show: (a) => isFlooringService(a) && a.flooringOldRemoval === "✅ Yes — remove existing floor",
  },
  {
    id: "flooringTrim",
    question: "What about trim and baseboards?",
    type: "choice",
    options: [
      "✅ Install new trim / baseboards",
      "🔄 Reinstall existing trim",
      "❌ No trim work needed",
    ],
    show: (a) => isFlooringService(a),
  },

  // ── PAINTING ──────────────────────────────────────────────────────────────
  {
    id: "paintingIntExt",
    question: "Interior or exterior painting?",
    type: "choice",
    options: [
      "🏠 Interior",
      "🏡 Exterior",
      "🏘️ Both interior & exterior",
    ],
    show: (a) => isPaintingService(a),
  },
  {
    id: "paintingType",
    question: "Painting or staining?",
    type: "choice",
    options: [
      "🎨 Painting",
      "🪵 Staining",
      "Both",
    ],
    show: (a) => isPaintingService(a),
  },
  {
    id: "paintingRoomCount",
    question: "How many rooms or areas need painting?",
    type: "choice",
    options: [
      "1 room / area",
      "2–3 rooms",
      "4–5 rooms",
      "6+ rooms / whole house",
    ],
    show: (a) => isPaintingService(a) && a.paintingIntExt !== "🏡 Exterior",
  },
  {
    id: "paintingRoomSize",
    question: "What's the typical room size?",
    type: "choice",
    options: [
      "🔹 Small (under 150 sq ft)",
      "🔷 Medium (150–300 sq ft)",
      "🔶 Large (300–500 sq ft)",
      "🟠 Extra large / open concept (500+ sq ft)",
    ],
    show: (a) => isPaintingService(a) && a.paintingIntExt !== "🏡 Exterior",
  },
  {
    id: "paintingCeilings",
    question: "Are ceilings included?",
    type: "choice",
    options: [
      "✅ Yes — paint the ceilings too",
      "❌ No — walls only",
    ],
    show: (a) => isPaintingService(a) && a.paintingIntExt !== "🏡 Exterior",
  },
  {
    id: "paintingAddons",
    question: "Any add-ons?",
    subtext: "Select all that apply.",
    type: "multiselect",
    options: [
      "🚪 Doors & trim",
      "🪟 Window frames",
      "None",
    ],
    show: (a) => isPaintingService(a),
  },
  {
    id: "paintingPrep",
    question: "How much prep work is needed?",
    type: "choice",
    options: [
      "✅ Minimal — walls are in great shape",
      "🔧 Some — minor patching / sanding needed",
      "⚒️ Heavy — significant repairs or stripping",
    ],
    show: (a) => isPaintingService(a),
  },
  {
    id: "paintingMaterials",
    question: "Who's supplying the paint?",
    type: "choice",
    options: [
      "🪣 I'm providing the paint",
      "🏪 JC provides paint",
      "💬 Need help choosing",
    ],
    show: (a) => isPaintingService(a),
  },
  {
    id: "paintingPrimer",
    question: "Will a primer coat be needed?",
    type: "choice",
    options: [
      "✅ Yes — prime before painting",
      "❌ No primer needed",
      "❓ Not sure",
    ],
    show: (a) => isPaintingService(a),
  },
  {
    id: "paintingSurfaceCondition",
    question: "What's the surface condition?",
    type: "choice",
    options: [
      "✅ Good — minimal imperfections",
      "⚠️ Fair — some cracks or peeling",
      "🔴 Poor — significant damage or old paint",
    ],
    show: (a) => isPaintingService(a),
  },
  {
    id: "paintingSpecialtyAreas",
    question: "Any high or vaulted ceilings?",
    type: "choice",
    options: [
      "✅ Yes — high or vaulted ceilings",
      "❌ No — standard ceiling height",
    ],
    show: (a) => isPaintingService(a),
  },

  // ── ROOFING ───────────────────────────────────────────────────────────────
  {
    id: "roofingCurrentType",
    question: "What's the current roof type?",
    type: "choice",
    options: [
      "🔩 Metal roof",
      "🏠 Asphalt shingles",
      "🏚️ Other / Unknown",
    ],
    show: (a) => isRoofingService(a),
  },
  {
    id: "roofingStories",
    question: "How many stories is the building?",
    type: "choice",
    options: [
      "🏠 1 story",
      "🏘️ 2 stories",
      "🏗️ 2+ stories",
    ],
    show: (a) => isRoofingService(a),
  },
  {
    id: "roofingPitch",
    question: "What's the roof pitch (steepness)?",
    subtext: "If unsure, describe what you see.",
    type: "choice",
    options: [
      "🔲 Low / flat pitch",
      "📐 Medium pitch (standard residential)",
      "📐📐 Steep pitch",
      "❓ Not sure",
    ],
    show: (a) => isRoofingService(a),
  },
  {
    id: "roofingTearOff",
    question: "Is this a full replacement or repair?",
    type: "choice",
    options: [
      "🔄 Full tear-off & replacement",
      "🔧 Repair / partial replacement",
      "❓ Not sure — need an assessment",
    ],
    show: (a) => isRoofingService(a),
  },
  {
    id: "roofingWasteRemoval",
    question: "How should old roofing materials be handled?",
    type: "choice",
    options: [
      "🚛 JC hauls everything away",
      "🗑️ Dumpster already on site",
      "❓ Unsure",
    ],
    show: (a) => isRoofingService(a) && a.roofingTearOff === "🔄 Full tear-off & replacement",
  },
  {
    id: "roofingMaterials",
    question: "Who's supplying roofing materials?",
    type: "choice",
    options: [
      "📦 I'm supplying materials",
      "🏪 JC provides materials",
      "💬 Need advice on materials",
    ],
    show: (a) => isRoofingService(a),
  },

  // ── SHARED QUOTE-ONLY STEPS ───────────────────────────────────────────────
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

  // ── PHOTO UPLOAD (all users) ──────────────────────────────────────────────
  {
    id: "employeePhotos",
    question: "Add photos (optional)",
    subtext: "Upload photos of items, space, or anything that helps us understand the job scope. Tap to skip.",
    type: "photo_upload",
    optional: true,
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
export function computeMovingQuote(a: Answers, ratePerMoverHour = 85, jc222FlatPrice = 222, distanceMiles = 0): MovingQuote {
  const RATE = ratePerMoverHour;
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

  // Specialty item surcharges — $400 for ≤500 lbs items, $600 for 500+ lbs items (standalone)
  let specialSurcharge = 0;
  if (hasGrandPiano)   specialSurcharge += 600; // 500+ lbs
  if (hasUprightPiano) specialSurcharge += 400; // ≤500 lbs
  if (hasPoolTable)    specialSurcharge += 400; // ≤500 lbs
  if (hasHotTub)       specialSurcharge += 600; // 500+ lbs
  if (hasHeavySafe)    specialSurcharge += 400; // ≤500 lbs (300+ lbs safes)

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
    minHrs = 2;   // minimum is 2 mover-hours ($170) — same whether 1×2hrs or 2×1hr
    maxHrs = 2;
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

  // ── Enforce load+unload minimum 3 hrs ─────────────────────────────────────
  if (isBoth) {
    minHrs = Math.max(minHrs, 3);
    maxHrs = Math.max(maxHrs, 3);
  }

  // Round to nearest 0.5
  minHrs = Math.round(minHrs * 2) / 2;
  maxHrs = Math.max(minHrs, Math.round(maxHrs * 2) / 2);

  // ── Pricing ───────────────────────────────────────────────────────────────
  const rawMin = round5(crew * minHrs * RATE) + specialSurcharge;
  const rawMax = round5(crew * maxHrs * RATE) + specialSurcharge;

  // ── Travel charge: $50 per 25-mile band from Ironwood — all job sizes ──────
  // This is a fuel/drive surcharge billed in addition to on-site labor + drive time.
  // distanceMiles=0 means unknown/local → no charge applied
  const travelTiers = distanceMiles > 0 ? Math.floor(distanceMiles / TRAVEL_TIER_MILES) : 0;
  const travelCharge = travelTiers * TRAVEL_CHARGE_PER_TIER;

  // ── JC222 promo: Small-tier 2-crew → $340 becomes $222 flat ───────────────
  const promoCodeRaw = (a.promoCode || "").toUpperCase().trim();
  const isJC222      = promoCodeRaw === "JC222";
  const promoApplied = isJC222 && tier === "small" && crew === 2;

  // ── JCMOVES promo: 10% off or $20 off, whichever is greater ───────────────
  // Applies to tiny and small tiers when JC222 isn't already active
  const isJCMOVES      = promoCodeRaw === "JCMOVES";
  const jcmovesBase    = promoApplied ? jc222FlatPrice : rawMin;
  const jcmovesDiscount = isJCMOVES && !promoApplied
    ? Math.max(Math.round(jcmovesBase * 0.10), 20)
    : 0;
  const jcmovesApplied = jcmovesDiscount > 0;

  const baseMin = promoApplied ? jc222FlatPrice : rawMin - jcmovesDiscount;
  const baseMax = promoApplied ? jc222FlatPrice : rawMax - jcmovesDiscount;
  const minPrice = baseMin + travelCharge;
  const maxPrice = baseMax + travelCharge;
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
    promoApplied,
    promoCode:      isJC222 ? "JC222" : isJCMOVES ? "JCMOVES" : undefined,
    rawMinPrice:    promoApplied ? rawMin : undefined,
    travelCharge:   travelCharge || undefined,
    jcmovesApplied: jcmovesApplied || undefined,
    jcmovesDiscount: jcmovesDiscount || undefined,
  };
}

// ─────────────────────────────────────────────
// Junk Removal Quote Engine
// ─────────────────────────────────────────────
function computeJunkQuote(a: Answers, ratePerMoverHour = 85, distanceMiles = 0): JunkQuote {
  const RATE = ratePerMoverHour;
  const r5 = (n: number) => Math.ceil(n / 5) * 5;

  // Volume tier from home size
  const sizeTierMap: Record<string, "tiny" | "small" | "medium" | "large"> = {
    "1–2 Items (Tiny Job)":    "tiny",
    "Studio / Single Room":    "small",
    "1 Bedroom Apartment":     "small",
    "2 Bedroom Apartment":     "medium",
    "3 Bedroom Apartment":     "medium",
    "4+ Bedroom Apartment":    "large",
    "1–2 Bedroom House":       "medium",
    "3 Bedroom House":         "large",
    "4+ Bedroom House":        "large",
    "Commercial / Office":     "large",
  };
  const tier: "tiny" | "small" | "medium" | "large" = sizeTierMap[a.homeSize || ""] ?? "small";

  // Special items surcharge — $400 for ≤500 lbs items, $600 for 500+ lbs items (standalone)
  const specials = (a.specialItems || []).filter(s => s !== "None of these");
  let specialSurcharge = 0;
  if (specials.includes("🎹 Grand Piano"))       specialSurcharge += 600; // 500+ lbs
  if (specials.includes("🎹 Upright Piano"))     specialSurcharge += 400; // ≤500 lbs
  if (specials.includes("🎱 Pool Table"))        specialSurcharge += 400; // ≤500 lbs
  if (specials.includes("♨️ Hot Tub"))           specialSurcharge += 600; // 500+ lbs
  if (specials.includes("🔒 Heavy Safe (300 lbs+)")) specialSurcharge += 400; // ≤500 lbs

  // Crew and hour ranges by tier
  // Minimum is 2 mover-hours ($170) — same whether 1 mover × 2 hrs or 2 movers × 1 hr
  let crew: number, minHrs: number, maxHrs: number;
  if (tier === "tiny")        { crew = 1; minHrs = 2;   maxHrs = 2;   }
  else if (tier === "small")  { crew = 2; minHrs = 1.5; maxHrs = 2;   }
  else if (tier === "medium") { crew = 2; minHrs = 2.5; maxHrs = 3.5; }
  else                        { crew = 3; minHrs = 3;   maxHrs = 5;   }

  // Heavy items force a larger crew minimum
  if (specials.some(s => ["🎹 Grand Piano", "🎹 Upright Piano", "🎱 Pool Table", "♨️ Hot Tub"].includes(s))) {
    crew = Math.max(crew, 2);
    if (tier === "tiny") { crew = 2; minHrs = 1.5; maxHrs = 2; }
  }

  const rawMin = r5(crew * minHrs * RATE) + specialSurcharge;
  const rawMax = r5(crew * maxHrs * RATE) + specialSurcharge;

  // ── Travel charge: $50 per 25-mile band from Ironwood — all job sizes ──────
  const travelTiers = distanceMiles > 0 ? Math.floor(distanceMiles / TRAVEL_TIER_MILES) : 0;
  const travelCharge = travelTiers * TRAVEL_CHARGE_PER_TIER;

  // ── JCMOVES promo: 10% off or $20 off, whichever is greater ───────────────
  const promoCodeRaw = (a.promoCode || "").toUpperCase().trim();
  const isJCMOVES = promoCodeRaw === "JCMOVES";
  const jcmovesDiscount = isJCMOVES
    ? Math.max(Math.round(rawMin * 0.10), 20)
    : 0;
  const jcmovesApplied = jcmovesDiscount > 0;

  const minPrice = rawMin - jcmovesDiscount + travelCharge;
  const maxPrice = rawMax - jcmovesDiscount + travelCharge;
  const tokensEstimate = Math.round(((minPrice + maxPrice) / 2) * 50);

  return {
    type: "junk", tier, crew, minHrs, maxHrs, minPrice, maxPrice, tokensEstimate, specialSurcharge,
    travelCharge:    travelCharge    || undefined,
    jcmovesApplied:  jcmovesApplied  || undefined,
    jcmovesDiscount: jcmovesDiscount || undefined,
  };
}

// ─────────────────────────────────────────────
// Compute Quote for Any Service
// ─────────────────────────────────────────────
function computeQuoteForAnswers(a: Answers, ratePerMoverHour = 85, jc222FlatPrice = 222, distanceMiles = 0): QuoteResult | null {
  const svc = getServiceLabel(a.serviceType || "");

  if (QUOTE_ONLY_SERVICES.includes(svc)) {
    const ranges: Record<string, [number, number]> = {
      "Painting":              [500,   5000],
      "Flooring":              [800,   8000],
      "Roofing":               [5000,  50000],
      "Handyman":              [75,    900],
      "Lawn Care":             [50,    400],
      "Snow Removal":          [75,    350],
      "Move-In/Out Cleaning":  [150,   600],
      "Light Demolition":      [300,   2000],
    };
    const [min, max] = ranges[svc] || [300, 3000];
    return { type: "quote_only", service: svc, minPrice: min, maxPrice: max };
  }

  if (svc === "Junk Removal") {
    return computeJunkQuote(a, ratePerMoverHour, distanceMiles);
  }

  if (svc === "Trash Valet") {
    const canMap: Record<string, number> = { "1 can": 1, "2 cans": 2, "3 cans": 3, "4+ cans": 4 };
    const bagMap: Record<string, number> = { "No extra bags": 0, "1–4 extra bags": 2, "5–9 extra bags": 7, "10+ extra bags": 12 };
    const cans = canMap[a.trashCans || "1 can"] || 1;
    const bags = bagMap[a.trashBags || "No extra bags"] || 0;
    const recycling = (a.recyclingEnabled || "").includes("Yes");
    const planType = (a.trashPlanType || "").includes("Yearly") ? "yearly" : "monthly";
    const isOutOfArea = distanceMiles > TRASH_VALET_TRAVEL_THRESHOLD_MILES;
    const travelFeeMonthly = isOutOfArea ? 50 : 0;
    const quote = calculateTrashValetQuote({ cans, bagCount: bags, recyclingEnabled: recycling, planType });
    const rawFinal = quote.finalMonthlyPrice + travelFeeMonthly;
    const finalPrice = isOutOfArea ? Math.max(TRASH_VALET_OUT_OF_AREA_MINIMUM, rawFinal) : rawFinal;
    return {
      type: "trash_valet",
      finalMonthlyPrice: finalPrice,
      minPrice: finalPrice,
      maxPrice: finalPrice + 10,
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
    const travelFee = distanceMiles > 5 ? 50 : 0;
    return {
      type: "window_cleaning",
      paneCount: quote.paneCount,
      minPrice: quote.total + travelFee,
      maxPrice: quote.total + travelFee,
      total: quote.total + travelFee,
    };
  }

  // Moving or Junk
  return computeMovingQuote(a, ratePerMoverHour, jc222FlatPrice, distanceMiles);
}

// ─────────────────────────────────────────────
// Build Crew Packages for priceable services
// ─────────────────────────────────────────────
export function buildCrewPackages(a: Answers, q: QuoteResult | null, ratePerMoverHour = 85, jc222FlatPrice = 222): CrewPackage[] {
  if (!q) return [];

  if (q.type === "junk") {
    const jq = q as JunkQuote;
    const RATE = ratePerMoverHour;
    const sur    = jq.specialSurcharge;
    const travel = jq.travelCharge || 0;
    const r5   = (n: number) => Math.ceil(n / 5) * 5;
    const price = (crew: number, hrs: number) => r5(crew * hrs * RATE) + sur;
    const travelNote = travel > 0 ? ` · +$${travel} travel fee` : "";

    if (jq.tier === "tiny") {
      // $170 minimum = 2 mover-hours. Same price either way.
      const base = price(1, 2) + travel;
      return [
        {
          id: "pkg_junk_tiny_solo",
          label: "1 Mover × 2 hrs",
          desc: `Solo mover · 2-hr minimum · couch, appliance, mattress, or 1–2 items${travelNote}`,
          minPrice: base,
          maxPrice: base,
          crew: 1,
          hours: 2,
          tag: "Standard",
        },
        {
          id: "pkg_junk_tiny_duo",
          label: "2 Movers × 1 hr",
          desc: `Two-person crew · faster in-and-out · same total cost${travelNote}`,
          minPrice: base,
          maxPrice: base,
          crew: 2,
          hours: 1,
          tag: "Quick",
        },
      ];
    }

    if (jq.tier === "small") {
      return [{
        id: "pkg_junk_small",
        label: "Small Load · 2 Movers · ~1.5–2 hrs",
        desc: `Studio or 1BR worth of junk · roughly ¼ truck load · efficient crew${travelNote}`,
        minPrice: price(2, 1.5) + travel,
        maxPrice: price(2, 2) + travel,
        crew: 2,
        hours: 2,
        tag: "Standard",
      }];
    }

    if (jq.tier === "medium") {
      return [
        {
          id: "pkg_junk_med_a",
          label: "2 Movers · ~3 hrs",
          desc: `Steady pace — great for a 2–3BR worth of junk or a garage cleanout${travelNote}`,
          minPrice: price(2, 2.5) + travel,
          maxPrice: price(2, 3.5) + travel,
          crew: 2,
          hours: 3,
        },
        {
          id: "pkg_junk_med_b",
          label: "3 Movers · ~2 hrs",
          desc: `Faster crew — best if you have heavy items or a tight time window${travelNote}`,
          minPrice: price(3, 2) + travel,
          maxPrice: price(3, 2) + travel,
          crew: 3,
          hours: 2,
          tag: "Recommended",
        },
      ];
    }

    // large
    return [
      {
        id: "pkg_junk_lg_a",
        label: "2 Movers · ~5 hrs",
        desc: `Budget option — plenty of time for a full house cleanout${travelNote}`,
        minPrice: price(2, 4) + travel,
        maxPrice: price(2, 5) + travel,
        crew: 2,
        hours: 5,
      },
      {
        id: "pkg_junk_lg_b",
        label: "3 Movers · ~3.5 hrs",
        desc: `Balanced crew — ideal for 4BR+ or commercial cleanouts${travelNote}`,
        minPrice: price(3, 3) + travel,
        maxPrice: price(3, 3.5) + travel,
        crew: 3,
        hours: 3.5,
        tag: "Recommended",
      },
    ];
  }

  if (q.type === "moving") {
    const mq = q as MovingQuote;
    const RATE = ratePerMoverHour;
    const sur    = mq.specialSurcharge;
    const travel = mq.travelCharge || 0;
    const r5   = (n: number) => Math.ceil(n / 5) * 5;
    const price = (crew: number, hrs: number) => r5(crew * hrs * RATE) + sur;
    const travelNote = travel > 0 ? ` · +$${travel} travel fee` : "";

    if (mq.tier === "tiny") {
      // $170 minimum = 2 mover-hours. Offer two configurations at the same price.
      const base = price(1, 2) + travel; // 1×2×$85 = $170, plus travel if outside Ironwood
      return [
        {
          id: "pkg_tiny_solo",
          label: "1 Mover × 2 hrs",
          desc: `Solo mover · 2-hr minimum · great for a couch, dresser, or 1–2 items${travelNote}`,
          minPrice: base,
          maxPrice: base,
          crew: 1,
          hours: 2,
          tag: "Standard",
        },
        {
          id: "pkg_tiny_duo",
          label: "2 Movers × 1 hr",
          desc: `Two-person team · same total cost, faster clock · in and out in ~1 hr${travelNote}`,
          minPrice: base,
          maxPrice: base,
          crew: 2,
          hours: 1,
          tag: "Quick",
        },
      ];
    }

    if (mq.tier === "small") {
      // If heavy item (300 lbs+) + stairs: crew bumped to 3 — only show 3-mover option
      if (mq.crew >= 3) {
        return [
          {
            id: "pkg_small_3crew",
            label: "3 Movers × 2 hrs (Heavy + Stairs)",
            desc: `Required for heavy items on stairs — 3 movers minimum for safe handling${travelNote}`,
            minPrice: price(3, 2) + travel,
            maxPrice: price(3, 2) + travel,
            crew: 3,
            hours: 2,
            tag: "Safety Required",
          },
        ];
      }
      // Standard 2-crew small: show base rate + JC222 promo variant side-by-side
      const jc222Total = jc222FlatPrice + travel;
      return [
        {
          id: "pkg_small",
          label: "2 Movers × 2 hrs",
          desc: `Studio / single room · load only or unload only · 2-hr minimum${travelNote}`,
          minPrice: price(2, 2) + travel,
          maxPrice: price(2, 2) + travel,
          crew: 2,
          hours: 2,
          tag: "Standard",
        },
        {
          id: "pkg_small_jc222",
          label: "2 Movers × 2 hrs — JC222 Promo",
          desc: `Same crew & time at the JC222 promo rate${travel ? ` · $${jc222FlatPrice} + $${travel} travel` : ` · $${jc222FlatPrice} flat`} · limited availability`,
          minPrice: jc222Total,
          maxPrice: jc222Total,
          crew: 2,
          hours: 2,
          tag: `JC222 — $${jc222Total}`,
        },
      ];
    }

    if (mq.tier === "medium") {
      const medPkgs: CrewPackage[] = [
        {
          id: "pkg_med_a",
          label: "2 Movers × 4 hrs",
          desc: `Steady pace · $85/mover/hr · best for ground-floor or elevator access${travelNote}`,
          minPrice: price(2, 4) + travel,
          maxPrice: price(2, 4) + travel,
          crew: 2,
          hours: 4,
        },
        {
          id: "pkg_med_b",
          label: "3 Movers × 2.5 hrs",
          desc: `Faster crew · same total effort · recommended with stairs or tight schedule${travelNote}`,
          minPrice: price(3, 2.5) + travel,
          maxPrice: price(3, 2.5) + travel,
          crew: 3,
          hours: 2.5,
          tag: "Recommended",
        },
      ];
      // Enforce minimum crew from quote engine (e.g. heavy item + stairs requires 3-mover min)
      return medPkgs.filter(p => !p.crew || p.crew >= mq.crew);
    }

    // large — filter enforced below
    const largePkgs: CrewPackage[] = [
      {
        id: "pkg_lg_c",
        label: "2 Movers × 7 hrs",
        desc: `Budget option · plenty of time · best without stairs or heavy items${travelNote}`,
        minPrice: price(2, 7) + travel,
        maxPrice: price(2, 7) + travel,
        crew: 2,
        hours: 7,
      },
      {
        id: "pkg_lg_b",
        label: "3 Movers × 5 hrs",
        desc: `Balanced crew · great for 3BR house or 2+ flights of stairs${travelNote}`,
        minPrice: price(3, 5) + travel,
        maxPrice: price(3, 5) + travel,
        crew: 3,
        hours: 5,
        tag: "Recommended",
      },
      {
        id: "pkg_lg_a",
        label: "4 Movers × 4 hrs",
        desc: `Power crew · fastest option · best for 4BR+ or pianos${travelNote}`,
        minPrice: price(4, 4) + travel,
        maxPrice: price(4, 4) + travel,
        crew: 4,
        hours: 4,
      },
    ];
    // Enforce minimum crew: never offer a package with fewer movers than computed minimum
    return largePkgs.filter(p => !p.crew || p.crew >= mq.crew);
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
        originalPrice: tq.finalMonthlyPrice,
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
  "trash-valet": "🗑️ Trash Valet (weekly curbside)",
  window_cleaning: "🪟 Window Cleaning",
  window: "🪟 Window Cleaning",
  painting: "🎨 Painting",
  flooring: "🪵 Flooring",
  roofing: "🏠 Roofing",
  handyman: "🔧 Handyman",
  "lawn-care": "🌿 Lawn Care",
  lawn: "🌿 Lawn Care",
  snow: "❄️ Snow Removal",
  snow_removal: "❄️ Snow Removal",
  cleaning: "✨ Move-In/Out Cleaning",
  demolition: "⚒️ Light Demolition",
  residential: "📦 Moving (local or long-distance)",
};

interface ChatPhoto {
  id: string;
  dataUrl: string;
  name: string;
}

export function BookingChatbot({ onClose, onSuccess, embedded = false, showCloseButton, className, initialService, variant = "customer" }: { onClose?: () => void; onSuccess?: () => void; embedded?: boolean; showCloseButton?: boolean; className?: string; initialService?: string; variant?: "customer" | "employee" }) {
  const isEmployee = variant === "employee";
  const showClose = showCloseButton ?? !embedded;
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Fetch live pricing from DB so the chatbot reflects admin calibration changes in real time
  const { data: pricingConfig } = useQuery<{ ratePerMoverHour: number; jc222Price: number }>({
    queryKey: ["/api/pricing"],
    staleTime: 5 * 60 * 1000,
  });
  const liveRate      = pricingConfig?.ratePerMoverHour ?? 85;
  const liveJc222     = pricingConfig?.jc222Price       ?? 222;

  const [photos, setPhotos] = useState<ChatPhoto[]>([]);
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
  const [distanceMiles, setDistanceMiles] = useState(0); // fetched async when address is entered
  const [selectedPackageObj, setSelectedPackageObj] = useState<CrewPackage | null>(null);
  const [depositInfo, setDepositInfo] = useState<{ required: boolean; amount: number; termsHtml: string } | null>(null);
  const [depositChecked, setDepositChecked] = useState(false);

  // ── localStorage session persistence ──────────────────────────────────────
  const STORAGE_KEY = `jc_chatbot_session_${initialService || "default"}`;

  useEffect(() => {
    if (initialService) return; // Don't restore if a service was pre-selected (fresh entry)
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const d = JSON.parse(saved);
      if (!d.answers || d.stepIdx == null) return;
      setAnswers(d.answers);
      if (Array.isArray(d.messages) && d.messages.length > 0) setMessages(d.messages);
      setStepIdx(d.stepIdx);
      if (!user) {
        if (d.contactName)  setContactName(d.contactName);
        if (d.contactPhone) setContactPhone(d.contactPhone);
        if (d.contactEmail) setContactEmail(d.contactEmail);
      }
      if (d.pendingQuote) {
        setPendingQuote(d.pendingQuote);
        setQuoteVisible(d.quoteVisible || false);
      }
      if (Array.isArray(d.crewPackages) && d.crewPackages.length > 0) setCrewPackages(d.crewPackages);
      if (d.selectedPackageObj) setSelectedPackageObj(d.selectedPackageObj);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (submitted) { localStorage.removeItem(STORAGE_KEY); return; }
    if (stepIdx === 0 && Object.keys(answers).length === 0) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        answers,
        messages,
        stepIdx,
        contactName,
        contactPhone,
        contactEmail,
        pendingQuote,
        quoteVisible,
        crewPackages,
        selectedPackageObj,
      }));
    } catch { /* quota exceeded — ignore */ }
  }, [answers, messages, stepIdx, contactName, contactPhone, contactEmail,
      pendingQuote, quoteVisible, crewPackages, selectedPackageObj, submitted]);

  const visibleSteps = useMemo(
    () => STEPS.filter(s => {
      if (s.employeeOnly && !isEmployee) return false;
      return !s.show || s.show(answers);
    }),
    [answers, isEmployee]
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
    // Reset any stale state from previous sessions
    setCrewPackages([]);
    setSelectedPackageObj(null);
    setPendingQuote(null);
    setQuoteVisible(false);
    const nextSteps = STEPS.filter(s => !s.show || s.show(newAnswers));
    const nextStep = nextSteps[1];
    setMessages([
      { from: "bot", text: "👋 Hi — I'm JC! I'll help you get a quote for any of our services in about 60 seconds. No pressure, no spam — real human review before anything is sent.", ts: Date.now() - 1 },
      { from: "bot", text: `You selected: ${mapped}`, ts: Date.now() },
      ...(nextStep ? [{ from: "bot" as const, text: nextStep.question + (nextStep.subtext ? `\n\n_${nextStep.subtext}_` : ""), ts: Date.now() + 1 }] : []),
    ]);
    setStepIdx(1);
  }, [initialService]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, quoteVisible]);

  // Defensive: if we're on the package_select step but crewPackages is empty
  // (can happen on session restore from localStorage), recompute them now.
  useEffect(() => {
    if (!currentStep) return;
    if (currentStep.type !== "package_select") return;
    if (crewPackages.length > 0) return;
    const q = computeQuoteForAnswers(answers, liveRate, liveJc222, distanceMiles);
    if (!q) return;
    setPendingQuote(q);
    const pkgs = buildCrewPackages(answers, q, liveRate, liveJc222);
    if (pkgs.length > 0) setCrewPackages(pkgs);
  }, [currentStep?.id, crewPackages.length]);

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

    // When user selects the JC222 promo package, auto-inject promoCode so the
    // quote engine sees it when computing the final quote after all steps.
    if (stepId === "selectedPackage" && value === "pkg_small_jc222") {
      newAnswers.promoCode = "JC222";
    }

    // Protect auto-injected JC222: if the user skips/clears the promo code step
    // but JC222 was already set by package selection, keep it intact.
    if (stepId === "promoCode" && (!value || value === "(none)") && answers.promoCode === "JC222") {
      newAnswers.promoCode = "JC222";
    }

    setAnswers(newAnswers);

    if (stepId === "contact") {
      userSay(`${contactName} · ${contactPhone} · ${contactEmail}`);
    } else {
      userSay(shortAnswer(stepId, value));
    }

    // Async distance fetch: fires when address is captured, resolves before package step
    if (stepId === "fromZip" || stepId === "junkLocation") {
      const addr = (value as string || "").trim();
      if (addr.length >= 5) {
        fetch(`/api/utility/estimate-drive-miles?address=${encodeURIComponent(addr)}`)
          .then(r => r.json())
          .then((data: any) => {
            const miles = typeof data.miles === "number" ? data.miles : 0;
            setDistanceMiles(miles);
          })
          .catch(() => setDistanceMiles(0));
      } else {
        setDistanceMiles(0);
      }
    }

    // Special promo code responses
    if (stepId === "promoCode") {
      const code = ((Array.isArray(value) ? value[0] : value) as string || "").toUpperCase().trim();
      if (code === "JCMOVES") {
        const q = computeQuoteForAnswers(newAnswers, liveRate, liveJc222, distanceMiles);
        const disc = (q as any)?.jcmovesDiscount;
        setTimeout(() => botSay(disc
          ? `✅ JCMOVES code applied! You're saving $${disc} — we appreciate your support.`
          : `✅ JCMOVES perk noted! Discount will be reflected on your final invoice.`
        ), 200);
      } else if (code && code !== "JC222" && code !== "(NONE)" && code !== "(none)") {
        setTimeout(() => botSay("⚠️ That code didn't match any active promos — no worries, we'll proceed at the standard rate."), 200);
      }
    }

    const nextVisibleSteps = STEPS.filter(s => {
      if (s.employeeOnly && !isEmployee) return false;
      return !s.show || s.show(newAnswers);
    });
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
        const q = computeQuoteForAnswers(newAnswers, liveRate, liveJc222, distanceMiles);
        setPendingQuote(q);
        const pkgs = buildCrewPackages(newAnswers, q, liveRate, liveJc222);
        setCrewPackages(pkgs);
      }

      setTimeout(() => {
        if (nextStep.id !== "depositAcknowledged" && nextStep.id !== "selectedPackage") {
          botSay(nextStep.question + (nextStep.subtext ? `\n\n_${nextStep.subtext}_` : ""));
        }
        setStepIdx(nextIdx);
        // Pre-fill promoCode input when JC222 was auto-injected via package selection
        setTextInput(nextStep.id === "promoCode" && newAnswers.promoCode === "JC222" ? "JC222" : "");
        setAddressInput("");
        setMultiSel([]);
      }, 500);
    } else {
      // All done — compute final quote & show
      setTimeout(() => {
        const q = computeQuoteForAnswers(newAnswers, liveRate, liveJc222, distanceMiles);
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

  function handlePhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files) return;

    if (photos.length + files.length > 5) {
      toast({
        title: "Too many photos",
        description: "You can upload up to 5 photos.",
        variant: "destructive",
      });
      return;
    }

    Array.from(files).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `${file.name} is larger than 10MB.`,
          variant: "destructive",
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setPhotos(prev => [...prev, { id: crypto.randomUUID(), dataUrl, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
    event.target.value = "";
  }

  function removePhoto(id: string) {
    setPhotos(prev => prev.filter(p => p.id !== id));
  }

  function handlePhotoStepContinue() {
    const summary = photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? "s" : ""} added` : "(no photos)";
    advanceStep("employeePhotos", summary);
  }

  const [depositPaid, setDepositPaid]             = useState(false);
  const [depositInvoiceSent, setDepositInvoiceSent] = useState(false);
  const [depositInvoiceUrl, setDepositInvoiceUrl] = useState<string | null>(null);

  // Build the submit payload
  const submitMutation = useMutation({
    mutationFn: async (withDeposit: boolean) => {
      if (!pendingQuote) throw new Error("No quote");
      const svc = getServiceLabel(answers.serviceType || "");
      const isQuoteOnly = QUOTE_ONLY_SERVICES.includes(svc);
      const dep = depositInfo;
      const zip = answers.jobLocation || answers.depositZip || answers.junkLocation || answers.windowLocation || answers.fromZip || "";

      if (isEmployee) {
        const nameParts = (answers.contactName || "").trim().split(/\s+/);
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";
        const photoPayload = photos.length > 0 ? photos.map(p => ({
          id: p.id,
          url: p.dataUrl,
          type: "before" as const,
          timestamp: new Date().toISOString(),
        })) : undefined;

        const scopeParts: string[] = [];
        if (answers.snowDrivewayType) scopeParts.push(`Driveway: ${answers.snowDrivewayType}`);
        if (answers.snowAddons?.length) scopeParts.push(`Add-ons: ${answers.snowAddons.join(", ")}`);
        if (answers.cleanHomeSize) scopeParts.push(`Home size: ${answers.cleanHomeSize}`);
        if (answers.cleanType) scopeParts.push(`Clean type: ${answers.cleanType}`);
        if (answers.cleanAddons?.length) scopeParts.push(`Add-ons: ${answers.cleanAddons.join(", ")}`);
        if (answers.demoCrewSize) scopeParts.push(`Crew: ${answers.demoCrewSize}`);
        if (answers.demoDuration) scopeParts.push(`Duration: ${answers.demoDuration}`);
        if (answers.demoHazards?.length) scopeParts.push(`Hazards: ${answers.demoHazards.join(", ")}`);
        if (answers.demoWasteRemoval) scopeParts.push(`Waste: ${answers.demoWasteRemoval}`);
        if (answers.demoScope?.length) scopeParts.push(`Scope: ${answers.demoScope.join(", ")}`);
        if (answers.handymanScale) scopeParts.push(`Scale: ${answers.handymanScale}`);
        if (answers.handymanCategory) scopeParts.push(`Category: ${answers.handymanCategory}`);
        if (answers.flooringOldRemoval) scopeParts.push(`Old floor removal: ${answers.flooringOldRemoval}`);
        if (answers.flooringHaulAway) scopeParts.push(`Haul away: ${answers.flooringHaulAway}`);
        if (answers.flooringCurrentType) scopeParts.push(`Current floor: ${answers.flooringCurrentType}`);
        if (answers.flooringNewProduct) scopeParts.push(`New floor: ${answers.flooringNewProduct}`);
        if (answers.flooringMaterials) scopeParts.push(`Materials: ${answers.flooringMaterials}`);
        if (answers.flooringRoomsSqft) scopeParts.push(`Rooms/sqft: ${answers.flooringRoomsSqft}`);
        if (answers.flooringTrim) scopeParts.push(`Trim: ${answers.flooringTrim}`);
        if (answers.paintingIntExt) scopeParts.push(`Painting area: ${answers.paintingIntExt}`);
        if (answers.paintingType) scopeParts.push(`Painting type: ${answers.paintingType}`);
        if (answers.paintingRoomCount) scopeParts.push(`Room count: ${answers.paintingRoomCount}`);
        if (answers.paintingRoomSize) scopeParts.push(`Room size: ${answers.paintingRoomSize}`);
        if (answers.paintingCeilings) scopeParts.push(`Ceilings: ${answers.paintingCeilings}`);
        if (answers.paintingAddons?.length) scopeParts.push(`Painting add-ons: ${answers.paintingAddons.join(", ")}`);
        if (answers.paintingSurfaceCondition) scopeParts.push(`Surface condition: ${answers.paintingSurfaceCondition}`);
        if (answers.paintingPrep) scopeParts.push(`Prep work: ${answers.paintingPrep}`);
        if (answers.paintingMaterials) scopeParts.push(`Paint materials: ${answers.paintingMaterials}`);
        if (answers.paintingPrimer) scopeParts.push(`Primer: ${answers.paintingPrimer}`);
        if (answers.paintingSpecialtyAreas) scopeParts.push(`Specialty areas: ${answers.paintingSpecialtyAreas}`);
        if (answers.roofingCurrentType) scopeParts.push(`Roof type: ${answers.roofingCurrentType}`);
        if (answers.roofingStories) scopeParts.push(`Stories: ${answers.roofingStories}`);
        if (answers.roofingPitch) scopeParts.push(`Pitch: ${answers.roofingPitch}`);
        if (answers.roofingTearOff) scopeParts.push(`Roof work: ${answers.roofingTearOff}`);
        if (answers.roofingWasteRemoval) scopeParts.push(`Waste removal: ${answers.roofingWasteRemoval}`);
        if (answers.roofingMaterials) scopeParts.push(`Roofing materials: ${answers.roofingMaterials}`);
        if (answers.jobScope) scopeParts.push(answers.jobScope);

        const payload = {
          firstName,
          lastName,
          email: answers.contactEmail || "",
          phone: answers.contactPhone || "",
          serviceType: svc,
          fromAddress: answers.jobLocation || answers.fromZip || answers.junkLocation || "",
          toAddress: answers.toZip || "",
          moveDate: answers.moveDate || "",
          details: [...scopeParts, answers.notes || ""].filter(Boolean).join(" | "),
          ...(photoPayload ? { photos: photoPayload } : {}),
        };

        const result = await apiRequest("POST", "/api/leads/employee", payload);
        return { leadId: "", message: "Lead submitted", depositInvoiceSent: false, depositInvoiceUrl: null };
      }

      const isTV = isTrashValetService(answers);
      const tvMonthly = selectedPackageObj?.minPrice ?? (pendingQuote as any)?.finalMonthlyPrice ?? 0;
      const customerPhotos = photos.length > 0 ? photos.map(p => ({
        id: p.id,
        url: p.dataUrl,
        type: "before" as const,
        timestamp: new Date().toISOString(),
      })) : undefined;
      const result = await apiRequest("POST", "/api/chatbot-quote", {
        answers,
        quote: pendingQuote,
        selectedPackage: selectedPackageObj || null,
        depositRequired: isTV ? withDeposit : (dep?.required || false),
        depositAmount: isTV ? tvMonthly : (dep?.amount || 0),
        isFirstMonthPayment: isTV && withDeposit,
        serviceLabel: svc,
        isQuoteOnly,
        customerZip: zip,
        depositPaid: withDeposit,
        ...(customerPhotos ? { photos: customerPhotos } : {}),
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
      if (isEmployee) {
        queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
        queryClient.invalidateQueries({ queryKey: ["/api/leads/my-jobs"] });
        queryClient.invalidateQueries({ queryKey: ["/api/leads/available"] });
        botSay("✅ Lead added! The job has been saved to the system. You'll earn rewards when it's confirmed and completed.");
        onSuccess?.();
      } else if (isQuoteOnly) {
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
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
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
    setPhotos([]);
  }

  const isDone = stepIdx >= visibleSteps.length;
  const progress = isDone ? 100 : Math.round((stepIdx / visibleSteps.length) * 100);

  const svc = getServiceLabel(answers.serviceType || "");
  const isQuoteOnly = QUOTE_ONLY_SERVICES.includes(svc);
  const DEPOSIT_AMOUNT = depositInfo?.amount ?? 100;
  const isTrashValet = isTrashValetService(answers);
  // For trash valet the "deposit" is actually the first month's subscription cost
  const firstMonthCost = selectedPackageObj?.minPrice ?? (pendingQuote as any)?.finalMonthlyPrice ?? 0;

  const phase = submitted ? "submitted" : (quoteVisible && pendingQuote ? (isEmployee ? "employee_submit" : "deposit") : null);

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

            {/* Selected package summary — shown after package step is done */}
            {selectedPackageObj && (
              <div className="bg-teal-900/30 border border-teal-500/40 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="h-4 w-4 text-teal-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">{selectedPackageObj.label}</p>
                    {selectedPackageObj.crew && selectedPackageObj.hours && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1 text-[11px] text-slate-400"><Users className="h-2.5 w-2.5" />{selectedPackageObj.crew} movers</span>
                        <span className="flex items-center gap-1 text-[11px] text-slate-400"><Clock className="h-2.5 w-2.5" />{selectedPackageObj.hours} hrs</span>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-sm font-bold text-teal-300 shrink-0">
                  {selectedPackageObj.minPrice !== selectedPackageObj.maxPrice
                    ? `$${selectedPackageObj.minPrice}–$${selectedPackageObj.maxPrice}`
                    : `$${selectedPackageObj.minPrice.toLocaleString()}`}
                </p>
              </div>
            )}
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

                {isTrashValet ? (
                  <div className="bg-slate-900/60 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-white">${firstMonthCost}/mo</p>
                    <p className="text-sm text-slate-400 mt-1">First Month's Service</p>
                    <p className="text-xs text-slate-500 mt-2">Pay now to lock in your spot · No contract · Cancel anytime</p>
                  </div>
                ) : (
                  <div className="bg-slate-900/60 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-white">${DEPOSIT_AMOUNT}</p>
                    <p className="text-sm text-slate-400 mt-1">Appointment Deposit</p>
                    <p className="text-xs text-slate-500 mt-2">Applied toward your final invoice · Fully refundable if rescheduled 24 hrs in advance</p>
                  </div>
                )}

                {selectedPackageObj && (
                  <div className="flex items-center justify-between bg-slate-800/60 rounded-xl px-3 py-2.5">
                    <span className="text-sm text-slate-300">{isTrashValet ? "Selected Plan" : "Selected Package"}</span>
                    <span className="text-sm font-semibold text-teal-300">{selectedPackageObj.label}</span>
                  </div>
                )}

                <div className="flex items-start gap-2 bg-blue-900/20 border border-blue-500/20 rounded-lg px-3 py-2">
                  <span className="text-base shrink-0">🔍</span>
                  <p className="text-xs text-slate-300">
                    {isTrashValet
                      ? <>After submitting, Darrell confirms your first pickup date. <strong className="text-white">An invoice for your first month is emailed instantly.</strong> Service begins once payment clears.</>
                      : <>After submitting, Darrell reviews your request and sends a <strong className="text-white">finalized invoice to your email</strong>. Payment locks in your spot on the schedule.</>
                    }
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
                    ) : isTrashValet ? (
                      <><CreditCard className="h-4 w-4 mr-2" />Pay First Month — ${firstMonthCost}</>
                    ) : (
                      <><CreditCard className="h-4 w-4 mr-2" />Send ${DEPOSIT_AMOUNT} Deposit Invoice &amp; Confirm</>
                    )}
                  </Button>
                  <p className="text-[11px] text-slate-500 text-center px-2">
                    {isTrashValet
                      ? "Invoice emailed instantly · No contract · Cancel anytime"
                      : "Invoice emailed instantly · Applied toward final balance · Refundable with 24 hr notice"
                    }
                  </p>
                  <Button
                    variant="ghost"
                    onClick={handleSkipDeposit}
                    disabled={submitMutation.isPending}
                    className="w-full text-slate-400 hover:text-slate-200 text-xs py-2"
                  >
                    {submitMutation.isPending ? "Submitting…" : isTrashValet ? "Submit without paying — we'll invoice you" : "Skip deposit — submit for review only"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PHASE: Employee Submit ── */}
        {phase === "employee_submit" && pendingQuote && (
          <div className="mx-1 mt-2">
            <div className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-900/20 to-slate-900/60 overflow-hidden">
              <div className="px-4 pt-4 pb-4 space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-orange-400" />
                  <span className="text-sm font-bold text-orange-300 uppercase tracking-wide">Ready to Submit Lead</span>
                </div>
                <p className="text-xs text-slate-400">
                  Review the details above and tap below to add this lead to the system. You'll earn rewards when the job is confirmed and completed.
                </p>
                <Button
                  onClick={() => submitMutation.mutate(false)}
                  disabled={submitMutation.isPending}
                  className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold py-3 rounded-xl text-sm"
                >
                  {submitMutation.isPending ? "Submitting…" : "Submit Job Request"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── PHASE: Submitted ── */}
        {phase === "submitted" && (
          <div className="mx-1 mt-2">
            <div className="rounded-2xl border border-green-500/30 bg-gradient-to-br from-green-900/20 via-slate-900/80 to-slate-900 overflow-hidden">

              {/* Hero confirmation bar */}
              <div className="bg-green-500/10 border-b border-green-500/20 px-4 py-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <p className="font-extrabold text-white text-base leading-tight">
                    Request Confirmed!
                  </p>
                  <p className="text-xs text-green-300 mt-0.5">
                    {depositPaid ? "Deposit invoice is on its way to your email." : "We received your request — Darrell will be in touch soon."}
                  </p>
                </div>
              </div>

              <div className="px-4 py-4 space-y-3">

                {/* Placeholder estimate range */}
                {pendingQuote && (
                  <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 px-4 py-3 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Starting Estimate</p>
                    <p className="text-2xl font-extrabold text-white">
                      {pendingQuote.minPrice === pendingQuote.maxPrice
                        ? <>~${pendingQuote.minPrice.toLocaleString()}</>
                        : <>${pendingQuote.minPrice.toLocaleString()} – ${pendingQuote.maxPrice.toLocaleString()}</>
                      }
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Starting estimate — Darrell will confirm the final price after reviewing your request.
                    </p>
                    <div className="mt-2 bg-amber-900/20 border border-amber-500/20 rounded-lg px-3 py-2 text-left">
                      <p className="text-[10px] text-amber-400 font-semibold mb-0.5">⚠️ Things that can influence the final price:</p>
                      <p className="text-[10px] text-slate-400">
                        {isHandymanService(answers)
                          ? "Deeper projects · Larger repairs · Specialty or hard-to-find materials — all can affect the final price"
                          : isJunkService(answers)
                            ? "Tires · Mattresses · TVs · Hazardous materials — final cost determined on-site"
                            : isMovingService(answers)
                              ? "Long distances · Extra stops · Heavy specialty items · Stairs or no elevator — all can affect the final price"
                              : "Scope of work · Special materials · Site conditions — final price confirmed by Darrell"}
                      </p>
                    </div>
                  </div>
                )}

                {/* Deposit invoice link */}
                {depositInvoiceUrl && (
                  <a href={depositInvoiceUrl} target="_blank" rel="noopener noreferrer" className="block">
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
                      <div className="text-left">
                        <p className="text-sm font-semibold text-orange-300">Open Deposit Invoice</p>
                        <p className="text-xs text-slate-400">Pay ${DEPOSIT_AMOUNT} to lock in your spot</p>
                      </div>
                      <CreditCard className="h-5 w-5 text-orange-400 shrink-0" />
                    </div>
                  </a>
                )}

                {/* What happens next */}
                <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2.5">What Happens Next</p>
                  <div className="space-y-2">
                    {[
                      depositPaid
                        ? "Pay the deposit invoice sent to your email — this locks in your spot"
                        : "Darrell reviews your request (typically within 2–4 hours)",
                      "We contact you to schedule a free on-site or virtual estimate",
                      "You receive a personalized quote with your confirmed price",
                      "Pay the invoice to lock in your date — crew is dispatched automatically ✅",
                    ].map((step, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <p className="text-xs text-slate-300 leading-snug">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Contact reminder */}
                <p className="text-[11px] text-slate-500 text-center px-2">
                  Questions? Call or text us at{" "}
                  <a href="tel:+19062859312" className="text-slate-300 underline">(906) 285-9312</a>
                </p>

                {onClose && showClose && (
                  <Button variant="outline" size="sm" onClick={onClose} className="w-full border-slate-600 text-slate-300 hover:bg-slate-800">
                    Done <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                )}

                <BookingConfirmedTiles />
              </div>
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

          {/* PHOTO UPLOAD (employee only) */}
          {currentStep.type === "photo_upload" && (
            <div className="space-y-3">
              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map(photo => (
                    <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden bg-slate-800 ring-2 ring-slate-700">
                      <img src={photo.dataUrl} alt={photo.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 shadow-lg"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {photos.length < 5 && (
                <label className="cursor-pointer block">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <div className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-600 hover:border-teal-500/50 rounded-xl transition-colors">
                    <Camera className="h-5 w-5 text-slate-400" />
                    <span className="text-sm text-slate-400">
                      {photos.length === 0 ? "Tap to add photos" : `Add more (${5 - photos.length} remaining)`}
                    </span>
                  </div>
                </label>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePhotoStepContinue}
                  className="border-slate-600 text-slate-400 hover:bg-slate-800 flex-1"
                >
                  {photos.length === 0 ? "Skip — no photos" : "Continue"}
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* PACKAGE SELECT */}
          {currentStep.type === "package_select" && crewPackages.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-200 mb-1">Choose your crew package:</p>
              {crewPackages.map((pkg) => {
                const isSel = selectedPackageObj?.id === pkg.id;
                return (
                  <button
                    key={pkg.id}
                    onClick={() => handlePackageSelect(pkg)}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                      isSel
                        ? "border-teal-500 bg-teal-900/30"
                        : "border-slate-700/60 bg-slate-800/60 hover:border-teal-500/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {isSel
                          ? <CheckCircle2 className="h-4 w-4 text-teal-400 shrink-0" />
                          : <div className="h-4 w-4 rounded-full border-2 border-slate-600 shrink-0" />}
                        <span className="text-sm font-semibold text-white">{pkg.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {pkg.tag && <Badge className="text-[10px] bg-teal-700/60 text-teal-200 border-0">{pkg.tag}</Badge>}
                        {pkg.originalPrice !== undefined && (
                          <span className="text-xs text-slate-500 line-through">${pkg.originalPrice}</span>
                        )}
                        <span className="text-sm font-bold text-teal-300">
                          {pkg.minPrice === pkg.maxPrice
                            ? `$${pkg.minPrice}`
                            : `$${pkg.minPrice}–$${pkg.maxPrice}`}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 pl-6">{pkg.desc}</p>
                  </button>
                );
              })}
              <Button
                onClick={handlePackageContinue}
                disabled={!selectedPackageObj}
                className="w-full bg-gradient-to-r from-teal-600 to-blue-600 hover:from-teal-500 hover:to-blue-500 text-white font-semibold py-2.5 rounded-xl text-sm mt-1"
                size="sm"
              >
                Continue with {selectedPackageObj ? `"${selectedPackageObj.label}"` : "a package"} <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
