import { useRef, useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Truck, Trash2, Snowflake, Sparkles, Wrench, HardHat, Layers, PaintBucket,
  Star, Phone, ChevronRight, Award,
  CheckCircle2, Clock, Users, MapPin, ArrowDown, Quote as QuoteIcon, LogIn
} from "lucide-react";
import { Link } from "wouter";
import { BookingChatbot } from "@/components/booking-chatbot";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QuoteForm from "@/components/QuoteForm";
import { useQuery } from "@tanstack/react-query";

import img1 from "@assets/20201208_140539_1764946073180.jpg";
import img2 from "@assets/20210116_135907_HDR_1764946073182.jpg";
import img3 from "@assets/20210219_134320_1764946073183.jpg";
import img4 from "@assets/20210401_100524_HDR_1764946073184.jpg";
import img5 from "@assets/20210401_100531_HDR_1764946073186.jpg";
import img6 from "@assets/20210401_100538_HDR_1764946073187.jpg";
import img7 from "@assets/20211107_151109_1764946073190.jpg";
import img8 from "@assets/1549057354530_bigstock_moving_boxes_on_a_red_dolly_wi_6101608_1764946073192.jpg";
import img9 from "@assets/FB_IMG_1675268576884_1764946073198.jpg";
import img10 from "@assets/FB_IMG_1675268629678_1764946073200.jpg";
import img11 from "@assets/FB_IMG_1675268634834_1764946073201.jpg";
import img12 from "@assets/FB_IMG_1675268649119_1764946073202.jpg";

const jewelryVideoSrc = "/jewelry-video.mp4";

const LABOR_RATES: Record<number, number> = { 1: 65, 2: 115, 3: 165, 4: 210, 5: 255 };
const TRUCK_ADD = 60;

const SERVICES = [
  { icon: Truck,       label: "Moving",        sub: "Local & Long Distance", color: "from-blue-600 to-blue-800",     value: "residential" },
  { icon: Trash2,      label: "Junk Removal",  sub: "Haul Away & Disposal",  color: "from-orange-600 to-orange-800", value: "junk" },
  { icon: Snowflake,   label: "Snow Removal",  sub: "Plowing & Shoveling",   color: "from-cyan-600 to-cyan-800",     value: "snow" },
  { icon: Sparkles,    label: "Move In/Out",   sub: "Deep Cleaning",         color: "from-green-600 to-green-800",   value: "cleaning" },
  { icon: Wrench,      label: "Handyman",      sub: "General Repairs",       color: "from-amber-600 to-amber-800",   value: "handyman" },
  { icon: HardHat,     label: "Light Demo",    sub: "Demolition Work",       color: "from-red-600 to-red-800",       value: "demolition" },
  { icon: Layers,      label: "Flooring",      sub: "Install & Repair",      color: "from-stone-600 to-stone-800",   value: "flooring" },
  { icon: PaintBucket, label: "Painting",      sub: "Interior & Exterior",   color: "from-violet-600 to-violet-800", value: "painting" },
];

interface ServiceAddon { id: string; label: string; price: number; unit: string; }

const DEFAULT_ADDONS: ServiceAddon[] = [
  { id: "assembly",  label: "Furniture Assembly / Disassembly", price: 75, unit: "flat" },
  { id: "packing",  label: "Packing Assistance",                price: 45, unit: "/ room" },
  { id: "mattress", label: "Mattress Bag Protection",           price: 15, unit: "each" },
  { id: "shrink",   label: "Shrink Wrap Protection",            price: 15, unit: "/ room" },
  { id: "stairs",   label: "Stair Carry Fee (100+ ft)",         price: 25, unit: "flat" },
  { id: "piano",    label: "Piano / Specialty Item",            price: 85, unit: "flat" },
];

const CREW_META: Record<number, { best: string; popular?: boolean }> = {
  1: { best: "Studio / Single room" },
  2: { best: "1–2 BR apartments" },
  3: { best: "2–3 BR homes", popular: true },
  4: { best: "3–4 BR homes" },
  5: { best: "Large estate / office" },
};

const GALLERY_IMAGES = [img1, img2, img3, img4, img5, img6, img7, img8, img9, img10, img11, img12];

// JC base location: Ironwood, MI
const BASE_LAT = 46.4547;
const BASE_LNG = -90.1712;
const DRIVE_SPEED_MPH = 45;
const DRIVE_RATE_PER_MOVER = 40; // $/hr per mover for drive time

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const FALLBACK_REVIEWS = [
  { id: "1", reviewerName: "Sarah M.", rating: 5, content: "Fast, careful, and professional. They wrapped every piece of furniture and got us moved in under 3 hours!", serviceType: "Moving", status: "approved" },
  { id: "2", reviewerName: "James R.", rating: 5, content: "Best moving crew I've ever hired. On time, hard working, and the price was exactly what they quoted.", serviceType: "Moving", status: "approved" },
  { id: "3", reviewerName: "Linda K.", rating: 5, content: "Used JC ON THE MOVE twice now. They never disappoint. Highly recommend the 3-mover crew.", serviceType: "Moving", status: "approved" },
];

interface Testimonial {
  id: string;
  reviewerName: string;
  rating: number;
  content: string;
  serviceType: string | null;
  status: string;
}

function StarRow({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-4 w-4 ${i < n ? "fill-amber-400 text-amber-400" : "text-slate-600"}`} />
      ))}
    </div>
  );
}

export default function HomePage() {
  const [chatOpen, setChatOpen] = useState(false);
  const [quoteService, setQuoteService] = useState("");
  const quoteRef = useRef<HTMLDivElement>(null);
  const [serviceType, setServiceType] = useState<"labor" | "truck">("labor");
  const [selectedCrew, setSelectedCrew] = useState<number | null>(null);
  const [addOns, setAddOns] = useState<Record<string, boolean>>({});
  const [zipCode, setZipCode] = useState("");
  const [zipCity, setZipCity] = useState<string | null>(null);
  const [zipError, setZipError] = useState("");
  const [zipLoading, setZipLoading] = useState(false);
  const [driveMiles, setDriveMiles] = useState<number | null>(null);

  useEffect(() => {
    if (zipCode.length !== 5 || !/^\d{5}$/.test(zipCode)) {
      setZipCity(null);
      setDriveMiles(null);
      setZipError("");
      return;
    }
    setZipLoading(true);
    setZipError("");
    fetch(`https://api.zippopotam.us/us/${zipCode}`)
      .then(r => {
        if (!r.ok) throw new Error("Zip not found");
        return r.json();
      })
      .then((d: any) => {
        const place = d.places?.[0];
        if (!place) throw new Error("Zip not found");
        const lat = parseFloat(place.latitude);
        const lng = parseFloat(place.longitude);
        const miles = haversineMiles(BASE_LAT, BASE_LNG, lat, lng);
        setDriveMiles(miles);
        setZipCity(`${place["place name"]}, ${place["state abbreviation"]}`);
        setZipLoading(false);
      })
      .catch(() => {
        setZipError("Zip code not found — please check and retry.");
        setZipCity(null);
        setDriveMiles(null);
        setZipLoading(false);
      });
  }, [zipCode]);

  const { data: testimonials } = useQuery<Testimonial[]>({
    queryKey: ["/api/testimonials/public"],
  });

  const hourlyRate = useMemo(() => {
    if (!selectedCrew) return 0;
    return LABOR_RATES[selectedCrew] + (serviceType === "truck" ? TRUCK_ADD : 0);
  }, [selectedCrew, serviceType]);

  const { data: serviceAddons = DEFAULT_ADDONS } = useQuery<ServiceAddon[]>({
    queryKey: ["/api/pricing/addons"],
    staleTime: 1000 * 60 * 5,
  });

  const addOnTotal = useMemo(
    () => serviceAddons.filter(a => addOns[a.id]).reduce((s, a) => s + a.price, 0),
    [addOns, serviceAddons]
  );

  const driveInfo = useMemo(() => {
    if (!driveMiles || !selectedCrew) return null;
    const oneWayHours = driveMiles / DRIVE_SPEED_MPH;
    const roundTripHours = oneWayHours * 2;
    const cost = Math.ceil(roundTripHours * DRIVE_RATE_PER_MOVER * selectedCrew);
    return {
      miles: Math.round(driveMiles),
      roundTripHours: Math.round(roundTripHours * 10) / 10,
      cost,
    };
  }, [driveMiles, selectedCrew]);

  const minHours = serviceType === "truck" ? 3 : 2;

  const scrollToQuote = (service?: string) => {
    if (service) setQuoteService(service);
    setTimeout(() => quoteRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const displayedReviews = (testimonials?.filter(t => t.status === "approved").slice(0, 6) ?? []).length > 0
    ? testimonials!.filter(t => t.status === "approved").slice(0, 6)
    : FALLBACK_REVIEWS;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">

      {/* ── Fixed Login Button ── */}
      <Link href="/login">
        <button className="fixed top-4 right-4 z-50 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 hover:border-white/40 text-white text-sm font-semibold px-3 py-2 rounded-xl transition-all shadow-lg">
          <LogIn className="h-4 w-4" />
          <span>Login</span>
        </button>
      </Link>

      {/* ── Nature Made Jewls Dedication Banner ── */}
      <Link href="/nature-made-jewls">
        <div className="w-full cursor-pointer group relative overflow-hidden"
          style={{ background: "linear-gradient(90deg, #0d0704 0%, #2d1a0f 30%, #1e1208 50%, #2d1a0f 70%, #0d0704 100%)" }}>
          <div className="relative flex items-center justify-between px-4 py-2 max-w-5xl mx-auto gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0 w-9 h-9 rounded-lg overflow-hidden border border-amber-700/50 shadow">
                <video src={jewelryVideoSrc} autoPlay loop muted playsInline className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0">
                <p className="text-amber-400/70 text-[9px] uppercase tracking-widest leading-none mb-0.5">Dedicated with love ♡</p>
                <p className="text-amber-100 font-serif font-bold text-sm leading-tight truncate">
                  Nature Made Jewls — Handmade Jewelry &amp; Custom Creations
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-amber-500/60 flex-shrink-0 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </Link>

      {/* ── HERO ── */}
      <section className="relative min-h-[88vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900/80 to-blue-950/40" />
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: "radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)", backgroundSize: "32px 32px" }} />

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <Badge className="mb-4 bg-blue-600/20 text-blue-300 border-blue-500/30 text-xs px-3 py-1">
            <MapPin className="h-3 w-3 mr-1" /> Serving Ironwood & Iron River, MI · Green Bay & Wausau, WI
          </Badge>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-4 leading-none">
            <span className="text-white">JC ON THE</span>
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">MOVE LLC</span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-300 mb-2 font-medium">Northwoods Moving &amp; More</p>
          <p className="text-slate-400 mb-8 max-w-xl mx-auto">
            Professional moving, junk removal, snow removal &amp; more. Licensed, insured, and ready to help you today.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
            <Button
              size="lg"
              onClick={() => scrollToQuote()}
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold px-8 py-6 text-lg shadow-lg shadow-blue-900/40"
            >
              Get a Free Quote <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
            <a href="tel:(906) 285-9312">
              <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10 px-8 py-6 text-lg w-full sm:w-auto">
                <Phone className="mr-2 h-5 w-5" /> (906) 285-9312
              </Button>
            </a>
          </div>

          <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-400">
            {[
              { icon: CheckCircle2, text: "Licensed & Insured" },
              { icon: Clock, text: "Same-Day Available" },
              { icon: Users, text: "1–5 Crew Options" },
              { icon: Award, text: "500+ Jobs Completed" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-1.5">
                <Icon className="h-4 w-4 text-blue-400" />
                <span>{text}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => document.getElementById("services")?.scrollIntoView({ behavior: "smooth" })}
            className="mt-12 flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors mx-auto"
          >
            <span className="text-xs tracking-widest uppercase">Explore Services</span>
            <ArrowDown className="h-4 w-4 animate-bounce" />
          </button>
        </div>
      </section>

      {/* ── SERVICES ── */}
      <section id="services" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">What We Do</h2>
            <p className="text-slate-400 max-w-lg mx-auto">Click any service to request a quote instantly</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {SERVICES.map(({ icon: Icon, label, sub, color, value }) => (
              <button key={value} onClick={() => scrollToQuote(value)} className="group text-left">
                <Card className="border-white/5 bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-200 hover:border-white/10 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer h-full">
                  <CardContent className="p-5">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-3 shadow-lg group-hover:scale-110 transition-transform`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <p className="font-bold text-white text-sm mb-0.5">{label}</p>
                    <p className="text-slate-500 text-xs">{sub}</p>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── LIVE CALCULATOR ── */}
      <section className="py-20 px-4 bg-slate-900/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">Live Pricing Calculator</h2>
            <p className="text-slate-400">Get an instant estimate — no commitment required</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <p className="text-sm font-semibold text-slate-300 mb-3">Service Type</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["labor", "truck"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setServiceType(t)}
                      className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                        serviceType === t
                          ? "border-blue-500 bg-blue-600/20 text-blue-300"
                          : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20"
                      }`}
                    >
                      {t === "labor" ? "Labor Only" : "+ Moving Truck (+$60/hr)"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-300 mb-3">Crew Size</p>
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setSelectedCrew(n)}
                      className={`w-full flex items-center justify-between py-3 px-4 rounded-xl border text-sm transition-all ${
                        selectedCrew === n
                          ? "border-blue-500 bg-blue-600/20 text-white"
                          : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <span>{n} {n === 1 ? "Mover" : "Movers"}</span>
                        {CREW_META[n].popular && (
                          <Badge className="bg-orange-600/30 text-orange-300 border-orange-500/30 text-[10px] py-0 px-1.5">Popular</Badge>
                        )}
                      </span>
                      <span className="text-slate-500 text-xs hidden sm:block">{CREW_META[n].best}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-300 mb-3">Add-Ons</p>
                <div className="space-y-2">
                  {serviceAddons.map(a => (
                    <button
                      key={a.id}
                      onClick={() => setAddOns(prev => ({ ...prev, [a.id]: !prev[a.id] }))}
                      className={`w-full flex items-center justify-between py-2.5 px-4 rounded-xl border text-sm transition-all ${
                        addOns[a.id]
                          ? "border-green-500 bg-green-600/20 text-green-300"
                          : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20"
                      }`}
                    >
                      <span>{a.label}</span>
                      <span className="text-xs">+${a.price}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-300 mb-1">Your Zip Code</p>
                <p className="text-xs text-slate-500 mb-3">We calculate drive time from our Ironwood, MI base at 45 mph.</p>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="e.g. 54401"
                    value={zipCode}
                    onChange={e => setZipCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full pl-9 pr-4 py-3 rounded-xl border border-white/10 bg-white/[0.03] text-white placeholder-slate-600 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  {zipLoading && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 animate-pulse">Looking up…</span>
                  )}
                </div>
                {zipCity && driveMiles !== null && (
                  <p className="mt-2 text-xs text-blue-300 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    {zipCity} — ~{Math.round(driveMiles)} mi from Ironwood
                  </p>
                )}
                {zipError && (
                  <p className="mt-2 text-xs text-red-400">{zipError}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <Card className="border-blue-500/20 bg-blue-950/30 md:sticky md:top-4">
                <CardContent className="p-6">
                  <h3 className="text-lg font-bold text-white mb-4">Estimate Summary</h3>
                  {selectedCrew ? (
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">{selectedCrew} Mover{selectedCrew > 1 ? "s" : ""} × Rate</span>
                        <span className="text-white font-medium">${hourlyRate}/hr</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Minimum ({minHours} hrs)</span>
                        <span className="text-white font-medium">${hourlyRate * minHours}</span>
                      </div>
                      {addOnTotal > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">Add-ons</span>
                          <span className="text-white font-medium">+${addOnTotal}</span>
                        </div>
                      )}
                      {driveInfo && (
                        <div className="flex justify-between text-sm bg-amber-950/30 border border-amber-500/20 rounded-lg px-3 py-2">
                          <span className="text-amber-300 flex items-center gap-1">
                            <Truck className="h-3.5 w-3.5" />
                            Drive ({driveInfo.miles} mi · {driveInfo.roundTripHours}h RT)
                          </span>
                          <span className="text-amber-200 font-medium">+${driveInfo.cost}</span>
                        </div>
                      )}
                      <div className="border-t border-white/10 pt-3 flex justify-between items-end">
                        <span className="text-slate-300 font-semibold">Starting From</span>
                        <span className="text-2xl font-black text-blue-400">
                          ${hourlyRate * minHours + addOnTotal + (driveInfo?.cost ?? 0)}
                        </span>
                      </div>
                      <p className="text-slate-500 text-xs">Final price based on actual hours worked + applicable fees.</p>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Users className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                      <p className="text-slate-500 text-sm">Select a crew size to see your estimate</p>
                    </div>
                  )}
                  <Button
                    className="w-full mt-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 font-bold"
                    onClick={() => scrollToQuote("residential")}
                  >
                    Book This Crew <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-white/5 bg-white/[0.03]">
                <CardContent className="p-4 space-y-2">
                  {[
                    "No hidden fees — pay for actual time worked",
                    "Licensed & fully insured crew",
                    "Free estimates — no obligation",
                    "Earn JCMOVES tokens on every job",
                  ].map(t => (
                    <div key={t} className="flex items-start gap-2 text-sm text-slate-400">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>{t}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* ── GALLERY ── */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">Our Work</h2>
            <p className="text-slate-400">Real jobs, real results — by our team</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {GALLERY_IMAGES.map((src, i) => (
              <div key={i} className="aspect-square overflow-hidden rounded-xl border border-white/5 group">
                <img
                  src={src}
                  alt={`Gallery image ${i + 1}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── REVIEWS ── */}
      <section className="py-20 px-4 bg-slate-900/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">What Customers Say</h2>
            <div className="flex items-center justify-center gap-2 text-slate-400">
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <span className="text-sm">5.0 average rating</span>
            </div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedReviews.map((r) => (
              <Card key={r.id} className="border-white/5 bg-white/[0.03]">
                <CardContent className="p-5">
                  <QuoteIcon className="h-6 w-6 text-blue-500/40 mb-3" />
                  <p className="text-slate-300 text-sm leading-relaxed mb-4">"{r.content}"</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white text-sm">{r.reviewerName}</p>
                      {r.serviceType && <p className="text-slate-500 text-xs">{r.serviceType}</p>}
                    </div>
                    <StarRow n={r.rating} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/leave-review">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                Leave a Review
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── QUOTE FORM ── */}
      <section ref={quoteRef} id="quote" className="py-20 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">Get Your Free Quote</h2>
            <p className="text-slate-400">Fill out the form and we'll respond within 24 hours.</p>
          </div>
          <QuoteForm
            variant="customer"
            prefilledService={quoteService}
            onSuccess={() => setQuoteService("")}
            showRewardsInfo
          />
          <div className="mt-8 text-center">
            <p className="text-slate-500 text-sm mb-2">Prefer to talk directly?</p>
            <a href="tel:(906) 285-9312" className="text-2xl font-black text-blue-400 hover:text-blue-300 transition-colors">
              (906) 285-9312
            </a>
          </div>
        </div>
      </section>

      {/* ── REWARDS CTA ── */}
      <section className="py-16 px-4 bg-gradient-to-r from-blue-950/50 via-slate-900 to-purple-950/50">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-4xl mb-4">🪙</div>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Earn JCMOVES Tokens on Every Job</h2>
          <p className="text-slate-400 mb-6 max-w-xl mx-auto">
            Book a service, earn tokens. Redeem for free labor, gift cards, discounts, and more through our rewards marketplace.
          </p>
          <Link href="/login">
            <Button className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 font-bold px-8 py-5">
              Join & Start Earning <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/5 py-10 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            <div>
              <h3 className="font-bold text-white mb-3 text-sm">JC ON THE MOVE LLC</h3>
              <p className="text-slate-500 text-xs leading-relaxed">Professional moving & services in Northwoods, MI & WI</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-300 mb-3 text-sm">Services</h3>
              <div className="space-y-1.5">
                {["Moving", "Junk Removal", "Snow Removal", "Handyman"].map(s => (
                  <button key={s} onClick={() => scrollToQuote()} className="block text-slate-500 hover:text-slate-300 text-xs transition-colors">{s}</button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-slate-300 mb-3 text-sm">Company</h3>
              <div className="space-y-1.5">
                <Link href="/leave-review"><span className="block text-slate-500 hover:text-slate-300 text-xs transition-colors cursor-pointer">Leave a Review</span></Link>
                <Link href="/terms"><span className="block text-slate-500 hover:text-slate-300 text-xs transition-colors cursor-pointer">Terms of Service</span></Link>
                <Link href="/privacy"><span className="block text-slate-500 hover:text-slate-300 text-xs transition-colors cursor-pointer">Privacy Policy</span></Link>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-slate-300 mb-3 text-sm">Contact</h3>
              <a href="tel:(906) 285-9312" className="block text-slate-500 hover:text-slate-300 text-xs transition-colors mb-1">(906) 285-9312</a>
              <p className="text-slate-500 text-xs">Ironwood & Iron River, MI</p>
              <p className="text-slate-500 text-xs">Green Bay & Wausau, WI</p>
            </div>
          </div>
          <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-slate-600 text-xs">© {new Date().getFullYear()} JC ON THE MOVE LLC. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <Link href="/login"><span className="text-slate-700 hover:text-slate-500 text-xs cursor-pointer transition-colors">Team Login</span></Link>
              <Link href="/login"><span className="text-slate-700 hover:text-slate-500 text-xs cursor-pointer transition-colors">Customer Login</span></Link>
            </div>
          </div>
        </div>
      </footer>

      {/* ── BOOKING CHATBOT DIALOG ── */}
      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent className="sm:max-w-lg w-full max-h-[92vh] flex flex-col p-0 overflow-hidden bg-slate-950 border border-slate-700/60">
          <DialogHeader className="px-5 pt-4 pb-2 shrink-0 border-b border-slate-800/60">
            <DialogTitle className="flex items-center gap-2.5 text-white">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-teal-500 to-blue-600">
                <Truck className="h-4 w-4 text-white" />
              </div>
              JC Moving Assistant
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-3">
            <BookingChatbot onClose={() => setChatOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── FLOATING CHAT BUTTON ── */}
      <button
        onClick={() => setChatOpen(true)}
        className="fixed bottom-6 right-6 z-50 bg-gradient-to-br from-teal-500 to-blue-600 text-white rounded-full p-4 shadow-2xl shadow-blue-900/50 hover:scale-110 transition-transform"
        aria-label="Open booking assistant"
      >
        <Truck className="h-6 w-6" />
      </button>
    </div>
  );
}
