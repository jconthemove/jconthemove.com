import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Truck, Trash2, Snowflake, Sparkles, Wrench, HardHat, Layers, PaintBucket,
  CheckCircle2, Star, Shield, Zap, MapPin, Phone, Gift,
  ArrowRight, CalendarCheck, MessageCircle, Droplets, Home, Leaf, RefreshCcw,
  type LucideIcon
} from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { Link } from "wouter";

interface Testimonial {
  id: string;
  reviewerName: string;
  rating: number;
  content: string;
  serviceType: string | null;
  sourcePlatform: string | null;
  featured: boolean;
}

const FALLBACK_TESTIMONIALS: Testimonial[] = [
  { id: "f1", reviewerName: "Sarah M.", rating: 5, content: "Fast, careful, and professional. Highly recommend.", serviceType: "Moving", sourcePlatform: null, featured: true },
  { id: "f2", reviewerName: "James D.", rating: 5, content: "Best movers in the Northwoods. Showed up on time and got it done.", serviceType: "Moving", sourcePlatform: null, featured: true },
  { id: "f3", reviewerName: "Linda K.", rating: 5, content: "Easy booking, clear pricing, and a crew that works hard.", serviceType: "Moving", sourcePlatform: null, featured: true },
];

const BANNER_MESSAGES = [
  "🚛 Same-Day Moves Available",
  "⭐ 5-Star Local Movers",
  "💪 500+ Jobs Completed",
  "📞 Call Now — (906) 285-9312",
];

export default function HomePage() {
  const [bannerIdx, setBannerIdx] = useState(0);

  const { data: liveTestimonials } = useQuery<Testimonial[]>({
    queryKey: ["/api/testimonials?status=published&featured=true&limit=3"],
    staleTime: 5 * 60 * 1000,
  });
  const displayTestimonials = (liveTestimonials && liveTestimonials.length > 0)
    ? liveTestimonials.slice(0, 3)
    : FALLBACK_TESTIMONIALS;

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
                  { icon: CheckCircle2, label: "20+ Years Experience" },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
                    <Icon className="h-3.5 w-3.5 text-blue-400" />
                    <span className="text-white/80 text-xs font-medium">{label}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/book">
                  <Button className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-7 py-3 text-lg rounded-xl">
                    <CalendarCheck className="h-5 w-5 mr-2" />
                    Book a Job
                  </Button>
                </Link>
                <Link href="/quote">
                  <Button variant="outline" className="border-slate-600 text-white hover:bg-slate-700 font-bold px-6 py-2.5 text-base rounded-xl">
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Get a Quote
                  </Button>
                </Link>
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

            {/* Right: CTA card */}
            <div className="flex flex-col gap-4">
              <Link href="/quote" className="block">
                <div className="group bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/60 hover:border-slate-500 rounded-2xl p-6 shadow-xl cursor-pointer transition-all duration-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
                      <MessageCircle className="h-5 w-5 text-blue-400" />
                    </div>
                    <ArrowRight className="h-5 w-5 text-slate-500 group-hover:text-white group-hover:translate-x-1 transition-all" />
                  </div>
                  <p className="text-white font-extrabold text-xl mb-1">Get a Quote</p>
                  <p className="text-slate-400 text-sm">Not sure what you need? Describe your job and we'll get back to you with a custom quote within 24 hours.</p>
                </div>
              </Link>

              <a href="tel:+19062859312" className="flex items-center justify-center gap-2 rounded-xl border border-slate-700/60 hover:border-slate-500 bg-slate-900/60 hover:bg-slate-800/60 px-4 py-3 text-slate-300 hover:text-white transition-all text-sm font-medium">
                <Phone className="h-4 w-4 text-blue-400" />
                Prefer to call? (906) 285-9312
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── SERVICES GRID ── */}
      <section className="py-10 px-4 bg-slate-950/60">
        <div className="max-w-5xl mx-auto">
          <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest text-center mb-2">What We Do</p>
          <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-2">All Services</h2>
          <p className="text-slate-400 text-sm text-center mb-8">Tap any service to start booking or get a quote.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {([
              { icon: Truck,        label: "Moving",         sub: "Local & long distance",  href: "/book?service=moving",       iconCls: "text-blue-400",   borderCls: "hover:border-blue-500/50"    },
              { icon: Trash2,       label: "Junk Removal",   sub: "Haul away & disposal",   href: "/book?service=junk",         iconCls: "text-orange-400", borderCls: "hover:border-orange-500/50"  },
              { icon: RefreshCcw,   label: "Trash Valet",    sub: "Weekly curbside pickup",  href: "/book?service=trash-valet",  iconCls: "text-green-400",  borderCls: "hover:border-green-500/50"   },
              { icon: Droplets,     label: "Window Cleaning",sub: "Streak-free guarantee",   href: "/book?service=window",       iconCls: "text-sky-400",    borderCls: "hover:border-sky-500/50"     },
              { icon: Sparkles,     label: "Move-In/Out",    sub: "Cleaning & labor",        href: "/book?service=cleaning",     iconCls: "text-teal-400",   borderCls: "hover:border-teal-500/50"    },
              { icon: Snowflake,    label: "Snow Removal",   sub: "Plowing & shoveling",    href: "/book?service=snow",         iconCls: "text-cyan-400",   borderCls: "hover:border-cyan-500/50"    },
              { icon: Wrench,       label: "Handyman",        sub: "General repairs",        href: "/book?service=handyman",     iconCls: "text-yellow-400", borderCls: "hover:border-yellow-500/50"  },
              { icon: HardHat,      label: "Light Demo",      sub: "Tear-out & cleanout",    href: "/book?service=demolition",   iconCls: "text-red-400",    borderCls: "hover:border-red-500/50"     },
              { icon: Layers,       label: "Flooring",        sub: "Install & removal",      href: "/book?service=flooring",     iconCls: "text-purple-400", borderCls: "hover:border-purple-500/50"  },
              { icon: PaintBucket,  label: "Painting",        sub: "Interior & exterior",    href: "/book?service=painting",     iconCls: "text-pink-400",   borderCls: "hover:border-pink-500/50"    },
              { icon: Home,         label: "Roofing",         sub: "Repair & replacement",   href: "/book?service=roofing",      iconCls: "text-amber-400",  borderCls: "hover:border-amber-500/50"   },
              { icon: Leaf,         label: "Lawn Care",       sub: "Mowing, trimming & more",href: "/book/lawn-care",            iconCls: "text-lime-400",   borderCls: "hover:border-lime-500/50"    },
            ] as { icon: LucideIcon; label: string; sub: string; href: string; iconCls: string; borderCls: string; comingSoon?: boolean }[]).map(({ icon: Icon, label, sub, href, iconCls, borderCls, comingSoon }) => (
              <Link key={label} href={comingSoon ? "#" : href} className="block" onClick={comingSoon ? (e) => e.preventDefault() : undefined}>
                <div className={`relative bg-slate-800/60 border border-slate-700/50 ${comingSoon ? "opacity-75 cursor-default" : `${borderCls} cursor-pointer hover:bg-slate-700/60`} rounded-xl p-4 transition-all h-full`}>
                  {comingSoon && (
                    <span className="absolute top-2 right-2 text-[9px] font-bold bg-lime-500/20 text-lime-400 border border-lime-500/30 rounded-full px-1.5 py-0.5 uppercase tracking-wider">Soon</span>
                  )}
                  <Icon className={`h-7 w-7 ${iconCls} mb-2`} />
                  <p className="text-white font-semibold text-sm">{label}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{sub}</p>
                </div>
              </Link>
            ))}
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
            {displayTestimonials.map((t) => (
              <div key={t.id} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex gap-0.5">
                    {Array.from({ length: t.rating }).map((_, j) => (
                      <Star key={j} className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                    ))}
                  </div>
                  {t.sourcePlatform === "google" && (
                    <SiGoogle className="h-4 w-4 text-blue-400" title="Google Review" />
                  )}
                </div>
                <p className="text-slate-200 text-sm italic mb-4">"{t.content}"</p>
                <div>
                  <p className="text-white font-semibold text-sm">{t.reviewerName}</p>
                  {t.serviceType && <p className="text-slate-500 text-xs">{t.serviceType}</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-6">
            <Link href="/reviews">
              <span className="text-slate-400 hover:text-white text-sm underline underline-offset-4 cursor-pointer transition-colors">
                See all reviews →
              </span>
            </Link>
          </div>
        </div>
      </section>

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
              <Link href="/book">
                <button className="border border-slate-600 text-slate-300 hover:bg-slate-700/60 font-semibold px-6 py-3 rounded-xl text-base transition-all w-full sm:w-auto text-center">
                  Start Earning Rewards
                </button>
              </Link>
            </div>
            <p className="text-xs text-slate-500">
              Use JCMOVES rewards just like store credit at select local businesses.
            </p>
          </div>

          {/* Final CTA */}
          <div className="text-center">
            <p className="text-slate-400 text-base mb-5">Book a move → Earn rewards → Spend locally</p>
            <Link href="/book">
              <Button className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-4 rounded-xl text-lg">
                <CalendarCheck className="h-5 w-5 mr-2" />
                Get Started →
              </Button>
            </Link>
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
