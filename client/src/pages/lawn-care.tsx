import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Clock, Users, ChevronLeft, Calendar, MessageCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookingChatbot } from "@/components/booking-chatbot";
import { Button } from "@/components/ui/button";
import ServicePlacard, { getPlacardTheme } from "@/components/ServicePlacard";
import { useSheetBackButton } from "@/hooks/useSheetBackButton";

const PACKAGES = [
  {
    label: "Basic",
    emoji: "🌿",
    desc: "Mow & blow — quick clean cut with clippings cleared. Best for maintained lawns.",
    price: "From $45",
    tags: ["45–75 min", "1–2 crew"],
    color: "from-green-600/20 to-green-900/10",
    border: "border-green-600/30",
  },
  {
    label: "Standard",
    emoji: "✂️",
    desc: "Mow + trim & edge along walks, drives, and beds + blow clean.",
    price: "From $75",
    tags: ["1–2 hrs", "1–2 crew"],
    color: "from-emerald-600/20 to-emerald-900/10",
    border: "border-emerald-500/50",
    tag: "Most Popular",
  },
  {
    label: "Premium",
    emoji: "🏡",
    desc: "Everything in Standard plus leaf removal, fertilization check, and hedge trim.",
    price: "From $130",
    tags: ["2–3 hrs", "1–2 crew"],
    color: "from-teal-600/20 to-teal-900/10",
    border: "border-teal-600/30",
    tag: "Best Value",
  },
];

const SERVICES = [
  { emoji: "🌿", label: "Mowing", desc: "Grass cut to height, clippings cleared or mulched" },
  { emoji: "✂️", label: "Trimming & Edging", desc: "Crisp lines along walks, drives & beds" },
  { emoji: "🍂", label: "Yard Cleanup", desc: "Leaf removal, debris clearing, and general tidy-up" },
  { emoji: "🌱", label: "Fertilization", desc: "Seasonal nutrients to keep your lawn thick & green" },
  { emoji: "🌾", label: "Overseeding", desc: "Fill in bare spots and strengthen the turf" },
  { emoji: "✂️", label: "Hedge Trimming", desc: "Shrubs and hedges shaped neat and clean" },
];

const FAQS = [
  { q: "Do you do seasonal cleanups?", a: "Yes — spring and fall cleanups are some of our most popular services. Leaf removal, bed cleanup, and more." },
  { q: "How long does a standard mow take?", a: "Typically 45–90 minutes depending on lawn size. Larger lots take proportionally longer." },
  { q: "Can I get a recurring schedule?", a: "Absolutely — weekly, bi-weekly, and monthly plans available. Recurring customers get priority scheduling." },
  { q: "Do you bring your own equipment?", a: "Yes — we supply all mowers, trimmers, blowers, and tools." },
];

const theme = getPlacardTheme("lawn");

export default function LawnCarePage() {
  const [, setLocation] = useLocation();
  const [showChatbot, setShowChatbot] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const handleClose = useCallback(() => setShowChatbot(false), []);
  useSheetBackButton(showChatbot, handleClose);

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24">
      <div className="max-w-[480px] mx-auto px-4 pt-4 space-y-5">

        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-1.5 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        <ServicePlacard
          theme={theme}
          tagline="🌿 Lawn Care"
          headline="SHARP LAWN."
          subheadline="ZERO HASSLE."
          bodyText="Mowing, trimming, cleanups & more."
          featuresLabel="We Handle"
          features={["Mowing", "Trimming & Edging", "Leaf Removal", "Fertilization"]}
          stats={[
            { icon: Clock, value: "1–3 hrs", label: "per visit" },
            { icon: Users, value: "1–2 crew", label: "per job" },
            { icon: Calendar, value: "Weekly", label: "plans avail." },
          ]}
          howItWorks={[
            { step: "1", label: "Fill out your free quote" },
            { step: "2", label: "Darrell contacts you" },
            { step: "3", label: "Crew shows up" },
          ]}
          cta={{
            label: "Get a Free Quote",
            onClick: () => setShowChatbot(true),
            phoneNumber: "+19062859312",
            colorClass: "bg-green-700 hover:bg-green-600",
          }}
        />

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
                      {pkg.price && <span className="text-green-300 text-xs font-bold ml-auto">{pkg.price}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

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

        <Button
          onClick={() => setShowChatbot(true)}
          className="w-full h-13 bg-green-700 hover:bg-green-600 text-white font-bold text-sm rounded-2xl py-4"
        >
          Book Lawn Care — Get My Free Quote
        </Button>
      </div>

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
              onClose={handleClose}
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
