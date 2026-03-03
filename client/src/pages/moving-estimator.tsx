import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Truck, Package2, Users, Clock, DollarSign,
  RotateCcw, ChevronRight, Star, AlertCircle, MapPin,
  Navigation, Send, Loader2
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────
const RATE = 50;                   // $ per mover per hour (3–4 hr jobs, 2–4 movers)
const SHORT_JOB_RATE = 150;        // $ per hour flat for <3 hr / 2-mover small jobs
const SHORT_JOB_FULL = 300;        // full price for short job (2 movers, 2 hrs)
const JC222_PRICE = 222;           // JC222 promo discount price for short jobs
const DRIVE_SPEED_MPH = 35;        // UP Michigan roads average
const BASE_ZIP = "49938";
const BASE_LAT = 46.4539;
const BASE_LNG = -90.1715;
const BASE_CITY = "Ironwood, MI";

// ── Types ──────────────────────────────────────────────────────────────────
type Service = "moving" | "junk";
type TruckSize = "small" | "large";
type LoadType = "loadOnly" | "loadUnload";
type JunkSize = "small" | "large";

interface ZipInfo { zip: string; city: string; lat: number; lng: number; }
interface DriveInfo {
  pickupMiles: number;
  dropoffMiles: number;   // pickup → dropoff (0 if load-only)
  returnMiles: number;    // last stop → base
  totalMiles: number;
  totalDriveHours: number;
}

interface Sel {
  service?: Service;
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

function computeDrive(sel: Sel): DriveInfo | undefined {
  if (!sel.pickup) return undefined;
  const p = sel.pickup;

  const pickupMiles = haversine(BASE_LAT, BASE_LNG, p.lat, p.lng);

  if (sel.loadType === "loadOnly" || !sel.dropoff) {
    // base → pickup → base
    const total = pickupMiles * 2;
    return { pickupMiles, dropoffMiles: 0, returnMiles: pickupMiles, totalMiles: total, totalDriveHours: roundHalf(total / DRIVE_SPEED_MPH) };
  }

  const d = sel.dropoff;
  const dropoffMiles = haversine(p.lat, p.lng, d.lat, d.lng);
  const returnMiles = haversine(d.lat, d.lng, BASE_LAT, BASE_LNG);
  const total = pickupMiles + dropoffMiles + returnMiles;
  return { pickupMiles, dropoffMiles, returnMiles, totalMiles: total, totalDriveHours: roundHalf(total / DRIVE_SPEED_MPH) };
}

/** Small truck, load-only = short job → flat $300 rate (not $50/mover/hr) */
function isShortJob(sel: Sel): boolean {
  return sel.service === "moving" && sel.truckSize === "small" && sel.loadType === "loadOnly";
}

function getOptions(sel: Sel): Option[] {
  const bonus = sel.stairs ? 1 : 0;
  if (sel.service !== "moving") return [];
  if (sel.truckSize === "small" && sel.loadType === "loadOnly")
    return [{ movers: 2 + bonus, hours: 2, tag: "JC222 Available" }];
  if (sel.truckSize === "large" && sel.loadType === "loadOnly")
    return [{ movers: 2 + bonus, hours: 4 }, { movers: 3 + bonus, hours: 3, tag: "Most Popular" }, { movers: 4 + bonus, hours: 2, tag: "Fastest" }];
  if (sel.loadType === "loadUnload")
    return [{ movers: 2 + bonus, hours: 6 }, { movers: 3 + bonus, hours: 4, tag: "Most Popular" }, { movers: 4 + bonus, hours: 3, tag: "Fastest" }];
  return [];
}

// ── Build chat message list ────────────────────────────────────────────────
function buildMessages(sel: Sel): Msg[] {
  const msgs: Msg[] = [];

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

  // ── Junk removal branch ────────────────────────────────────────────────
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

  // ── Moving branch ──────────────────────────────────────────────────────
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

// ── Result card ────────────────────────────────────────────────────────────
function ResultCard({ sel }: { sel: Sel }) {
  const drive = sel.driveInfo;
  const driveCostNote = drive
    ? `+$${(drive.totalDriveHours * RATE).toLocaleString()}–$${(drive.totalDriveHours * 4 * RATE).toLocaleString()} drive`
    : "";

  if (sel.service === "junk") {
    const isSmall = sel.junkSize === "small";
    const laborLow = isSmall ? 100 : 200;
    const laborHigh = isSmall ? 200 : 600;
    const driveCost = drive ? drive.totalDriveHours * 2 * RATE : 0;
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-300 font-semibold">Your junk removal estimate:</p>

        {drive && <DriveBreakdown drive={drive} sel={sel} movers={2} />}

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
        </div>
        <Disclaimer />
      </div>
    );
  }

  const options = getOptions(sel);
  if (!options.length) return null;

  const shortJob = isShortJob(sel);
  const opt0 = options[0];
  const driveCost0 = drive ? Math.round(drive.totalDriveHours * opt0.movers * RATE) : 0;

  // ── Short job (small truck, load-only, 2 movers, 2 hrs) ─────────────────
  if (shortJob) {
    const fullTotal = SHORT_JOB_FULL + driveCost0;
    const promoTotal = JC222_PRICE + driveCost0;
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-300 font-semibold">
          Your moving estimate{sel.stairs ? " (+1 mover for stairs)" : ""}:
        </p>

        {drive && <DriveBreakdown drive={drive} sel={sel} movers={opt0.movers} />}

        {/* Rate explanation */}
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-900/15 p-3 text-xs text-yellow-200 space-y-1">
          <p className="font-semibold text-yellow-300 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> Short Job Rate Applies
          </p>
          <p className="text-yellow-200/80">Jobs under 3 hours with 2 movers are billed at <span className="font-semibold text-white">${SHORT_JOB_RATE}/hr flat</span> — to unlock the $50/mover/hr rate, book a large truck or a load & unload job.</p>
        </div>

        <div className="rounded-xl overflow-hidden border border-slate-700/60">
          {/* Regular price row */}
          <div className="px-4 py-3 flex items-center justify-between border-b border-slate-700/40">
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide">Regular Price</p>
              <p className="text-sm text-slate-300 mt-0.5">
                <Users className="h-3.5 w-3.5 inline text-teal-400 mr-1" />{opt0.movers} movers ·
                <Clock className="h-3.5 w-3.5 inline text-blue-400 mx-1" />{opt0.hours} hrs ·
                ${SHORT_JOB_RATE}/hr flat
              </p>
            </div>
            <div className="text-right">
              <p className="text-slate-500 line-through text-sm">${SHORT_JOB_FULL.toLocaleString()}</p>
              {drive && <p className="text-amber-400 text-xs">+${driveCost0} drive</p>}
              <p className="text-slate-500 line-through text-sm font-bold">${fullTotal.toLocaleString()} total</p>
            </div>
          </div>

          {/* JC222 promo row */}
          <div className="px-4 py-4 bg-gradient-to-r from-teal-900/40 to-emerald-900/30 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-teal-500/30 text-teal-300 border-teal-500/50 font-mono font-bold text-sm px-2">
                  JC222
                </Badge>
                <span className="text-teal-300 text-xs font-semibold">Promo Price</span>
              </div>
              <p className="text-xs text-slate-400">Use code <span className="font-mono text-teal-300 font-bold">JC222</span> at booking</p>
            </div>
            <div className="text-right">
              <p className="text-emerald-400 font-black text-2xl">${JC222_PRICE}</p>
              {drive && <p className="text-amber-400 text-xs">+${driveCost0} drive</p>}
              <p className="text-emerald-300 font-bold text-base">${promoTotal.toLocaleString()} total</p>
              <p className="text-emerald-600 text-xs">Save ${fullTotal - promoTotal}</p>
            </div>
          </div>
        </div>

        <Disclaimer drive={drive} shortJob />
      </div>
    );
  }

  // ── Standard rate jobs (3–4 hrs, qualifies for $50/mover/hr) ───────────
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-300 font-semibold">
        Your moving estimate{sel.stairs ? " (stairs: +1 mover)" : ""}:
      </p>

      {drive && <DriveBreakdown drive={drive} sel={sel} movers={options[0]?.movers ?? 2} />}

      {/* Standard rate badge */}
      <div className="flex items-center gap-2 text-xs text-teal-300">
        <Star className="h-3.5 w-3.5 text-teal-400" />
        <span>Qualifies for <span className="font-bold">${RATE}/mover/hr</span> standard rate</span>
      </div>

      <div className="rounded-xl overflow-hidden border border-slate-700/60">
        <div className="bg-slate-800/80 px-3 py-2 grid grid-cols-5 text-slate-400 text-xs uppercase tracking-wide font-medium">
          <span>Movers</span>
          <span>Hours</span>
          <span>Labor</span>
          <span>{drive ? "Drive" : ""}</span>
          <span>Total</span>
        </div>
        {options.map((opt, i) => {
          const labor = opt.movers * opt.hours * RATE;
          const driveCost = drive ? Math.round(drive.totalDriveHours * opt.movers * RATE) : 0;
          const total = labor + driveCost;
          return (
            <div key={i} className={`border-t border-slate-700/40 px-3 py-3 grid grid-cols-5 gap-1 items-center text-sm ${opt.tag === "Most Popular" ? "bg-teal-900/20" : ""}`}>
              <div className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-teal-400" />
                <span className="font-bold text-white">{opt.movers}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-slate-200">{opt.hours}h</span>
              </div>
              <div className="text-slate-300">${labor.toLocaleString()}</div>
              <div className="text-amber-400 text-xs">{drive ? `+$${driveCost.toLocaleString()}` : "—"}</div>
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-emerald-400">${total.toLocaleString()}</span>
                {opt.tag && (
                  <Badge className={`text-[10px] px-1 py-0 h-4 w-fit ${opt.tag === "Most Popular" ? "bg-teal-600/40 text-teal-300 border-teal-500/40" : "bg-slate-700/50 text-slate-400 border-slate-600/40"}`}>
                    {opt.tag === "Most Popular" && <Star className="h-2 w-2 mr-0.5" />}{opt.tag}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Disclaimer drive={drive} />
    </div>
  );
}

function DriveBreakdown({ drive, sel, movers }: { drive: DriveInfo; sel: Sel; movers: number }) {
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

function Disclaimer({ drive, shortJob }: { drive?: DriveInfo; shortJob?: boolean }) {
  return (
    <p className="text-xs text-slate-400 flex items-start gap-1.5">
      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-yellow-400" />
      {shortJob
        ? `Short job flat rate $${SHORT_JOB_RATE}/hr ($${SHORT_JOB_FULL} total). Use code JC222 for $${JC222_PRICE}.`
        : `Standard rate $${RATE}/mover/hr for 3–4 hr jobs.`}
      {drive ? ` Drive time at ${DRIVE_SPEED_MPH} mph avg.` : ""} Confirmed at booking.
    </p>
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

// ── Main component ─────────────────────────────────────────────────────────
export default function MovingEstimator() {
  const [sel, setSel] = useState<Sel>({});
  const [zipInput, setZipInput] = useState("");
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = buildMessages(sel);
  const isComplete = messages.some(m => m.isResult);
  const activeZipStep = !isComplete ? messages.findLast(m => m.isZipInput)?.isZipInput : undefined;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleChoice(step: string, value: string) {
    if (step === "service") setSel({ service: value as Service });
    else if (step === "truckSize") setSel(s => ({ ...s, truckSize: value as TruckSize }));
    else if (step === "loadType") setSel(s => ({ ...s, loadType: value as LoadType }));
    else if (step === "stairs") setSel(s => ({ ...s, stairs: value === "yes" }));
    else if (step === "junkSize") setSel(s => ({ ...s, junkSize: value as JunkSize }));
  }

  function getStepKey(msgIndex: number): string {
    const botChoiceMsgs = messages.slice(0, msgIndex + 1).filter(m => m.role === "bot" && m.choices);
    const idx = botChoiceMsgs.length - 1;
    if (sel.service === "moving") {
      return (["service", "truckSize", "loadType", "stairs"] as const)[idx] ?? "service";
    }
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
          if (s.loadType !== "loadUnload") {
            updated.driveInfo = computeDrive(updated);
          }
          return updated;
        });
      } else if (activeZipStep === "dropoff") {
        setSel(s => {
          const updated = { ...s, dropoff: info };
          updated.driveInfo = computeDrive(updated);
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
            <Button variant="ghost" size="sm" onClick={() => { setSel({}); setZipInput(""); setZipError(""); }} className="ml-auto text-slate-400 hover:text-white gap-1 text-xs">
              <RotateCcw className="h-3.5 w-3.5" /> Restart
            </Button>
          )}
        </div>

        {/* Chat messages */}
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "bot" && (
                <div className="flex items-end gap-2 max-w-[88%]">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center shrink-0 mb-1">
                    <Truck className="h-4 w-4 text-white" />
                  </div>
                  <div className="space-y-2 flex-1">
                    {msg.isResult ? (
                      <Card className="bg-slate-800/80 border-slate-700/60 p-4">
                        <ResultCard sel={sel} />
                        <div className="mt-5 space-y-2">
                          <Link href="/quote">
                            <Button className="w-full bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 font-semibold">
                              Get My Free Official Quote <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                          </Link>
                          <Button variant="outline" onClick={() => { setSel({}); setZipInput(""); setZipError(""); }} className="w-full border-slate-600 text-slate-300 hover:bg-slate-700 gap-2 text-sm">
                            <RotateCcw className="h-3.5 w-3.5" /> Start Over
                          </Button>
                        </div>
                      </Card>
                    ) : (
                      <div className="bg-slate-700/60 rounded-2xl rounded-tl-sm px-4 py-3 text-slate-100 text-sm leading-relaxed whitespace-pre-wrap">
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
                <div className="bg-gradient-to-r from-teal-600 to-blue-600 rounded-2xl rounded-tr-sm px-4 py-2.5 text-white text-sm font-medium max-w-[75%]">
                  {msg.text}
                </div>
              )}
            </div>
          ))}
        </div>

        <div ref={bottomRef} />

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

        {/* Rate note */}
        <p className="text-center text-xs text-slate-500 mt-5">
          ${RATE}/mover/hr · {DRIVE_SPEED_MPH} mph avg drive speed · Licensed & Insured
        </p>
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
            <Button
              onClick={handleZipSubmit}
              disabled={zipLoading || zipInput.length !== 5}
              className="bg-teal-600 hover:bg-teal-700 px-5"
            >
              {zipLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          {zipError && <p className="text-xs text-red-400 mt-1.5 text-center">{zipError}</p>}
        </div>
      )}
    </div>
  );
}
