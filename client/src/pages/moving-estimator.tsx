import { useState, useRef, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PRICING_BASE } from "@shared/pricing";
import {
  ArrowLeft, Truck, Package2, Users, Clock,
  RotateCcw, ChevronRight, Star, AlertCircle, MapPin,
  Navigation, Send, Loader2, ChevronDown, ChevronUp, Settings,
  Plus, Trash2, GripVertical
} from "lucide-react";

// ── Fixed geo constants ─────────────────────────────────────────────────────
const BASE_ZIP = "49938";
const BASE_LAT = 46.4539;
const BASE_LNG = -90.1715;
const BASE_CITY = "Ironwood, MI";

// ── Pricing type (mirrors /api/pricing response) ────────────────────────────
interface CustomItem { id: string; name: string; value: number; }

interface Pricing {
  ratePerMoverHour: number;
  shortJobRate: number;
  shortJobFull: number;
  jc222Price: number;
  driveSpeedMph: number;
  junkSmallLow: number;
  junkSmallHigh: number;
  junkLargeLow: number;
  junkLargeHigh: number;
  customItems: CustomItem[];
  junkAddons: CustomItem[];
}

const DEFAULT_PRICING: Pricing = {
  ratePerMoverHour: PRICING_BASE.laborRatePerMoverHour,
  shortJobRate: 150,
  shortJobFull: 300,
  jc222Price: 272,
  driveSpeedMph: 50,
  junkSmallLow: 170,
  junkSmallHigh: 200,
  junkLargeLow: 200,
  junkLargeHigh: 600,
  customItems: [],
  junkAddons: [],
};

// ── Types ──────────────────────────────────────────────────────────────────
type Service = "moving" | "junk";
type TruckSize = "small" | "large";
type LoadType = "loadOnly" | "loadUnload";
type JunkSize = "small" | "large";

interface ZipInfo { zip: string; city: string; lat: number; lng: number; }
interface DriveInfo {
  pickupMiles: number;
  dropoffMiles: number;
  returnMiles: number;
  totalMiles: number;
  totalDriveHours: number;
}

interface Sel {
  service?: Service;
  hasTruck?: boolean;
  truckSize?: TruckSize;
  loadType?: LoadType;
  stairs?: boolean;
  junkSize?: JunkSize;
  pickup?: ZipInfo;
  dropoff?: ZipInfo;
  driveInfo?: DriveInfo;
}

interface Option { movers: number; hours: number; tag?: string; }
type MsgRole = "bot" | "user";
interface Msg {
  role: MsgRole;
  text: string;
  choices?: { label: string; value: string; icon?: string }[];
  isResult?: boolean;
  isZipInput?: "pickup" | "dropoff";
}

// ── Math helpers ───────────────────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function roundHalf(n: number) { return Math.ceil(n * 2) / 2; }
function roundTenth(n: number) { return Math.round(n * 10) / 10; }

const LOCAL_ROUND_TRIP_THRESHOLD = 5;
const LOCAL_FLAT_DRIVE_HOURS = 0.15;

function computeDrive(sel: Sel, driveSpeedMph = 50): DriveInfo | undefined {
  if (!sel.pickup) return undefined;
  const p = sel.pickup;
  const pickupMiles = haversine(BASE_LAT, BASE_LNG, p.lat, p.lng);
  if (sel.loadType === "loadOnly" || !sel.dropoff) {
    const total = pickupMiles * 2;
    const isLocal = total < LOCAL_ROUND_TRIP_THRESHOLD;
    const totalDriveHours = isLocal ? LOCAL_FLAT_DRIVE_HOURS : roundTenth(total / driveSpeedMph);
    return { pickupMiles, dropoffMiles: 0, returnMiles: pickupMiles, totalMiles: total, totalDriveHours };
  }
  const d = sel.dropoff;
  const dropoffMiles = haversine(p.lat, p.lng, d.lat, d.lng);
  const returnMiles = haversine(d.lat, d.lng, BASE_LAT, BASE_LNG);
  const total = pickupMiles + dropoffMiles + returnMiles;
  const isLocal = total < LOCAL_ROUND_TRIP_THRESHOLD;
  const totalDriveHours = isLocal ? LOCAL_FLAT_DRIVE_HOURS : roundTenth(total / driveSpeedMph);
  return { pickupMiles, dropoffMiles, returnMiles, totalMiles: total, totalDriveHours };
}

function isShortJob(sel: Sel): boolean {
  return sel.service === "moving" && sel.hasTruck === true && sel.truckSize === "small" && sel.loadType === "loadOnly";
}

function getOptions(sel: Sel): Option[] {
  const bonus = sel.stairs ? 1 : 0;
  if (sel.service !== "moving") return [];
  if (sel.hasTruck === false) {
    return [{ movers: 2 + bonus, hours: 2 }, { movers: 3 + bonus, hours: 2, tag: "Most Popular" }, { movers: 4 + bonus, hours: 2, tag: "Fastest" }];
  }
  if (sel.truckSize === "small" && sel.loadType === "loadOnly")
    return [{ movers: 2 + bonus, hours: 2, tag: "JC272 Available" }];
  if (sel.truckSize === "large" && sel.loadType === "loadOnly")
    return [{ movers: 2 + bonus, hours: 4 }, { movers: 3 + bonus, hours: 3, tag: "Most Popular" }, { movers: 4 + bonus, hours: 2, tag: "Fastest" }];
  if (sel.loadType === "loadUnload")
    return [{ movers: 2 + bonus, hours: 6 }, { movers: 3 + bonus, hours: 4, tag: "Most Popular" }, { movers: 4 + bonus, hours: 3, tag: "Fastest" }];
  return [];
}

// ── Build chat message list ────────────────────────────────────────────────
function buildMessages(sel: Sel, skipServiceSelect = false): Msg[] {
  const msgs: Msg[] = [];

  if (!skipServiceSelect) {
    msgs.push({
      role: "bot",
      text: "Hi! I'm your moving estimate assistant 🚛\n\nLet's figure out your crew, time, and drive cost. What service do you need?",
      choices: [
        { label: "Moving Help", value: "moving", icon: "🚛" },
        { label: "Junk Removal", value: "junk", icon: "♻️" },
      ],
    });
    if (!sel.service) return msgs;
    msgs.push({ role: "user", text: sel.service === "moving" ? "🚛 Moving Help" : "♻️ Junk Removal" });
  } else {
    msgs.push({
      role: "bot",
      text: "Hi! I'm your moving estimate assistant 🚛\n\nLet's get your Moving Help estimate. Labor only, or do you need a truck too?",
      choices: [
        { label: "Labor Only", value: "laborOnly", icon: "💪" },
        { label: "Labor + Truck", value: "laborTruck", icon: "🚛" },
      ],
    });
    if (sel.hasTruck === undefined) return msgs;
  }

  if (sel.service === "junk") {
    msgs.push({
      role: "bot",
      text: "How much junk are we talking about?",
      choices: [
        { label: "Small Load (pickup truck)", value: "small", icon: "📦" },
        { label: "Full Truckload", value: "large", icon: "🚛" },
      ],
    });
    if (!sel.junkSize) return msgs;
    msgs.push({ role: "user", text: sel.junkSize === "small" ? "📦 Small Load" : "🚛 Full Truckload" });
    msgs.push({
      role: "bot",
      text: "What's the zip code for the pickup location? (We'll calculate drive time from our Ironwood, MI base.)",
      isZipInput: "pickup",
    });
    if (!sel.pickup) return msgs;
    msgs.push({ role: "user", text: `📍 ${sel.pickup.zip} — ${sel.pickup.city}` });
    msgs.push({ role: "bot", text: "", isResult: true });
    return msgs;
  }

  if (skipServiceSelect) {
    msgs.push({ role: "user", text: sel.hasTruck ? "🚛 Labor + Truck" : "💪 Labor Only" });

    if (sel.hasTruck) {
      msgs.push({
        role: "bot",
        text: "What size truck will you need?",
        choices: [
          { label: "Small Truck", value: "small", icon: "🚐" },
          { label: "Large Truck", value: "large", icon: "🚛" },
        ],
      });
      if (!sel.truckSize) return msgs;
      msgs.push({ role: "user", text: sel.truckSize === "small" ? "🚐 Small Truck" : "🚛 Large Truck" });

      msgs.push({
        role: "bot",
        text: "Loading only, or loading AND unloading at the destination?",
        choices: [
          { label: "Load Only", value: "loadOnly", icon: "⬆️" },
          { label: "Load & Unload", value: "loadUnload", icon: "↕️" },
        ],
      });
      if (!sel.loadType) return msgs;
      msgs.push({ role: "user", text: sel.loadType === "loadOnly" ? "⬆️ Load Only" : "↕️ Load & Unload" });
    }

    msgs.push({
      role: "bot",
      text: "Are there stairs involved at pickup or drop-off?",
      choices: [
        { label: "Yes, stairs", value: "yes", icon: "🪜" },
        { label: "No stairs", value: "no", icon: "✅" },
      ],
    });
    if (sel.stairs === undefined) return msgs;
    msgs.push({ role: "user", text: sel.stairs ? "🪜 Yes, there are stairs" : "✅ No stairs" });

    msgs.push({
      role: "bot",
      text: `What's the zip code for the PICKUP location?\n(We're based in Ironwood, MI ${BASE_ZIP} — we'll calculate exact drive time from there.)`,
      isZipInput: "pickup",
    });
    if (!sel.pickup) return msgs;
    msgs.push({ role: "user", text: `📍 ${sel.pickup.zip} — ${sel.pickup.city}` });

    if (sel.hasTruck && sel.loadType === "loadUnload") {
      msgs.push({
        role: "bot",
        text: "And the zip code for the DROP-OFF location?",
        isZipInput: "dropoff",
      });
      if (!sel.dropoff) return msgs;
      msgs.push({ role: "user", text: `📍 ${sel.dropoff.zip} — ${sel.dropoff.city}` });
    }

    msgs.push({ role: "bot", text: "", isResult: true });
    return msgs;
  }

  msgs.push({
    role: "bot",
    text: "What size truck will you need?",
    choices: [
      { label: "Small Truck", value: "small", icon: "🚐" },
      { label: "Large Truck", value: "large", icon: "🚛" },
    ],
  });
  if (!sel.truckSize) return msgs;
  msgs.push({ role: "user", text: sel.truckSize === "small" ? "🚐 Small Truck" : "🚛 Large Truck" });

  msgs.push({
    role: "bot",
    text: "Loading only, or loading AND unloading at the destination?",
    choices: [
      { label: "Load Only", value: "loadOnly", icon: "⬆️" },
      { label: "Load & Unload", value: "loadUnload", icon: "↕️" },
    ],
  });
  if (!sel.loadType) return msgs;
  msgs.push({ role: "user", text: sel.loadType === "loadOnly" ? "⬆️ Load Only" : "↕️ Load & Unload" });

  msgs.push({
    role: "bot",
    text: "Are there stairs involved at pickup or drop-off?",
    choices: [
      { label: "Yes, stairs", value: "yes", icon: "🪜" },
      { label: "No stairs", value: "no", icon: "✅" },
    ],
  });
  if (sel.stairs === undefined) return msgs;
  msgs.push({ role: "user", text: sel.stairs ? "🪜 Yes, there are stairs" : "✅ No stairs" });

  msgs.push({
    role: "bot",
    text: `What's the zip code for the PICKUP location?\n(We're based in Ironwood, MI ${BASE_ZIP} — we'll calculate exact drive time from there.)`,
    isZipInput: "pickup",
  });
  if (!sel.pickup) return msgs;
  msgs.push({ role: "user", text: `📍 ${sel.pickup.zip} — ${sel.pickup.city}` });

  if (sel.loadType === "loadUnload") {
    msgs.push({
      role: "bot",
      text: "And the zip code for the DROP-OFF location?",
      isZipInput: "dropoff",
    });
    if (!sel.dropoff) return msgs;
    msgs.push({ role: "user", text: `📍 ${sel.dropoff.zip} — ${sel.dropoff.city}` });
  }

  msgs.push({ role: "bot", text: "", isResult: true });
  return msgs;
}

// ── Sub-components ─────────────────────────────────────────────────────────
function DriveBreakdown({ drive, sel }: { drive: DriveInfo; sel: Sel }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-900/15 p-3 space-y-2 text-sm">
      <div className="flex items-center gap-2 font-semibold text-amber-300">
        <Navigation className="h-4 w-4" />
        Drive Time Breakdown
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>From {BASE_CITY}</span>
        <span className="text-slate-200">→ {sel.pickup?.city} ({Math.round(drive.pickupMiles)} mi)</span>
        {sel.loadType === "loadUnload" && sel.dropoff && <>
          <span>Pickup → Drop-off</span>
          <span className="text-slate-200">→ {sel.dropoff.city} ({Math.round(drive.dropoffMiles)} mi)</span>
        </>}
        <span>Return to {BASE_CITY}</span>
        <span className="text-slate-200">({Math.round(drive.returnMiles)} mi)</span>
        <span className="font-semibold text-amber-300 pt-1 border-t border-amber-700/30">Total drive</span>
        <span className="text-amber-300 font-semibold pt-1 border-t border-amber-700/30">
          {Math.round(drive.totalMiles)} mi · {drive.totalDriveHours} hr{drive.totalDriveHours !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

function Disclaimer({ drive, shortJob, pricing }: { drive?: DriveInfo; shortJob?: boolean; pricing: Pricing }) {
  return (
    <p className="text-xs text-slate-400 flex items-start gap-1.5">
      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-yellow-400" />
      {shortJob
        ? `Short job flat rate $${pricing.shortJobRate}/hr ($${pricing.shortJobFull} total). Use code JC272 for $${pricing.jc222Price}.`
        : `Standard rate $${pricing.ratePerMoverHour}/mover/hr for 3–4 hr jobs.`}
      {drive ? ` Drive time at ${pricing.driveSpeedMph} mph avg.` : ""} Confirmed at booking.
    </p>
  );
}

function BookNowButton({ label, href, promo = false, compact = false }: { label: string; href: string; promo?: boolean; compact?: boolean }) {
  return (
    <Link href={href}>
      <Button
        className={`w-full font-bold ${compact ? "text-xs py-2" : "text-sm py-2.5"} ${
          promo
            ? "bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white"
            : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
        }`}
      >
        {label} <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </Link>
  );
}

function ResultCard({ sel, pricing, compact = false }: { sel: Sel; pricing: Pricing; compact?: boolean }) {
  const drive = sel.driveInfo;
  const bookUrl = "/book?service=residential";

  if (sel.service === "junk") {
    const isSmall = sel.junkSize === "small";
    const laborLow  = isSmall ? pricing.junkSmallLow  : pricing.junkLargeLow;
    const laborHigh = isSmall ? pricing.junkSmallHigh : pricing.junkLargeHigh;
    const driveCost = drive ? drive.totalDriveHours * 2 * pricing.ratePerMoverHour : 0;
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-300 font-semibold">Your junk removal estimate:</p>
        {drive && <DriveBreakdown drive={drive} sel={sel} />}
        <div className="rounded-xl overflow-hidden border border-emerald-500/40">
          <div className="bg-emerald-900/40 px-4 py-3 flex items-center gap-2">
            <Package2 className="h-4 w-4 text-emerald-400" />
            <span className="font-semibold text-emerald-200">{isSmall ? "Small Load" : "Full Truckload"}</span>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3 text-sm">
            <div className="text-slate-400">Crew</div>
            <div className="text-white font-semibold">{isSmall ? "2 movers" : "2–3 movers"}</div>
            <div className="text-slate-400">Labor estimate</div>
            <div className="text-white font-semibold">${laborLow}–${laborHigh}</div>
            {drive && <>
              <div className="text-slate-400">Drive time</div>
              <div className="text-white font-semibold">{drive.totalDriveHours} hr{drive.totalDriveHours !== 1 ? "s" : ""} ({Math.round(drive.totalMiles)} mi)</div>
              <div className="text-slate-400">Drive cost (2 movers)</div>
              <div className="text-amber-400 font-semibold">+${driveCost.toLocaleString()}</div>
              <div className="text-slate-400 font-semibold">Total estimate</div>
              <div className="text-emerald-400 font-bold text-base">${(laborLow + driveCost).toLocaleString()}–${(laborHigh + driveCost).toLocaleString()}</div>
            </>}
          </div>
          <div className="px-4 pb-4">
            <BookNowButton label="Book Junk Removal" href="/book?service=junk" compact={compact} />
          </div>
        </div>
        {pricing.junkAddons.length > 0 && (
          <div className="rounded-xl border border-orange-500/40 overflow-hidden">
            <div className="bg-orange-900/30 px-3 py-2.5 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-400 shrink-0" />
              <span className="text-orange-200 text-xs font-semibold uppercase tracking-wide">Heavy Item Surcharges — Not Included in Estimate Above</span>
            </div>
            {pricing.junkAddons.map(item => (
              <div key={item.id} className="border-t border-orange-500/20 px-3 py-2.5 flex justify-between items-center text-sm bg-orange-950/20">
                <span className="text-slate-200">{item.name}</span>
                <span className="text-orange-400 font-semibold">+${item.value.toLocaleString()}</span>
              </div>
            ))}
            <div className="border-t border-orange-500/20 px-3 py-2 text-xs text-orange-300/70 bg-orange-950/10">
              These items require extra labor and disposal fees. Please let us know when booking.
            </div>
          </div>
        )}
        {pricing.customItems.length > 0 && (
          <div className="rounded-xl border border-slate-700/60 overflow-hidden">
            <div className="bg-slate-800/80 px-3 py-2 text-slate-400 text-xs uppercase tracking-wide font-medium">Additional Services</div>
            {pricing.customItems.map(item => (
              <div key={item.id} className="border-t border-slate-700/40 px-3 py-2.5 flex justify-between items-center text-sm">
                <span className="text-slate-200">{item.name}</span>
                <span className="text-emerald-400 font-semibold">+${item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
        <Disclaimer pricing={pricing} drive={drive} />
      </div>
    );
  }

  const options = getOptions(sel);
  if (!options.length) return null;

  const shortJob = isShortJob(sel);
  const opt0 = options[0];
  const driveCost0 = drive ? Math.round(drive.totalDriveHours * opt0.movers * pricing.ratePerMoverHour) : 0;

  if (shortJob) {
    const fullTotal  = pricing.shortJobFull + driveCost0;
    const promoTotal = pricing.jc222Price   + driveCost0;
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-300 font-semibold">
          Your moving estimate{sel.stairs ? " (+1 mover for stairs)" : ""}:
        </p>
        {drive && <DriveBreakdown drive={drive} sel={sel} />}
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-900/15 p-3 text-xs text-yellow-200 space-y-1">
          <p className="font-semibold text-yellow-300 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> Short Job Rate Applies
          </p>
          <p className="text-yellow-200/80">Jobs under 3 hours with 2 movers are billed at <span className="font-semibold text-white">${pricing.shortJobRate}/hr flat</span> — to unlock the ${pricing.ratePerMoverHour}/mover/hr rate, book a large truck or a load & unload job.</p>
        </div>
        <div className="rounded-xl overflow-hidden border border-slate-700/60 divide-y divide-slate-700/40">
          <div className="px-4 py-4 flex items-center justify-between bg-slate-800/60">
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Standard Rate</p>
              <p className="text-sm text-slate-300">
                <Users className="h-3.5 w-3.5 inline text-teal-400 mr-1" />{opt0.movers} movers ·
                <Clock className="h-3.5 w-3.5 inline text-blue-400 mx-1" />{opt0.hours} hrs
              </p>
              <p className="text-xs text-slate-500 mt-0.5">${pricing.shortJobRate}/hr flat{drive ? ` · +$${driveCost0} drive` : ""}</p>
            </div>
            <div className="text-right shrink-0 ml-3">
              <p className="text-slate-400 line-through text-sm">${fullTotal.toLocaleString()}</p>
            </div>
          </div>
          <div className="px-4 pt-3 pb-4 bg-gradient-to-br from-teal-900/40 to-emerald-900/30">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Badge className="bg-teal-500/30 text-teal-300 border-teal-500/50 font-mono font-bold text-sm px-2">JC272</Badge>
                  <span className="text-teal-300 text-xs font-semibold">Promo Price</span>
                </div>
                <p className="text-xs text-slate-400">
                  <Users className="h-3 w-3 inline text-teal-400 mr-1" />{opt0.movers} movers ·
                  <Clock className="h-3 w-3 inline text-blue-400 mx-1" />{opt0.hours} hrs{drive ? ` · +$${driveCost0} drive` : ""}
                </p>
              </div>
              <div className="text-right ml-3">
                <p className="text-emerald-400 font-black text-2xl leading-none">${promoTotal.toLocaleString()}</p>
                <p className="text-emerald-600 text-xs mt-0.5">Save ${fullTotal - promoTotal}</p>
              </div>
            </div>
            <BookNowButton label="Book Now — JC272 Promo" href={bookUrl} promo compact={compact} />
          </div>
          <div className="px-4 pt-3 pb-4 bg-slate-800/40">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-slate-400 text-xs uppercase tracking-wide mb-0.5">Standard Booking</p>
                <p className="text-xs text-slate-400">
                  <Users className="h-3 w-3 inline text-teal-400 mr-1" />{opt0.movers} movers ·
                  <Clock className="h-3 w-3 inline text-blue-400 mx-1" />{opt0.hours} hrs{drive ? ` · +$${driveCost0} drive` : ""}
                </p>
              </div>
              <div className="text-right ml-3">
                <p className="text-slate-200 font-bold text-xl leading-none">${fullTotal.toLocaleString()}</p>
              </div>
            </div>
            <BookNowButton label={`Book Now — Standard ($${fullTotal.toLocaleString()})`} href={bookUrl} compact={compact} />
          </div>
        </div>
        {pricing.customItems.length > 0 && (
          <div className="rounded-xl border border-slate-700/60 overflow-hidden">
            <div className="bg-slate-800/80 px-3 py-2 text-slate-400 text-xs uppercase tracking-wide font-medium">Additional Services</div>
            {pricing.customItems.map(item => (
              <div key={item.id} className="border-t border-slate-700/40 px-3 py-2.5 flex justify-between items-center text-sm">
                <span className="text-slate-200">{item.name}</span>
                <span className="text-emerald-400 font-semibold">+${item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
        <Disclaimer pricing={pricing} drive={drive} shortJob />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-300 font-semibold">
        Your moving estimate{sel.stairs ? " (stairs: +1 mover)" : ""}:
      </p>
      {drive && <DriveBreakdown drive={drive} sel={sel} />}
      <div className="flex items-center gap-2 text-xs text-teal-300">
        <Star className="h-3.5 w-3.5 text-teal-400" />
        <span>Qualifies for <span className="font-bold">${pricing.ratePerMoverHour}/mover/hr</span> standard rate</span>
      </div>
      <div className="space-y-3">
        {options.map((opt, i) => {
          const labor = opt.movers * opt.hours * pricing.ratePerMoverHour;
          const driveCost = drive ? Math.round(drive.totalDriveHours * opt.movers * pricing.ratePerMoverHour) : 0;
          const total = labor + driveCost;
          const isPopular = opt.tag === "Most Popular";
          return (
            <div key={i} className={`rounded-xl border overflow-hidden ${isPopular ? "border-teal-500/50" : "border-slate-700/60"}`}>
              <div className={`px-4 pt-3 pb-1 ${isPopular ? "bg-teal-900/30" : "bg-slate-800/60"}`}>
                <div className="flex items-start justify-between">
                  <div>
                    {opt.tag && (
                      <Badge className={`mb-1.5 text-[10px] px-1.5 py-0.5 ${isPopular ? "bg-teal-600/40 text-teal-300 border-teal-500/40" : "bg-slate-700/50 text-slate-400 border-slate-600/40"}`}>
                        {isPopular && <Star className="h-2 w-2 mr-0.5" />}{opt.tag}
                      </Badge>
                    )}
                    <div className="flex items-center gap-3 text-sm">
                      <span className="flex items-center gap-1 text-white font-semibold">
                        <Users className="h-3.5 w-3.5 text-teal-400" /> {opt.movers} movers
                      </span>
                      <span className="flex items-center gap-1 text-slate-300">
                        <Clock className="h-3.5 w-3.5 text-blue-400" /> {opt.hours} hrs
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <span>Labor: <span className="text-slate-200">${labor.toLocaleString()}</span></span>
                      {drive && <span>· Drive: <span className="text-amber-400">+${driveCost.toLocaleString()}</span></span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className={`font-black text-2xl leading-none ${isPopular ? "text-emerald-400" : "text-slate-200"}`}>${total.toLocaleString()}</p>
                    <p className="text-xs text-slate-500 mt-0.5">total</p>
                  </div>
                </div>
              </div>
              <div className={`px-4 pb-3 pt-2 ${isPopular ? "bg-teal-900/20" : "bg-slate-800/40"}`}>
                <BookNowButton label={`Book Now — ${opt.movers} Movers ($${total.toLocaleString()})`} href={bookUrl} promo={isPopular} compact={compact} />
              </div>
            </div>
          );
        })}
      </div>
      {pricing.customItems.length > 0 && (
        <div className="rounded-xl border border-slate-700/60 overflow-hidden">
          <div className="bg-slate-800/80 px-3 py-2 text-slate-400 text-xs uppercase tracking-wide font-medium">Additional Services</div>
          {pricing.customItems.map(item => (
            <div key={item.id} className="border-t border-slate-700/40 px-3 py-2.5 flex justify-between items-center text-sm">
              <span className="text-slate-200">{item.name}</span>
              <span className="text-emerald-400 font-semibold">+${item.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
      <Disclaimer pricing={pricing} drive={drive} />
    </div>
  );
}

// ── Zip fetcher ────────────────────────────────────────────────────────────
async function fetchZip(zip: string): Promise<ZipInfo> {
  const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (!res.ok) throw new Error("Zip not found");
  const data = await res.json();
  const place = data.places[0];
  return {
    zip,
    city: `${place["place name"]}, ${place["state abbreviation"]}`,
    lat: parseFloat(place.latitude),
    lng: parseFloat(place.longitude),
  };
}

// ── Shared chat logic hook ─────────────────────────────────────────────────
function useChatLogic(pricing: Pricing, skipServiceSelect = false) {
  const initialSel: Sel = skipServiceSelect ? { service: "moving" } : {};
  const [sel, setSel] = useState<Sel>(initialSel);
  const [zipInput, setZipInput] = useState("");
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = buildMessages(sel, skipServiceSelect);
  const isComplete = messages.some(m => m.isResult);
  const activeZipStep = !isComplete ? messages.findLast(m => m.isZipInput)?.isZipInput : undefined;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleChoice(step: string, value: string) {
    if (step === "service") setSel({ service: value as Service });
    else if (step === "hasTruck") setSel(s => ({ ...s, hasTruck: value === "laborTruck" }));
    else if (step === "truckSize") setSel(s => ({ ...s, truckSize: value as TruckSize }));
    else if (step === "loadType") setSel(s => ({ ...s, loadType: value as LoadType }));
    else if (step === "stairs") setSel(s => ({ ...s, stairs: value === "yes" }));
    else if (step === "junkSize") setSel(s => ({ ...s, junkSize: value as JunkSize }));
  }

  function getStepKey(msgIndex: number): string {
    const botChoiceMsgs = messages.slice(0, msgIndex + 1).filter(m => m.role === "bot" && m.choices);
    const idx = botChoiceMsgs.length - 1;
    if (skipServiceSelect) {
      if (sel.service === "moving") {
        if (sel.hasTruck) return (["hasTruck", "truckSize", "loadType", "stairs"] as const)[idx] ?? "hasTruck";
        return (["hasTruck", "stairs"] as const)[idx] ?? "hasTruck";
      }
      return (["junkSize"] as const)[idx] ?? "junkSize";
    }
    if (sel.service === "moving") return (["service", "truckSize", "loadType", "stairs"] as const)[idx] ?? "service";
    return (["service", "junkSize"] as const)[idx] ?? "service";
  }

  async function handleZipSubmit() {
    const zip = zipInput.trim().replace(/\D/g, "").slice(0, 5);
    if (zip.length !== 5) { setZipError("Please enter a valid 5-digit zip code."); return; }
    setZipLoading(true);
    setZipError("");
    try {
      const info = await fetchZip(zip);
      if (activeZipStep === "pickup") {
        setSel(s => {
          const updated = { ...s, pickup: info };
          if (s.hasTruck === false || s.loadType !== "loadUnload") updated.driveInfo = computeDrive(updated, pricing.driveSpeedMph);
          return updated;
        });
      } else if (activeZipStep === "dropoff") {
        setSel(s => {
          const updated = { ...s, dropoff: info };
          updated.driveInfo = computeDrive(updated, pricing.driveSpeedMph);
          return updated;
        });
      }
      setZipInput("");
    } catch {
      setZipError("Zip code not found. Please check and try again.");
    } finally {
      setZipLoading(false);
    }
  }

  function restart() { setSel(initialSel); setZipInput(""); setZipError(""); }

  return { sel, messages, activeZipStep, zipInput, setZipInput, zipLoading, zipError, setZipError, bottomRef, handleChoice, getStepKey, handleZipSubmit, restart };
}

// ── Chat UI (shared between embedded + full-page versions) ─────────────────
function ChatUI({
  logic,
  pricing,
  compact = false,
}: {
  logic: ReturnType<typeof useChatLogic>;
  pricing: Pricing;
  compact?: boolean;
}) {
  const { sel, messages, activeZipStep, zipInput, setZipInput, zipLoading, zipError, setZipError, bottomRef, handleChoice, getStepKey, handleZipSubmit, restart } = logic;

  return (
    <div className={compact ? "flex flex-col h-full min-h-0" : "space-y-4"}>
      {compact && Object.keys(sel).length > 0 && (
        <div className="flex justify-end mb-2 shrink-0">
          <button onClick={restart} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-teal-400 transition-colors">
            <RotateCcw className="h-3 w-3" /> Restart
          </button>
        </div>
      )}

      <div className={compact ? "flex-1 overflow-y-auto space-y-4 pr-1" : "space-y-4"}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "bot" && (
              <div className={`flex items-end gap-2 ${compact ? "max-w-[90%]" : "max-w-[88%]"}`}>
                <div className={`${compact ? "w-7 h-7" : "w-8 h-8"} rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center shrink-0 mb-1`}>
                  <Truck className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} text-white`} />
                </div>
                <div className="space-y-2 flex-1">
                  {msg.isResult ? (
                    <div className={`${compact ? "bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4" : ""}`}>
                      {!compact && <Card className="bg-slate-800/80 border-slate-700/60 p-4">
                        <ResultCard sel={sel} pricing={pricing} compact={false} />
                        <div className="mt-4">
                          <Button variant="outline" onClick={restart} className="w-full border-slate-600 text-slate-300 hover:bg-slate-700 gap-2 text-sm">
                            <RotateCcw className="h-3.5 w-3.5" /> Start Over
                          </Button>
                        </div>
                      </Card>}
                      {compact && <>
                        <ResultCard sel={sel} pricing={pricing} compact={true} />
                        <div className="mt-3">
                          <Button variant="outline" size="sm" onClick={restart} className="w-full border-slate-600 text-slate-300 hover:bg-slate-700 gap-1 text-xs">
                            <RotateCcw className="h-3 w-3" /> Start Over
                          </Button>
                        </div>
                      </>}
                    </div>
                  ) : (
                    <div className={`bg-slate-700/60 rounded-2xl rounded-tl-sm ${compact ? "px-3 py-2.5" : "px-4 py-3"} text-slate-100 text-sm leading-relaxed whitespace-pre-wrap`}>
                      {msg.text}
                      {msg.choices && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {msg.choices.map((c) => {
                            const isAnswered = i < messages.length - 1;
                            return (
                              <button
                                key={c.value}
                                disabled={isAnswered}
                                onClick={() => handleChoice(getStepKey(i), c.value)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-all
                                  ${isAnswered
                                    ? "border-slate-600/30 text-slate-600 bg-slate-800/20 cursor-default"
                                    : "border-teal-500/60 text-teal-300 bg-teal-900/30 hover:bg-teal-900/60 hover:border-teal-400 active:scale-95"
                                  }`}
                              >
                                {c.icon && <span>{c.icon}</span>}{c.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {msg.role === "user" && (
              <div className="bg-gradient-to-r from-teal-600 to-blue-600 rounded-2xl rounded-tr-sm px-3 py-2 text-white text-sm font-medium max-w-[75%]">
                {msg.text}
              </div>
            )}
          </div>
        ))}

        {Object.keys(sel).length === 0 && (
          <div className="mt-2 p-3 border border-slate-700/50 bg-slate-800/40 rounded-xl space-y-1.5">
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-teal-400 shrink-0" />
              Drive time calculated from our Ironwood, MI base
            </p>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-teal-400 shrink-0" />
              Stairs add 1 extra mover for safety
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {activeZipStep && compact && (
        <div className="mt-3 shrink-0 bg-slate-900/90 border border-slate-700/60 rounded-xl px-3 py-3">
          <p className="text-xs text-slate-400 mb-2 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-teal-400" />
            Enter the {activeZipStep === "pickup" ? "pickup" : "drop-off"} zip code
          </p>
          <div className="flex gap-2">
            <Input
              value={zipInput}
              onChange={e => { setZipInput(e.target.value.replace(/\D/g, "").slice(0, 5)); setZipError(""); }}
              onKeyDown={e => { if (e.key === "Enter") handleZipSubmit(); }}
              placeholder="e.g. 49938"
              maxLength={5}
              className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 font-mono tracking-widest text-center"
              autoFocus
            />
            <Button onClick={handleZipSubmit} disabled={zipLoading || zipInput.length !== 5} className="bg-teal-600 hover:bg-teal-700 px-4 shrink-0">
              {zipLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          {zipError && <p className="text-xs text-red-400 mt-1.5">{zipError}</p>}
        </div>
      )}
    </div>
  );
}

// ── Embeddable component (used in homepage dialog) ─────────────────────────
export function MovingEstimatorChat() {
  const { data: pricingData } = useQuery<any>({ queryKey: ["/api/pricing"], staleTime: 60000 });
  const pricing: Pricing = pricingData ? {
    ratePerMoverHour: pricingData.ratePerMoverHour ?? DEFAULT_PRICING.ratePerMoverHour,
    shortJobRate:     pricingData.shortJobRate      ?? DEFAULT_PRICING.shortJobRate,
    shortJobFull:     pricingData.shortJobFull      ?? DEFAULT_PRICING.shortJobFull,
    jc222Price:       pricingData.jc222Price        ?? DEFAULT_PRICING.jc222Price,
    driveSpeedMph:    pricingData.driveSpeedMph     ?? DEFAULT_PRICING.driveSpeedMph,
    junkSmallLow:     pricingData.junkSmallLow      ?? DEFAULT_PRICING.junkSmallLow,
    junkSmallHigh:    pricingData.junkSmallHigh     ?? DEFAULT_PRICING.junkSmallHigh,
    junkLargeLow:     pricingData.junkLargeLow      ?? DEFAULT_PRICING.junkLargeLow,
    junkLargeHigh:    pricingData.junkLargeHigh     ?? DEFAULT_PRICING.junkLargeHigh,
    customItems:      pricingData.customItems       ?? [],
    junkAddons:       pricingData.junkAddons        ?? [],
  } : DEFAULT_PRICING;

  const logic = useChatLogic(pricing, true);
  return <ChatUI logic={logic} pricing={pricing} compact />;
}

// ── Admin Pricing Editor ───────────────────────────────────────────────────
function AdminPricingEditor({ pricing }: { pricing: Pricing }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [customItems, setCustomItems] = useState<CustomItem[]>(pricing.customItems);
  const [junkAddons, setJunkAddons] = useState<CustomItem[]>(pricing.junkAddons);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newJunkName, setNewJunkName] = useState("");
  const [newJunkValue, setNewJunkValue] = useState("");

  // Sync if pricing prop changes (after API refetch)
  const customItemsRef = customItems;

  const fields: { key: string; label: string; field: keyof Omit<Pricing, "customItems" | "junkAddons">; prefix?: string; suffix?: string }[] = [
    { key: "rate_per_mover_hour", label: "Rate per mover/hr",      field: "ratePerMoverHour", prefix: "$", suffix: "/mover/hr" },
    { key: "short_job_rate",      label: "Short job flat rate",    field: "shortJobRate",     prefix: "$", suffix: "/hr" },
    { key: "short_job_full",      label: "Short job full price",   field: "shortJobFull",     prefix: "$" },
    { key: "jc222_price",         label: "JC272 promo price",      field: "jc222Price",       prefix: "$" },
    { key: "drive_speed_mph",     label: "Drive speed average",    field: "driveSpeedMph",    suffix: " mph" },
    { key: "junk_small_low",      label: "Junk small load (low)",  field: "junkSmallLow",     prefix: "$" },
    { key: "junk_small_high",     label: "Junk small load (high)", field: "junkSmallHigh",    prefix: "$" },
    { key: "junk_large_low",      label: "Junk full load (low)",   field: "junkLargeLow",     prefix: "$" },
    { key: "junk_large_high",     label: "Junk full load (high)",  field: "junkLargeHigh",    prefix: "$" },
  ];

  const saveMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/pricing/${key}`, { value: parseFloat(value) });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing"] });
      toast({ title: "✅ Pricing updated" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const saveCustomMutation = useMutation({
    mutationFn: async (items: CustomItem[]) => {
      const res = await apiRequest("PUT", "/api/admin/pricing/custom-items", { items });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing"] });
      toast({ title: "✅ Custom items saved" });
    },
    onError: () => toast({ title: "Failed to save custom items", variant: "destructive" }),
  });

  const saveJunkAddonsMutation = useMutation({
    mutationFn: async (items: CustomItem[]) => {
      const res = await apiRequest("PUT", "/api/admin/pricing/junk-addons", { items });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing"] });
      toast({ title: "✅ Junk add-ons saved" });
    },
    onError: () => toast({ title: "Failed to save junk add-ons", variant: "destructive" }),
  });

  function addJunkAddon() {
    const name = newJunkName.trim();
    const val = parseFloat(newJunkValue);
    if (!name || isNaN(val)) return;
    const updated = [...junkAddons, { id: Date.now().toString(), name, value: val }];
    setJunkAddons(updated);
    saveJunkAddonsMutation.mutate(updated);
    setNewJunkName("");
    setNewJunkValue("");
  }

  function removeJunkAddon(id: string) {
    const updated = junkAddons.filter(i => i.id !== id);
    setJunkAddons(updated);
    saveJunkAddonsMutation.mutate(updated);
  }

  function updateJunkAddon(id: string, field: "name" | "value", raw: string) {
    setJunkAddons(prev => prev.map(i => i.id === id ? { ...i, [field]: field === "value" ? (parseFloat(raw) || 0) : raw } : i));
  }

  function saveJunkAddon() {
    saveJunkAddonsMutation.mutate(junkAddons);
  }

  function getValue(field: keyof Omit<Pricing, "customItems" | "junkAddons">): string {
    return draft[field] !== undefined ? draft[field] : String(pricing[field]);
  }

  function handleSave(f: typeof fields[0]) {
    const val = draft[f.field as string];
    if (val === undefined || val === String(pricing[f.field])) return;
    saveMutation.mutate({ key: f.key, value: val });
    setDraft(d => { const n = { ...d }; delete n[f.field as string]; return n; });
  }

  function addItem() {
    const name = newName.trim();
    const val = parseFloat(newValue);
    if (!name || isNaN(val)) return;
    const updated = [...customItemsRef, { id: Date.now().toString(), name, value: val }];
    setCustomItems(updated);
    saveCustomMutation.mutate(updated);
    setNewName("");
    setNewValue("");
  }

  function removeItem(id: string) {
    const updated = customItemsRef.filter(i => i.id !== id);
    setCustomItems(updated);
    saveCustomMutation.mutate(updated);
  }

  function updateItem(id: string, field: "name" | "value", raw: string) {
    setCustomItems(prev => prev.map(i => i.id === id ? { ...i, [field]: field === "value" ? (parseFloat(raw) || 0) : raw } : i));
  }

  function saveItem(id: string) {
    saveCustomMutation.mutate(customItems);
  }

  return (
    <div className="mt-8 rounded-2xl border border-amber-500/20 bg-amber-950/20 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-amber-300 hover:bg-amber-900/20 transition-colors"
      >
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Settings className="h-4 w-4" />
          Admin: Edit Calculator Pricing
        </div>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-amber-500/20 pt-4">
          <p className="text-xs text-amber-400/70">Changes apply immediately to all estimates. Blur or press Enter to save each field.</p>

          {/* ── Standard fields ── */}
          <div className="space-y-3">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Base Rates</p>
            {fields.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                <label className="text-slate-300 text-sm w-44 shrink-0">{f.label}</label>
                <div className="flex items-center gap-1 flex-1">
                  {f.prefix && <span className="text-slate-400 text-sm">{f.prefix}</span>}
                  <Input
                    type="number"
                    value={getValue(f.field)}
                    onChange={e => setDraft(d => ({ ...d, [f.field]: e.target.value }))}
                    onBlur={() => handleSave(f)}
                    onKeyDown={e => { if (e.key === "Enter") handleSave(f); }}
                    className="bg-slate-800 border-slate-600 text-white h-8 text-sm max-w-[100px]"
                  />
                  {f.suffix && <span className="text-slate-400 text-sm">{f.suffix}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* ── Custom items ── */}
          <div className="space-y-3">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Additional Items / Services</p>
            <p className="text-xs text-slate-500">These appear as extra line items on every estimate (e.g. Piano Move, Storage Fee, Packing Supplies).</p>

            {customItems.length === 0 && (
              <p className="text-xs text-slate-600 italic">No custom items yet — add one below.</p>
            )}

            {customItems.map(item => (
              <div key={item.id} className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-2 border border-slate-700/40">
                <GripVertical className="h-4 w-4 text-slate-600 shrink-0" />
                <Input
                  value={item.name}
                  onChange={e => updateItem(item.id, "name", e.target.value)}
                  onBlur={() => saveItem(item.id)}
                  onKeyDown={e => { if (e.key === "Enter") saveItem(item.id); }}
                  placeholder="Item name"
                  className="bg-slate-900 border-slate-600 text-white h-8 text-sm flex-1 min-w-0"
                />
                <span className="text-slate-400 text-sm shrink-0">$</span>
                <Input
                  type="number"
                  value={item.value}
                  onChange={e => updateItem(item.id, "value", e.target.value)}
                  onBlur={() => saveItem(item.id)}
                  onKeyDown={e => { if (e.key === "Enter") saveItem(item.id); }}
                  className="bg-slate-900 border-slate-600 text-white h-8 text-sm w-24 shrink-0"
                />
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-red-400 hover:text-red-300 shrink-0 p-1 rounded hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            {/* Add new item row */}
            <div className="flex items-center gap-2 bg-slate-800/40 rounded-lg px-3 py-2 border border-dashed border-slate-600/50">
              <Plus className="h-4 w-4 text-teal-400 shrink-0" />
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addItem(); }}
                placeholder="New item name…"
                className="bg-slate-900 border-slate-600 text-white h-8 text-sm flex-1 min-w-0"
              />
              <span className="text-slate-400 text-sm shrink-0">$</span>
              <Input
                type="number"
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addItem(); }}
                placeholder="0"
                className="bg-slate-900 border-slate-600 text-white h-8 text-sm w-24 shrink-0"
              />
              <Button
                size="sm"
                onClick={addItem}
                disabled={!newName.trim() || !newValue || saveCustomMutation.isPending}
                className="bg-teal-600 hover:bg-teal-700 h-8 px-3 shrink-0 text-xs"
              >
                Add
              </Button>
            </div>
          </div>

          {/* ── Junk heavy item add-ons ── */}
          <div className="space-y-3">
            <p className="text-xs text-orange-400 font-semibold uppercase tracking-wide">Junk Removal — Heavy Item Surcharges</p>
            <p className="text-xs text-slate-500">Shown as a disclosure on junk removal estimates (e.g. Mattress $75, TV $50, Refrigerator $100). These are NOT added to the base estimate — they're a heads-up to customers.</p>

            {junkAddons.length === 0 && (
              <p className="text-xs text-slate-600 italic">No heavy item surcharges yet — add one below.</p>
            )}

            {junkAddons.map(item => (
              <div key={item.id} className="flex items-center gap-2 bg-orange-950/30 rounded-lg px-3 py-2 border border-orange-500/20">
                <GripVertical className="h-4 w-4 text-slate-600 shrink-0" />
                <Input
                  value={item.name}
                  onChange={e => updateJunkAddon(item.id, "name", e.target.value)}
                  onBlur={() => saveJunkAddon()}
                  onKeyDown={e => { if (e.key === "Enter") saveJunkAddon(); }}
                  placeholder="Item name"
                  className="bg-slate-900 border-slate-600 text-white h-8 text-sm flex-1 min-w-0"
                />
                <span className="text-slate-400 text-sm shrink-0">$</span>
                <Input
                  type="number"
                  value={item.value}
                  onChange={e => updateJunkAddon(item.id, "value", e.target.value)}
                  onBlur={() => saveJunkAddon()}
                  onKeyDown={e => { if (e.key === "Enter") saveJunkAddon(); }}
                  className="bg-slate-900 border-slate-600 text-white h-8 text-sm w-24 shrink-0"
                />
                <button
                  onClick={() => removeJunkAddon(item.id)}
                  className="text-red-400 hover:text-red-300 shrink-0 p-1 rounded hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            {/* Add new junk add-on row */}
            <div className="flex items-center gap-2 bg-orange-950/20 rounded-lg px-3 py-2 border border-dashed border-orange-600/40">
              <Plus className="h-4 w-4 text-orange-400 shrink-0" />
              <Input
                value={newJunkName}
                onChange={e => setNewJunkName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addJunkAddon(); }}
                placeholder="e.g. Mattress, TV, Refrigerator…"
                className="bg-slate-900 border-slate-600 text-white h-8 text-sm flex-1 min-w-0"
              />
              <span className="text-slate-400 text-sm shrink-0">$</span>
              <Input
                type="number"
                value={newJunkValue}
                onChange={e => setNewJunkValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addJunkAddon(); }}
                placeholder="0"
                className="bg-slate-900 border-slate-600 text-white h-8 text-sm w-24 shrink-0"
              />
              <Button
                size="sm"
                onClick={addJunkAddon}
                disabled={!newJunkName.trim() || !newJunkValue || saveJunkAddonsMutation.isPending}
                className="bg-orange-700 hover:bg-orange-600 h-8 px-3 shrink-0 text-xs"
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page component ─────────────────────────────────────────────────────
export default function MovingEstimator() {
  const { user } = useAuth();
  const isAdmin = ["admin", "business_owner"].includes(user?.role || "");
  const search = useSearch();
  const skipServiceSelect = new URLSearchParams(search).has("moving");

  const { data: pricingData } = useQuery<any>({ queryKey: ["/api/pricing"], staleTime: 60000 });
  const pricing: Pricing = pricingData ? {
    ratePerMoverHour: pricingData.ratePerMoverHour ?? DEFAULT_PRICING.ratePerMoverHour,
    shortJobRate:     pricingData.shortJobRate      ?? DEFAULT_PRICING.shortJobRate,
    shortJobFull:     pricingData.shortJobFull      ?? DEFAULT_PRICING.shortJobFull,
    jc222Price:       pricingData.jc222Price        ?? DEFAULT_PRICING.jc222Price,
    driveSpeedMph:    pricingData.driveSpeedMph     ?? DEFAULT_PRICING.driveSpeedMph,
    junkSmallLow:     pricingData.junkSmallLow      ?? DEFAULT_PRICING.junkSmallLow,
    junkSmallHigh:    pricingData.junkSmallHigh     ?? DEFAULT_PRICING.junkSmallHigh,
    junkLargeLow:     pricingData.junkLargeLow      ?? DEFAULT_PRICING.junkLargeLow,
    junkLargeHigh:    pricingData.junkLargeHigh     ?? DEFAULT_PRICING.junkLargeHigh,
    customItems:      pricingData.customItems       ?? [],
    junkAddons:       pricingData.junkAddons        ?? [],
  } : DEFAULT_PRICING;

  const logic = useChatLogic(pricing, skipServiceSelect);
  const { sel, activeZipStep, zipInput, setZipInput, zipLoading, zipError, setZipError, handleZipSubmit, restart } = logic;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-lg mx-auto px-4 pb-24">

        {/* Header */}
        <div className="flex items-center gap-3 pt-6 pb-5">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white p-2">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-teal-500 to-blue-600">
              <Truck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white text-lg leading-tight">Moving Estimator</h1>
              <p className="text-slate-400 text-xs">Based in Ironwood, MI {BASE_ZIP}</p>
            </div>
          </div>
          {Object.keys(sel).length > 0 && (
            <Button variant="ghost" size="sm" onClick={restart} className="ml-auto text-slate-400 hover:text-white gap-1 text-xs">
              <RotateCcw className="h-3.5 w-3.5" /> Restart
            </Button>
          )}
        </div>

        <ChatUI logic={logic} pricing={pricing} />

        {/* Tip shown at start */}
        {Object.keys(sel).length === 0 && (
          <Card className="mt-6 p-4 border-slate-700/50 bg-slate-800/40 space-y-1.5">
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-teal-400 shrink-0" />
              Drive time is calculated from our Ironwood, MI base (49938) to your location and back
            </p>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-teal-400 shrink-0" />
              Stairs add 1 extra mover for safety
            </p>
          </Card>
        )}

        <p className="text-center text-xs text-slate-500 mt-5">
          ${pricing.ratePerMoverHour}/mover/hr · {pricing.driveSpeedMph} mph avg drive speed · Licensed & Insured
        </p>

        {isAdmin && <AdminPricingEditor pricing={pricing} />}
      </div>

      {/* Zip input — sticky at bottom when active */}
      {activeZipStep && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur border-t border-slate-700/60 px-4 py-4">
          <p className="text-xs text-slate-400 mb-2 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-teal-400" />
            Enter the {activeZipStep === "pickup" ? "pickup" : "drop-off"} zip code
          </p>
          <div className="flex gap-2 max-w-lg mx-auto">
            <Input
              value={zipInput}
              onChange={e => { setZipInput(e.target.value.replace(/\D/g, "").slice(0, 5)); setZipError(""); }}
              onKeyDown={e => { if (e.key === "Enter") handleZipSubmit(); }}
              placeholder="e.g. 49938"
              maxLength={5}
              className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 text-lg font-mono tracking-widest text-center"
              autoFocus
            />
            <Button onClick={handleZipSubmit} disabled={zipLoading || zipInput.length !== 5} className="bg-teal-600 hover:bg-teal-700 px-5">
              {zipLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          {zipError && <p className="text-xs text-red-400 mt-1.5 text-center">{zipError}</p>}
        </div>
      )}
    </div>
  );
}
