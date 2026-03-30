import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Truck, Trash2, Snowflake, Sparkles, Wrench, HardHat, Layers, PaintBucket,
  CheckCircle2, Star, Shield, Zap, MapPin, Phone, Send, Gift, ChevronRight, Calculator, MessageSquare,
  Users, Clock, Package
} from "lucide-react";
import { Link } from "wouter";
import { HomepageBookingCalculator } from "@/components/homepage-booking-calculator";
import { BookingChatbot } from "@/components/booking-chatbot";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { insertLeadSchema, type InsertLead } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const serviceOptions = [
  { value: "residential", label: "Moving", icon: Truck },
  { value: "junk", label: "Junk Removal", icon: Trash2 },
  { value: "snow", label: "Snow Removal", icon: Snowflake },
  { value: "cleaning", label: "Move In/Out", icon: Sparkles },
  { value: "handyman", label: "Handyman", icon: Wrench },
  { value: "demolition", label: "Light Demo", icon: HardHat },
  { value: "flooring", label: "Flooring", icon: Layers },
  { value: "painting", label: "Painting", icon: PaintBucket },
];

const servicePackages = [
  {
    title: "2 Movers · 3 Hours",
    badge: "Most Popular",
    badgeColor: "bg-red-500 text-white",
    price: 450,
    discountPercent: 5,
    icon: Users,
    gradientFrom: "from-blue-800",
    gradientTo: "to-blue-600",
    bullets: [
      "2 professional movers for 3 hours",
      "Local moves up to 30 miles",
      "Loading & unloading included",
      "Furniture protection & care",
    ],
    ctaLabel: "Book 2 Movers Now",
    ctaHref: "/post-job",
  },
  {
    title: "4 Movers · 2 Hours",
    badge: "Fastest Option",
    badgeColor: "bg-amber-500 text-white",
    price: 600,
    discountPercent: null,
    icon: Clock,
    gradientFrom: "from-slate-700",
    gradientTo: "to-slate-500",
    bullets: [
      "4-man crew for maximum speed",
      "Ideal for larger homes or offices",
      "Truck & equipment included",
      "Guaranteed on-time arrival",
    ],
    ctaLabel: "Book 4 Movers Now",
    ctaHref: "/post-job",
  },
  {
    title: "Single Item or Small Load",
    badge: "Starting at $150",
    badgeColor: "bg-emerald-600 text-white",
    price: null,
    discountPercent: null,
    icon: Package,
    gradientFrom: "from-teal-800",
    gradientTo: "to-teal-600",
    bullets: [
      "Single furniture pieces or appliances",
      "Small loads & estate cleanouts",
      "Same-day availability",
      "Eco-friendly disposal options",
    ],
    ctaLabel: "Get Junk Removal Quote",
    ctaHref: "/quote?service=junk-removal",
  },
];

const testimonials = [
  {
    name: "Sarah M.",
    service: "Moving",
    quote: "Fast, careful, and professional. Highly recommend.",
    rating: 5,
  },
  {
    name: "James D.",
    service: "Moving",
    quote: "Best movers in the Northwoods. Showed up on time and got it done.",
    rating: 5,
  },
  {
    name: "Linda K.",
    service: "Moving",
    quote: "Easy booking, clear pricing, and a crew that works hard.",
    rating: 5,
  },
];

const BANNER_MESSAGES = [
  "🚛 Same-Day Moves Available",
  "⭐ 5-Star Local Movers",
  "💪 500+ Jobs Completed",
  "📞 Call Now — (906) 285-9312",
];

export default function HomePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [photoFiles, setPhotoFiles] = useState<FileList | null>(null);
  const [entryMode, setEntryMode] = useState<"calculator" | "guided">("calculator");
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [bannerIdx, setBannerIdx] = useState(0);

  // Hero ZIP ETA widget
  type HeroEtaData = { distanceMiles: number; estimatedMinutes: number; availabilityLabel: string; crewCount: number };
  const [heroZip, setHeroZip] = useState("");
  const [heroEtaData, setHeroEtaData] = useState<HeroEtaData | null>(null);
  const [heroEtaLoading, setHeroEtaLoading] = useState(false);
  const [heroEtaError, setHeroEtaError] = useState("");
  const heroInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setInterval(() => setBannerIdx(prev => (prev + 1) % BANNER_MESSAGES.length), 3000);
    return () => clearInterval(id);
  }, []);

  function scrollToGetStarted(mode: "calculator" | "guided" = "calculator") {
    setEntryMode(mode);
    const el = document.getElementById("get-started");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }

  async function lookupHeroEta() {
    const zip = heroZip.trim().replace(/\D/g, "").slice(0, 5);
    if (zip.length < 5) {
      setHeroEtaError("Enter a 5-digit ZIP code.");
      return;
    }
    setHeroEtaLoading(true);
    setHeroEtaError("");
    setHeroEtaData(null);
    try {
      const res = await fetch(`/api/eta?zip=${zip}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not calculate ETA.");
      setHeroEtaData(data);
    } catch (err: any) {
      setHeroEtaError(err?.message || "Could not calculate ETA.");
    } finally {
      setHeroEtaLoading(false);
    }
  }

  const form = useForm<InsertLead>({
    resolver: zodResolver(insertLeadSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      serviceType: "",
      fromAddress: "",
      toAddress: "",
      moveDate: "",
      propertySize: "",
      details: "",
      promoCode: "",
      smsConsent: false,
    },
  });

  const submitLead = useMutation({
    mutationFn: async (data: InsertLead) => {
      const response = await apiRequest("POST", "/api/leads", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Quote request submitted!",
        description: "We will contact you within 24 hours with your quote.",
      });
      form.reset();
      setPhotoFiles(null);
      setQuoteOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    },
    onError: (error: Error) => {
      if (error.message.includes("401")) return;
      toast({
        title: "Error",
        description: "Failed to submit quote request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertLead) => {
    submitLead.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">

      {/* ── ANIMATED TOP BANNER ── */}
      <a
        href={BANNER_MESSAGES[bannerIdx].includes("Call Now") ? "tel:+19062859312" : undefined}
        className={`block w-full py-3 text-center text-sm md:text-base font-medium transition-colors ${
          BANNER_MESSAGES[bannerIdx].includes("Call Now")
            ? "cursor-pointer hover:brightness-110"
            : "cursor-default"
        }`}
        style={{ background: "linear-gradient(90deg, #1e3a5f 0%, #1d4ed8 50%, #1e3a5f 100%)" }}
      >
        <span
          key={bannerIdx}
          className={`inline-flex items-center gap-2 transition-all duration-500 ${
            BANNER_MESSAGES[bannerIdx].includes("Call Now") ? "animate-pulse text-yellow-300" : "text-white"
          }`}
        >
          {BANNER_MESSAGES[bannerIdx]}
          {BANNER_MESSAGES[bannerIdx].includes("Call Now") && (
            <span className="inline-flex items-center gap-1 underline text-yellow-200 text-xs">
              <Phone className="h-3.5 w-3.5" /> Tap to Call
            </span>
          )}
        </span>
      </a>

      {/* ── TOP NAV ── */}
      <nav className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div>
            <p className="text-white font-extrabold text-base leading-tight tracking-tight">JC ON THE MOVE</p>
            <p className="text-slate-500 text-[10px] leading-none">Northwoods Moving &amp; More</p>
          </div>
          <div className="flex items-center gap-3">
            <a href="tel:+19062859312" className="hidden sm:flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors">
              <Phone className="h-3.5 w-3.5" />
              (906) 285-9312
            </a>
            <Link href="/login">
              <span className="group relative text-white/30 hover:text-white text-sm font-medium px-3 py-1.5 rounded-full border border-white/0 hover:border-white/20 hover:bg-white/5 transition-all duration-200 cursor-pointer inline-flex items-center gap-1.5">
                Login
                <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs text-white/60">→ Sign in to your account</span>
              </span>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO SECTION ── */}
      <section className="px-4 pt-10 pb-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-[1fr_380px] gap-8 items-center">

            {/* Left: Headline + trust badges + CTAs */}
            <div>
              <div className="inline-flex items-center gap-1.5 bg-blue-500/10 border border-blue-400/30 rounded-full px-3 py-1 mb-4">
                <MapPin className="h-3 w-3 text-blue-400" />
                <span className="text-blue-300 text-xs font-medium">Ironwood, Iron River, Green Bay, Wausau, and surrounding Northwoods areas</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-4">
                Fast, Reliable Moving<br />
                <span className="text-blue-400">in the Northwoods</span>
              </h1>
              <p className="text-slate-300 text-lg mb-6">
                Moving, junk removal, and labor help across Ironwood and surrounding areas. Licensed, insured, and ready to work today.
              </p>
              <div className="flex flex-wrap gap-3 mb-6">
                {[
                  { icon: Shield, label: "Licensed & Insured" },
                  { icon: Star, label: "5-Star Local Reputation" },
                  { icon: Zap, label: "Fast Response" },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
                    <Icon className="h-3.5 w-3.5 text-blue-400" />
                    <span className="text-white/80 text-xs font-medium">{label}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => scrollToGetStarted("calculator")}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-7 py-3 text-lg rounded-xl"
                >
                  Get My Price
                </Button>
                <a href="tel:+19062859312">
                  <Button variant="outline" className="border-slate-600 text-white hover:bg-slate-700 font-bold px-6 py-2.5 text-base rounded-xl">
                    <Phone className="h-4 w-4 mr-2" />
                    Call Now (906) 285-9312
                  </Button>
                </a>
              </div>
              <p className="mt-3 text-slate-500 text-xs">Next openings available today. Book now to lock your spot.</p>

              {/* Hero ZIP ETA widget */}
              <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-slate-400 text-xs mb-2 font-medium">Enter your ZIP to see how far we are →</p>
                <div className="flex gap-2">
                  <input
                    ref={heroInputRef}
                    type="text"
                    inputMode="numeric"
                    value={heroZip}
                    maxLength={5}
                    onChange={(e) => {
                      setHeroZip(e.target.value.replace(/\D/g, "").slice(0, 5));
                      setHeroEtaData(null);
                      setHeroEtaError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && lookupHeroEta()}
                    placeholder="Your ZIP code"
                    className="flex-1 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm px-3 py-2 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 min-w-0"
                  />
                  <button
                    onClick={lookupHeroEta}
                    disabled={heroEtaLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 transition-colors shrink-0"
                  >
                    {heroEtaLoading ? (
                      <Zap className="h-3.5 w-3.5 animate-pulse" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
                    Check
                  </button>
                </div>
                {heroEtaError && <p className="mt-1.5 text-xs text-slate-400">{heroEtaError}</p>}
                {heroEtaData && (
                  <div className={`mt-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                    heroEtaData.availabilityLabel === "far"
                      ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-200"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  }`}>
                    {heroEtaData.availabilityLabel !== "far" ? (
                      <span className="relative flex h-2 w-2 flex-shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                      </span>
                    ) : (
                      <span className="h-2 w-2 flex-shrink-0 rounded-full bg-yellow-400" />
                    )}
                    {heroEtaData.availabilityLabel === "far" ? (
                      <span>We serve this area — contact us to confirm availability</span>
                    ) : (
                      <span>
                        {heroEtaData.crewCount > 0 ? `${heroEtaData.crewCount} Mover${heroEtaData.crewCount > 1 ? "s" : ""} Online · ` : ""}
                        ~{heroEtaData.estimatedMinutes < 60
                          ? `${heroEtaData.estimatedMinutes} min away`
                          : `${Math.floor(heroEtaData.estimatedMinutes / 60)} hr${Math.floor(heroEtaData.estimatedMinutes / 60) > 1 ? "s" : ""}${heroEtaData.estimatedMinutes % 60 > 0 ? ` ${heroEtaData.estimatedMinutes % 60} min` : ""} away`}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Quick Book panel */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-5 shadow-2xl">
              <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-1">Quick Book</p>
              <h2 className="text-white font-bold text-xl mb-1">Start Here — Price Your Move Fast</h2>
              <p className="text-slate-400 text-sm mb-4">Pick a starting option, then finish your quote in seconds.</p>
              <div className="space-y-2.5">
                <button onClick={() => scrollToGetStarted("calculator")} className="w-full text-left">
                  <div className="flex items-center justify-between bg-slate-700/60 hover:bg-blue-600/20 border border-slate-600/60 hover:border-blue-500/60 rounded-xl px-4 py-3 cursor-pointer transition-all group">
                    <div>
                      <p className="text-white font-semibold text-sm">2 Movers — from $300</p>
                      <p className="text-slate-400 text-xs">2-hour minimum · best for small moves</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-blue-400 transition-colors" />
                  </div>
                </button>
                <button onClick={() => scrollToGetStarted("calculator")} className="w-full text-left">
                  <div className="flex items-center justify-between bg-blue-600/20 border border-blue-500/60 rounded-xl px-4 py-3 cursor-pointer hover:bg-blue-600/30 transition-all group relative">
                    <div className="absolute -top-2 left-4">
                      <span className="bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Most Popular</span>
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm pt-1">3 Movers — Most Popular</p>
                      <p className="text-blue-200 text-xs">Flexible duration · takes top jobs</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-blue-400 group-hover:text-white transition-colors" />
                  </div>
                </button>
                <button onClick={() => scrollToGetStarted("guided")} className="w-full text-left">
                  <div className="flex items-center justify-between bg-slate-700/60 hover:bg-orange-500/20 border border-slate-600/60 hover:border-orange-500/60 rounded-xl px-4 py-3 cursor-pointer transition-all group">
                    <div>
                      <p className="text-white font-semibold text-sm">Junk Removal — from $150</p>
                      <p className="text-slate-400 text-xs">Fast local pickup</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-orange-400 transition-colors" />
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHY PEOPLE CHOOSE US ── */}
      <section className="py-10 px-4 bg-slate-950/50">
        <div className="max-w-5xl mx-auto">
          <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest text-center mb-2">Trust</p>
          <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-8">Why People Choose JC ON THE MOVE</h2>

          {/* Stat blocks */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { value: "500+", label: "Jobs Completed" },
              { value: "5.0", label: "Average Rating" },
              { value: "Same-Day", label: "Availability" },
              { value: "Ironwood", label: "Based in Ironwood, MI" },
            ].map(({ value, label }) => (
              <div key={label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
                <p className="text-white font-extrabold text-2xl md:text-3xl">{value}</p>
                <p className="text-slate-400 text-xs mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Trust lines */}
          <div className="flex flex-wrap justify-center gap-x-10 gap-y-3">
            {[
              "No hidden fees.",
              "Professional, uniformed crews.",
              "Fast scheduling & clear communication.",
            ].map((line) => (
              <div key={line} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-slate-300 text-sm">{line}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── POPULAR SERVICE PACKAGES ── */}
      <section className="py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest">Services</p>
            <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">Popular Packages</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">Popular Service Packages</h2>
          <p className="text-slate-400 text-sm mb-6">Transparent flat-rate pricing — no hidden fees, no surprises.</p>

          <div className="grid md:grid-cols-3 gap-5">
            {servicePackages.map((pkg, i) => {
              const Icon = pkg.icon;
              const discountedPrice = pkg.price && pkg.discountPercent
                ? pkg.price * (1 - pkg.discountPercent / 100)
                : null;
              const savings = pkg.price && pkg.discountPercent
                ? pkg.price * (pkg.discountPercent / 100)
                : null;
              return (
                <div key={i} className="flex flex-col rounded-2xl overflow-hidden border border-slate-700/50 shadow-lg bg-slate-900">
                  {/* Image / icon placeholder */}
                  <div className={`relative h-36 bg-gradient-to-br ${pkg.gradientFrom} ${pkg.gradientTo} flex items-center justify-center`}>
                    <Icon className="h-14 w-14 text-white/30" />
                    <span className={`absolute top-3 left-3 text-xs font-bold px-2.5 py-1 rounded-full ${pkg.badgeColor}`}>
                      {pkg.badge}
                    </span>
                  </div>

                  {/* Card body */}
                  <div className="flex flex-col flex-1 p-5">
                    <h3 className="text-white font-bold text-lg mb-3">{pkg.title}</h3>

                    {/* Price box */}
                    <div className="mb-4 rounded-xl bg-slate-800/70 border border-slate-700/50 p-3">
                      {pkg.price ? (
                        discountedPrice && savings ? (
                          <>
                            <div className="flex items-baseline gap-2">
                              <span className="text-slate-500 line-through text-sm">${pkg.price}</span>
                              <span className="text-emerald-400 text-xs font-semibold">Save ${savings.toFixed(2)} (5% off)</span>
                            </div>
                            <p className="text-white font-extrabold text-2xl">${discountedPrice.toFixed(2)}</p>
                            <p className="text-emerald-400 text-xs mt-0.5 font-medium">Instant online booking discount applied</p>
                          </>
                        ) : (
                          <p className="text-white font-extrabold text-2xl">${pkg.price}</p>
                        )
                      ) : (
                        <>
                          <p className="text-white font-extrabold text-2xl">$150+</p>
                          <p className="text-slate-400 text-xs mt-0.5">Price based on load size</p>
                        </>
                      )}
                    </div>

                    {/* Bullet points */}
                    <ul className="space-y-2 mb-5 flex-1">
                      {pkg.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-2 text-slate-300 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                          {bullet}
                        </li>
                      ))}
                    </ul>

                    {/* CTA button */}
                    <Link href={pkg.ctaHref}>
                      <Button className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl py-2.5">
                        {pkg.ctaLabel}
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── GET STARTED — UNIFIED ENTRY SECTION ── */}
      <section id="get-started" className="py-10 px-4 bg-slate-950/60">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-[1fr_300px] gap-8 items-start">

            {/* Left: Tabbed entry (calculator or guided chatbot) */}
            <div>
              {/* Phone escape hatch */}
              <a href="tel:+19062859312" className="flex items-center gap-3 mb-5 bg-slate-800/70 border border-slate-600/60 hover:border-blue-500/50 rounded-xl px-4 py-3 transition-all group">
                <Phone className="h-5 w-5 text-blue-400 flex-shrink-0" />
                <div>
                  <p className="text-white font-semibold text-sm">Prefer to talk? Call <span className="text-blue-300">(906) 285-9312</span></p>
                  <p className="text-slate-400 text-xs">A real person will help you — no forms required.</p>
                </div>
              </a>

              {/* Section label */}
              <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-1">Get Started</p>
              <h2 className="text-white font-bold text-2xl mb-4">How would you like to begin?</h2>

              {/* Tab switch */}
              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <button
                  onClick={() => setEntryMode("calculator")}
                  className={`flex-1 flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                    entryMode === "calculator"
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600"
                  }`}
                >
                  <Calculator className={`h-5 w-5 mt-0.5 shrink-0 ${entryMode === "calculator" ? "text-blue-400" : "text-slate-500"}`} />
                  <div>
                    <p className={`font-semibold text-sm ${entryMode === "calculator" ? "text-white" : "text-slate-300"}`}>Instant Pricing</p>
                    <p className="text-slate-500 text-xs mt-0.5">Know roughly what you need? Build your move and see pricing now.</p>
                  </div>
                </button>
                <button
                  onClick={() => setEntryMode("guided")}
                  className={`flex-1 flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                    entryMode === "guided"
                      ? "border-teal-500 bg-teal-500/10"
                      : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600"
                  }`}
                >
                  <MessageSquare className={`h-5 w-5 mt-0.5 shrink-0 ${entryMode === "guided" ? "text-teal-400" : "text-slate-500"}`} />
                  <div>
                    <p className={`font-semibold text-sm ${entryMode === "guided" ? "text-white" : "text-slate-300"}`}>Guided Questions</p>
                    <p className="text-slate-500 text-xs mt-0.5">Not sure what service fits? We'll ask a few quick questions and help you figure it out.</p>
                  </div>
                </button>
              </div>

              {/* Tab content */}
              {entryMode === "calculator" ? (
                <HomepageBookingCalculator />
              ) : (
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
                  <BookingChatbot embedded />
                </div>
              )}
            </div>

            {/* Right: Services Snapshot */}
            <div>
              <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-1">Services Snapshot</p>
              <h3 className="text-white font-bold text-xl mb-2">What We Do Most</h3>
              <p className="text-slate-400 text-sm mb-5">The services people turn to us for every day.</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Truck, label: "Moving", sub: "Tap to price a move", mode: "calculator" as const, iconCls: "text-blue-400", borderCls: "hover:border-blue-500/50" },
                  { icon: Trash2, label: "Junk Removal", sub: "Tap to get a quote", mode: "guided" as const, iconCls: "text-orange-400", borderCls: "hover:border-orange-500/50" },
                  { icon: Sparkles, label: "Labor Help", sub: "Tap to get a quote", mode: "guided" as const, iconCls: "text-teal-400", borderCls: "hover:border-teal-500/50" },
                  { icon: Snowflake, label: "Snow Removal", sub: "Tap to request service", mode: "guided" as const, iconCls: "text-cyan-400", borderCls: "hover:border-cyan-500/50" },
                ].map(({ icon: Icon, label, sub, mode, iconCls, borderCls }) => (
                  <button key={label} onClick={() => scrollToGetStarted(mode)} className="text-left">
                    <div className={`bg-slate-800/60 border border-slate-700/50 ${borderCls} rounded-xl p-4 cursor-pointer hover:bg-slate-700/60 transition-all group`}>
                      <Icon className={`h-7 w-7 ${iconCls} mb-2`} />
                      <p className="text-white font-semibold text-sm">{label}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{sub}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Custom quote strip */}
              <button
                onClick={() => setQuoteOpen(true)}
                className="mt-4 w-full flex items-center gap-3 bg-slate-800/60 border border-dashed border-slate-600/70 hover:border-blue-500/60 hover:bg-slate-700/60 rounded-xl px-4 py-3 text-left transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/25 transition-colors">
                  <Send className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold leading-tight">Need a custom quote?</p>
                  <p className="text-slate-500 text-xs mt-0.5">Specialty jobs, large moves, or anything unique</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-blue-400 ml-auto flex-shrink-0 transition-colors" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest text-center mb-2">Testimonials</p>
          <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-2">What Customers Say</h2>
          <p className="text-slate-400 text-sm text-center mb-8">Short, honest proof from recent customers.</p>
          <div className="grid md:grid-cols-3 gap-5">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-slate-200 text-sm italic mb-4">"{t.quote}"</p>
                <div>
                  <p className="text-white font-semibold text-sm">{t.name}</p>
                  <p className="text-slate-500 text-xs">{t.service}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CUSTOM QUOTE DIALOG ── */}
      <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
        <DialogContent className="bg-slate-900 border border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-xl font-bold">Need a Custom Quote?</DialogTitle>
            <p className="text-slate-400 text-sm">For specialty jobs, large moves, or anything outside the calculator — send us your details and we'll be in touch within 24 hours.</p>
            <div className="flex flex-wrap gap-3 pt-1">
              {[
                { icon: Shield, label: "Licensed & Insured" },
                { icon: Zap, label: "Fast response" },
                { icon: CheckCircle2, label: "No obligation" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-slate-400 text-xs">
                  <Icon className="h-3 w-3 text-blue-400" />{label}
                </div>
              ))}
            </div>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 mt-2">

                {/* Service Type */}
                <div>
                  <Label className="block text-sm font-medium text-white mb-3">Service Type *</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {serviceOptions.map((service) => {
                      const IconComponent = service.icon;
                      return (
                        <label key={service.value} className="relative cursor-pointer">
                          <input
                            type="radio"
                            value={service.value}
                            className="peer sr-only"
                            {...form.register("serviceType", { required: true })}
                          />
                          <div className="p-3 border border-slate-600 rounded-xl cursor-pointer peer-checked:border-blue-500 peer-checked:bg-blue-500/10 transition-colors text-center">
                            <IconComponent className="h-6 w-6 text-blue-400 mx-auto mb-1" />
                            <span className="text-slate-200 text-xs font-medium block">{service.label}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {form.formState.errors.serviceType && (
                    <p className="text-red-400 text-xs mt-1">Service type is required</p>
                  )}
                </div>

                {/* Name */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName" className="text-slate-300 text-sm mb-1.5 block">First Name *</Label>
                    <Input
                      id="firstName"
                      placeholder="Enter your first name"
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                      {...form.register("firstName")}
                    />
                    {form.formState.errors.firstName && (
                      <p className="text-red-400 text-xs mt-1">{form.formState.errors.firstName.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="lastName" className="text-slate-300 text-sm mb-1.5 block">Last Name *</Label>
                    <Input
                      id="lastName"
                      placeholder="Enter your last name"
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                      {...form.register("lastName")}
                    />
                    {form.formState.errors.lastName && (
                      <p className="text-red-400 text-xs mt-1">{form.formState.errors.lastName.message}</p>
                    )}
                  </div>
                </div>

                {/* Email + Phone */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email" className="text-slate-300 text-sm mb-1.5 block">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                      {...form.register("email")}
                    />
                    {form.formState.errors.email && (
                      <p className="text-red-400 text-xs mt-1">{form.formState.errors.email.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-slate-300 text-sm mb-1.5 block">Phone Number *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                      {...form.register("phone")}
                    />
                    {form.formState.errors.phone && (
                      <p className="text-red-400 text-xs mt-1">{form.formState.errors.phone.message}</p>
                    )}
                  </div>
                </div>

                {/* Addresses */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="fromAddress" className="text-slate-300 text-sm mb-1.5 block">Service Address *</Label>
                    <Input
                      id="fromAddress"
                      placeholder="Where do you need service?"
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                      {...form.register("fromAddress")}
                    />
                    {form.formState.errors.fromAddress && (
                      <p className="text-red-400 text-xs mt-1">{form.formState.errors.fromAddress.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="toAddress" className="text-slate-300 text-sm mb-1.5 block">Destination (if moving)</Label>
                    <Input
                      id="toAddress"
                      placeholder="Destination address"
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                      {...form.register("toAddress")}
                    />
                  </div>
                </div>

                {/* Date + Property Size */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="moveDate" className="text-slate-300 text-sm mb-1.5 block">Preferred Date</Label>
                    <Input
                      id="moveDate"
                      type="date"
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                      {...form.register("moveDate")}
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300 text-sm mb-1.5 block">Property Size</Label>
                    <Select onValueChange={(value) => form.setValue("propertySize", value)}>
                      <SelectTrigger className="bg-slate-700/50 border-slate-600 text-slate-300 focus:border-blue-500">
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="studio">Studio/1 BR</SelectItem>
                        <SelectItem value="2br">2-3 Bedroom</SelectItem>
                        <SelectItem value="4br">4+ Bedroom</SelectItem>
                        <SelectItem value="office">Small Office</SelectItem>
                        <SelectItem value="large-office">Large Office</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Details */}
                <div>
                  <Label htmlFor="details" className="text-slate-300 text-sm mb-1.5 block">Additional Details</Label>
                  <Textarea
                    id="details"
                    rows={3}
                    placeholder="Tell us more about your move... (special items, stairs, parking, etc.)"
                    className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500 resize-none"
                    {...form.register("details")}
                  />
                </div>

                {/* Promo Code */}
                <div>
                  <Label htmlFor="promoCode" className="text-slate-300 text-sm mb-1.5 block">Promo Code (optional)</Label>
                  <Input
                    id="promoCode"
                    placeholder="Enter promo code for savings"
                    className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                    {...form.register("promoCode")}
                  />
                </div>

                {/* Photo Upload */}
                <div>
                  <Label htmlFor="photoUpload" className="text-slate-300 text-sm mb-1.5 block">Add Photos (optional)</Label>
                  <p className="text-slate-500 text-xs mb-2">Select up to 5 photos to help us provide an accurate quote.</p>
                  <label
                    htmlFor="photoUpload"
                    className="flex flex-col items-center justify-center border-2 border-dashed border-slate-600 rounded-xl p-6 text-center hover:border-blue-500/50 transition-colors cursor-pointer"
                  >
                    {photoFiles && photoFiles.length > 0 ? (
                      <p className="text-slate-300 text-sm">{photoFiles.length} photo{photoFiles.length !== 1 ? "s" : ""} selected</p>
                    ) : (
                      <p className="text-slate-400 text-sm">Tap to add photos</p>
                    )}
                    <input
                      id="photoUpload"
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      onChange={(e) => setPhotoFiles(e.target.files)}
                    />
                  </label>
                </div>

                {/* SMS Consent */}
                <div className="flex items-start space-x-3 p-4 bg-slate-700/30 rounded-xl border border-slate-600/50">
                  <Checkbox
                    id="smsConsent"
                    checked={form.watch("smsConsent") ?? false}
                    onCheckedChange={(checked) => form.setValue("smsConsent", checked === true)}
                  />
                  <div className="grid gap-1 leading-none">
                    <Label htmlFor="smsConsent" className="text-slate-200 text-sm font-medium cursor-pointer">
                      I agree to receive text messages
                    </Label>
                    <p className="text-xs text-slate-500">
                      By checking this box, you consent to receive SMS notifications about your quote and service updates from JC ON THE MOVE. Message and data rates may apply. Reply STOP to unsubscribe.
                    </p>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 text-base rounded-xl"
                  disabled={submitLead.isPending}
                >
                  <Send className="mr-2 h-5 w-5" />
                  {submitLead.isPending ? "Submitting..." : "Start My Move"}
                </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── NORTHWOODS NETWORK ── */}
      <section className="py-14 px-4 bg-gradient-to-b from-slate-950/80 to-slate-900/60">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 text-yellow-400 mb-3">
              <Gift className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-widest">Northwoods Network</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Use Your Rewards in the Northwoods Network</h2>
            <p className="text-slate-300 text-base max-w-2xl mx-auto">
              Earn JCMOVES rewards when you book a move, then spend them like store credit at local partner businesses.
            </p>
          </div>

          {/* Value bar */}
          <div className="flex flex-col sm:flex-row justify-center gap-6 mb-10 text-sm text-slate-300">
            <div className="flex items-center gap-2 justify-center">
              <Star className="h-4 w-4 text-yellow-400 fill-yellow-400 flex-shrink-0" />
              <span>Most customers earn $25–$100 in rewards per job</span>
            </div>
            <div className="flex items-center gap-2 justify-center">
              <CheckCircle2 className="h-4 w-4 text-blue-400 flex-shrink-0" />
              <span>Spend rewards locally — like store credit</span>
            </div>
          </div>

          {/* Featured partner card */}
          <div className="bg-slate-800/70 border border-blue-500/20 rounded-2xl p-6 md:p-8 max-w-3xl mx-auto mb-8 shadow-xl">
            <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-4">✨ Featured Local Partner</p>

            <h3 className="text-xl font-bold text-white mb-2">Nature Made Jewls</h3>
            <p className="text-slate-300 text-sm mb-6">
              Handcrafted jewelry — copper wire, natural stone, custom designs. Purchased using your JCMOVES rewards.
            </p>

            {/* Ashley testimonial */}
            <div className="bg-slate-900/70 border border-white/5 rounded-xl p-4 mb-6">
              <p className="text-slate-200 text-sm italic mb-2">
                "I used my moving rewards to get jewelry — didn't expect that. Super cool."
              </p>
              <p className="text-slate-500 text-xs">— Ashley R.</p>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <Link href="/nature-made-jewls">
                <Button className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl text-base w-full sm:w-auto">
                  Shop with Rewards →
                </Button>
              </Link>
              <button
                onClick={() => scrollToGetStarted("calculator")}
                className="border border-slate-600 text-slate-300 hover:bg-slate-700/60 font-semibold px-6 py-3 rounded-xl text-base transition-all w-full sm:w-auto text-center"
              >
                How Rewards Work
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Use JCMOVES rewards just like store credit at select local businesses.
            </p>
          </div>

          {/* Final CTA */}
          <div className="text-center">
            <p className="text-slate-400 text-base mb-5">Book a move → Earn rewards → Spend locally</p>
            <Button
              onClick={() => scrollToGetStarted("calculator")}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-4 rounded-xl text-lg"
            >
              Get My Price →
            </Button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-slate-950 border-t border-slate-800/60 py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">

            {/* Company info */}
            <div>
              <h3 className="text-white font-bold text-base mb-3">JC ON THE MOVE LLC</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Local moving, junk removal, and labor support built for Northwoods homes and businesses.
              </p>
            </div>

            {/* Start Here */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Start Here</h4>
              <ul className="space-y-2">
                {[
                  { label: "Free quote", href: "/quote" },
                  { label: "Junk removal", href: "/quote?service=junk" },
                  { label: "Snow service", href: "/quote?service=snow" },
                ].map(({ label, href }) => (
                  <li key={label}>
                    <Link href={href}>
                      <span className="text-slate-400 hover:text-white text-sm transition-colors cursor-pointer">{label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Company</h4>
              <ul className="space-y-2">
                {[
                  { label: "Leave a review", href: "/reviews" },
                  { label: "Terms of service", href: "/terms" },
                  { label: "Privacy policy", href: "/privacy" },
                ].map(({ label, href }) => (
                  <li key={label}>
                    <Link href={href}>
                      <span className="text-slate-400 hover:text-white text-sm transition-colors cursor-pointer">{label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Contact</h4>
              <ul className="space-y-2">
                <li>
                  <a href="tel:+19062859312" className="text-slate-400 hover:text-white text-sm transition-colors">
                    (906) 285-9312
                  </a>
                </li>
                <li>
                  <span className="text-slate-400 text-sm">Ironwood and Iron River, MI</span>
                </li>
                <li>
                  <span className="text-slate-400 text-sm">Green Bay and Wausau, WI</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800/60 pt-6 text-center">
            <p className="text-slate-600 text-xs">&copy; {new Date().getFullYear()} JC ON THE MOVE LLC. All rights reserved.</p>
          </div>
        </div>
      </footer>

    </div>
  );
}
