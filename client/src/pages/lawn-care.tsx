import { useState } from "react";
import { useLocation } from "wouter";
import { Leaf, CheckCircle2, Clock, Users, ChevronLeft, Phone, MessageCircle, Calendar } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookingChatbot } from "@/components/booking-chatbot";
import { Button } from "@/components/ui/button";

const SERVICES = [
  { emoji: "🌿", label: "Mowing", desc: "Grass cut to height, clippings cleared or mulched" },
  { emoji: "✂️", label: "Trimming & Edging", desc: "Crisp lines along walks, drives & beds" },
  { emoji: "🍂", label: "Yard Cleanup", desc: "Leaf removal, debris clearing, and general tidy-up" },
  { emoji: "🌱", label: "Fertilization", desc: "Seasonal nutrients to keep your lawn thick & green" },
  { emoji: "🌾", label: "Overseeding", desc: "Fill in bare spots and strengthen the turf" },
  { emoji: "✂️", label: "Hedge Trimming", desc: "Shrubs and hedges shaped neat and clean" },
];

const PACKAGES = [
  {
    label: "One-Time Cleanup",
    emoji: "🍂",
    desc: "Single visit to get your yard back in shape — mow, trim, and blow",
    tags: ["1–2 hrs", "1–2 crew"],
    color: "from-green-600/20 to-green-900/10",
    border: "border-green-600/30",
  },
  {
    label: "Weekly Service",
    emoji: "📅",
    desc: "Regular weekly mowing, trim & edge — best rate for ongoing care",
    tags: ["Recurring", "Best Value"],
    color: "from-emerald-600/20 to-emerald-900/10",
    border: "border-emerald-500/50",
    tag: "Most Popular",
  },
  {
    label: "Full Service",
    emoji: "🏡",
    desc: "Mowing + trimming + edging + blowing — everything in one visit",
    tags: ["1–3 hrs", "1–2 crew"],
    color: "from-teal-600/20 to-teal-900/10",
    border: "border-teal-600/30",
  },
];

const FAQS = [
  { q: "Do you do seasonal cleanups?", a: "Yes — spring and fall cleanups are some of our most popular services. Leaf removal, bed cleanup, and more." },
  { q: "How long does a standard mow take?", a: "Typically 45–90 minutes depending on lawn size. Larger lots take proportionally longer." },
  { q: "Can I get a recurring schedule?", a: "Absolutely — weekly, bi-weekly, and monthly plans available. Recurring customers get priority scheduling." },
  { q: "Do you bring your own equipment?", a: "Yes — we supply all mowers, trimmers, blowers, and tools." },
];

export default function LawnCarePage() {
  const [, setLocation] = useLocation();
  const [showChatbot, setShowChatbot] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24">
      <div className="max-w-[480px] mx-auto px-4 pt-4 space-y-5">

        {/* Back */}
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-1.5 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        {/* Hero Placard */}
        <div
          className="relative rounded-3xl overflow-hidden"
          style={{
            background: "linear-gradient(160deg, #071c0a 0%, #0d2e12 35%, #071808 65%, #030d04 100%)",
            boxShadow: "0 0 0 1.5px rgba(34,197,94,0.18), 0 8px 40px rgba(0,0,0,0.7)",
          }}
        >
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.05) 3px, rgba(255,255,255,0.05) 4px)`,
            }}
          />
          <div className="relative z-10 px-5 pt-6 pb-5 space-y-4">
            <div className="text-center space-y-1">
              <p className="text-green-400 text-xs font-bold uppercase tracking-[0.25em]">🌿 Lawn Care</p>
              <h1 className="text-4xl font-black leading-none tracking-tight text-white"
                style={{ textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>
                SHARP LAWN.
              </h1>
              <h1 className="text-4xl font-black leading-none tracking-tight"
                style={{ color: "#4ade80", textShadow: "0 2px 16px rgba(74,222,128,0.4)" }}>
                ZERO HASSLE.
              </h1>
              <p className="text-zinc-300 text-sm font-medium mt-2">
                Mowing, trimming, cleanups & more.
              </p>
            </div>

            <div
              className="rounded-2xl px-4 py-3"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}
            >
              <p className="text-green-400 text-[10px] font-black uppercase tracking-widest mb-2">We Handle</p>
              <div className="grid grid-cols-2 gap-1">
                {["Mowing", "Trimming & Edging", "Leaf Removal", "Fertilization"].map((item) => (
                  <div key={item} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-green-400 flex-shrink-0" />
                    <span className="text-zinc-200 text-xs">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1 rounded-xl px-3 py-2 text-center"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(34,197,94,0.15)" }}>
                <Clock className="h-4 w-4 text-green-400 mx-auto mb-1" />
                <p className="text-white text-sm font-bold">1–3 hrs</p>
                <p className="text-zinc-500 text-[10px]">per visit</p>
              </div>
              <div className="flex-1 rounded-xl px-3 py-2 text-center"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(34,197,94,0.15)" }}>
                <Users className="h-4 w-4 text-green-400 mx-auto mb-1" />
                <p className="text-white text-sm font-bold">1–2 crew</p>
                <p className="text-zinc-500 text-[10px]">per job</p>
              </div>
              <div className="flex-1 rounded-xl px-3 py-2 text-center"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(34,197,94,0.15)" }}>
                <Calendar className="h-4 w-4 text-green-400 mx-auto mb-1" />
                <p className="text-white text-sm font-bold">Weekly</p>
                <p className="text-zinc-500 text-[10px]">plans avail.</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={() => setShowChatbot(true)}
            className="flex-1 h-12 bg-green-700 hover:bg-green-600 text-white font-bold text-sm rounded-2xl"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Get a Free Quote
          </Button>
          <Button
            onClick={() => window.open("tel:+19062859312", "_self")}
            variant="outline"
            className="h-12 px-4 border-zinc-700 text-zinc-300 hover:text-white rounded-2xl"
          >
            <Phone className="h-4 w-4" />
          </Button>
        </div>

        {/* Packages */}
        <div>
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Packages</h2>
          <div className="space-y-3">
            {PACKAGES.map((pkg) => (
              <div
                key={pkg.label}
                className={`relative rounded-2xl bg-gradient-to-br ${pkg.color} border ${pkg.border} p-4`}
              >
                {pkg.tag && (
                  <span className="absolute top-3 right-3 text-[9px] font-bold bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-0.5 rounded-full uppercase tracking-wide">
                    {pkg.tag}
                  </span>
                )}
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{pkg.emoji}</span>
                  <div className="flex-1">
                    <p className="font-bold text-white text-sm">{pkg.label}</p>
                    <p className="text-zinc-400 text-xs mt-0.5">{pkg.desc}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {pkg.tags.map((t) => (
                        <span key={t} className="text-[10px] font-semibold text-zinc-400 bg-zinc-800/60 px-2 py-0.5 rounded-full">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Services */}
        <div>
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">All Services</h2>
          <div className="space-y-2">
            {SERVICES.map((svc) => (
              <div key={svc.label} className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
                <span className="text-xl">{svc.emoji}</span>
                <div>
                  <p className="font-bold text-zinc-200 text-sm">{svc.label}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">{svc.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQs */}
        <div>
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">FAQs</h2>
          <div className="space-y-2">
            {FAQS.map((faq, i) => (
              <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <span className="text-sm font-semibold text-zinc-200">{faq.q}</span>
                  <span className="text-zinc-600 text-lg">{openFaq === i ? "−" : "+"}</span>
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-3">
                    <p className="text-zinc-400 text-sm">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <Button
          onClick={() => setShowChatbot(true)}
          className="w-full h-13 bg-green-700 hover:bg-green-600 text-white font-bold text-sm rounded-2xl py-4"
        >
          Book Lawn Care — Get My Free Quote
        </Button>
      </div>

      {/* Chatbot Sheet */}
      <Sheet open={showChatbot} onOpenChange={setShowChatbot}>
        <SheetContent
          side="bottom"
          className="bg-zinc-950 border-zinc-800 rounded-t-3xl pb-10 h-[90vh] flex flex-col overflow-hidden"
        >
          <SheetHeader className="text-left mb-3 shrink-0">
            <SheetTitle className="text-white font-black text-lg">Lawn Care Quote</SheetTitle>
            <p className="text-zinc-400 text-xs">Mowing, trimming & more · Reviewed by Darrell</p>
          </SheetHeader>
          <div className="flex-1 overflow-hidden min-h-0">
            <BookingChatbot
              onClose={() => setShowChatbot(false)}
              embedded={true}
              showCloseButton={false}
              className="h-full"
              initialService="Lawn Care"
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
