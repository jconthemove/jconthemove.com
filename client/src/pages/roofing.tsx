import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Home, CheckCircle2, Clock, Users, ChevronLeft, Phone, MessageCircle, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookingChatbot } from "@/components/booking-chatbot";
import { Button } from "@/components/ui/button";
import ServicePlacard, { getPlacardTheme } from "@/components/ServicePlacard";
import { useSheetBackButton } from "@/hooks/useSheetBackButton";

const SERVICES = [
  { emoji: "🔧", label: "Leak Repair", desc: "Stop a leak fast before it causes interior damage" },
  { emoji: "🏠", label: "Full Replacement", desc: "New shingles or metal — from tearoff to final inspection" },
  { emoji: "🔍", label: "Inspection", desc: "Pre-sale or annual check — we find issues before they cost you" },
  { emoji: "🌨️", label: "Storm Damage", desc: "Insurance-ready assessment and repair documentation" },
  { emoji: "🪵", label: "Soffit & Fascia", desc: "Rotted wood, gutter backing, and ventilation repairs" },
];

const ALL_INCLUDES = [
  "Free on-site inspection & estimate",
  "Licensed, insured crew",
  "Old shingle tearoff & disposal",
  "Ice & water shield installation",
  "Manufacturer warranty on materials",
  "Cleanup — no nails or debris left behind",
];

const FAQS = [
  { q: "Do you offer free estimates?", a: "Yes — we come out, inspect the roof, and give you a written estimate at no charge." },
  { q: "How long does a full replacement take?", a: "Most residential roofs are done in 1–2 days. Complex or large jobs may take 3 days." },
  { q: "What roofing materials do you use?", a: "We work with architectural shingles (30-year), metal, and flat/TPO. We'll recommend the best fit." },
  { q: "Do you work with insurance companies?", a: "Yes — we provide full documentation for storm damage claims and can work with most adjusters." },
];

const theme = getPlacardTheme("roofing");

export default function RoofingPage() {
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
          tagline="🏠 Licensed & Insured"
          headline="ROOFING"
          subheadline="DONE RIGHT"
          bodyText="From minor repairs to full replacements."
          featuresLabel="Every Job Includes"
          features={ALL_INCLUDES.slice(0, 3)}
          stats={[
            { icon: Clock, value: "1–3 days", label: "typical job" },
            { icon: Users, value: "2–4 crew", label: "per job" },
            { icon: Home, value: "Free", label: "estimate" },
          ]}
        />

        <div className="flex items-start gap-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-amber-300 text-xs">
            <span className="font-bold">Out-of-area note:</span> Jobs outside Ironwood/Gogebic County require a $100 estimate deposit (credited toward your project if booked within 6 months).
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={() => setShowChatbot(true)}
            className="flex-1 h-12 bg-stone-600 hover:bg-stone-500 text-white font-bold text-sm rounded-2xl"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Get a Free Estimate
          </Button>
          <Button
            onClick={() => window.open("tel:+19062859312", "_self")}
            variant="outline"
            className="h-12 px-4 border-zinc-700 text-zinc-300 hover:text-white rounded-2xl"
          >
            <Phone className="h-4 w-4" />
          </Button>
        </div>

        <div>
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">What We Handle</h2>
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

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Every Job Includes</p>
          {ALL_INCLUDES.map((item) => (
            <div key={item} className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-stone-400 flex-shrink-0" />
              <span className="text-zinc-300 text-sm">{item}</span>
            </div>
          ))}
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
          className="w-full h-13 bg-stone-600 hover:bg-stone-500 text-white font-bold text-sm rounded-2xl py-4"
        >
          Request a Free Roof Inspection
        </Button>
      </div>

      <Sheet open={showChatbot} onOpenChange={setShowChatbot}>
        <SheetContent
          side="bottom"
          className="bg-zinc-950 border-zinc-800 rounded-t-3xl pb-10 h-[90vh] flex flex-col overflow-hidden"
        >
          <SheetHeader className="text-left mb-3 shrink-0">
            <SheetTitle className="text-white font-black text-lg">Roofing Estimate</SheetTitle>
            <p className="text-zinc-400 text-xs">Free on-site inspection · Reviewed by Darrell</p>
          </SheetHeader>
          <div className="flex-1 overflow-hidden min-h-0">
            <BookingChatbot
              onClose={handleClose}
              embedded={true}
              showCloseButton={false}
              className="h-full"
              initialService="Roofing"
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
