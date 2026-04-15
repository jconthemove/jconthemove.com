import { useState } from "react";
import { useLocation } from "wouter";
import { HardHat, CheckCircle2, Clock, Users, ChevronLeft, Phone, MessageCircle, AlertTriangle, Truck } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookingChatbot } from "@/components/booking-chatbot";
import { Button } from "@/components/ui/button";

const SERVICES = [
  { emoji: "🪵", label: "Flooring Tearout", desc: "Tile, carpet, hardwood — we rip it up and haul it out" },
  { emoji: "🧱", label: "Wall & Drywall Removal", desc: "Non-structural walls and partitions taken down clean" },
  { emoji: "🏚️", label: "Full Room Tearout", desc: "Everything stripped to studs — ready for your contractor" },
  { emoji: "🏠", label: "Insulation Removal", desc: "Old batt or blown-in insulation safely removed" },
  { emoji: "🔲", label: "Ceiling Removal", desc: "Drop ceilings, drywall ceilings — taken down and hauled" },
  { emoji: "🚛", label: "Debris Haul-Away", desc: "We load and haul all demolition waste — no dumpster needed" },
];

const INCLUDES = [
  "On-site quote before any work starts",
  "Licensed, insured crew",
  "Protective sheeting to contain dust",
  "Full debris removal & disposal",
  "Work area left broom-clean",
  "Hazard pre-screening included",
];

const FAQS = [
  { q: "Do you handle asbestos or mold?", a: "We screen for hazards before every job. If asbestos or mold is suspected, we'll refer you to a certified remediation company first." },
  { q: "Do I need a dumpster?", a: "No — we haul all demo waste ourselves. Just tell us when you book and we'll price in the haul-away." },
  { q: "How much does it cost?", a: "Costs depend heavily on scope — crew size, duration, and materials. Fill out the quote form and Darrell will send you a firm number." },
  { q: "How soon can you start?", a: "Often within the same week. Call (906) 285-9312 for rush availability." },
];

export default function DemolitionPage() {
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
            background: "linear-gradient(160deg, #1c0a0a 0%, #2e1010 35%, #1a0808 65%, #0d0404 100%)",
            boxShadow: "0 0 0 1.5px rgba(239,68,68,0.18), 0 8px 40px rgba(0,0,0,0.7)",
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
              <p className="text-red-400 text-xs font-bold uppercase tracking-[0.25em]">⚒️ Light Demolition</p>
              <h1 className="text-4xl font-black leading-none tracking-tight text-white"
                style={{ textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>
                TEAR IT
              </h1>
              <h1 className="text-4xl font-black leading-none tracking-tight"
                style={{ color: "#f87171", textShadow: "0 2px 16px rgba(248,113,113,0.4)" }}>
                ALL DOWN ✅
              </h1>
              <p className="text-zinc-300 text-sm font-medium mt-2">
                We demo, haul, and leave it ready for your contractor.
              </p>
            </div>

            <div
              className="rounded-2xl px-4 py-3"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              <p className="text-red-400 text-[10px] font-black uppercase tracking-widest mb-2">Every Job Includes</p>
              <div className="grid grid-cols-1 gap-1">
                {INCLUDES.slice(0, 3).map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                    <span className="text-zinc-200 text-xs">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1 rounded-xl px-3 py-2 text-center"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}>
                <Clock className="h-4 w-4 text-red-400 mx-auto mb-1" />
                <p className="text-white text-sm font-bold">2–8 hrs</p>
                <p className="text-zinc-500 text-[10px]">per job</p>
              </div>
              <div className="flex-1 rounded-xl px-3 py-2 text-center"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}>
                <Users className="h-4 w-4 text-red-400 mx-auto mb-1" />
                <p className="text-white text-sm font-bold">2–4 crew</p>
                <p className="text-zinc-500 text-[10px]">as needed</p>
              </div>
              <div className="flex-1 rounded-xl px-3 py-2 text-center"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}>
                <Truck className="h-4 w-4 text-red-400 mx-auto mb-1" />
                <p className="text-white text-sm font-bold">We Haul</p>
                <p className="text-zinc-500 text-[10px]">all debris</p>
              </div>
            </div>
          </div>
        </div>

        {/* Warning badge */}
        <div className="flex items-start gap-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-amber-300 text-xs">
            <span className="font-bold">Hazard screening required:</span> We check for mold, asbestos, and pests before starting. Jobs with confirmed hazards require certified remediation before demo work.
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={() => setShowChatbot(true)}
            className="flex-1 h-12 bg-red-700 hover:bg-red-600 text-white font-bold text-sm rounded-2xl"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Get a Quote
          </Button>
          <Button
            onClick={() => window.open("tel:+19062859312", "_self")}
            variant="outline"
            className="h-12 px-4 border-zinc-700 text-zinc-300 hover:text-white rounded-2xl"
          >
            <Phone className="h-4 w-4" />
          </Button>
        </div>

        {/* Services Grid */}
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

        {/* Full Includes */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Every Job Includes</p>
          {INCLUDES.map((item) => (
            <div key={item} className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
              <span className="text-zinc-300 text-sm">{item}</span>
            </div>
          ))}
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
          className="w-full h-13 bg-red-700 hover:bg-red-600 text-white font-bold text-sm rounded-2xl py-4"
        >
          Get a Demo Quote — Free Estimate
        </Button>
      </div>

      {/* Chatbot Sheet */}
      <Sheet open={showChatbot} onOpenChange={setShowChatbot}>
        <SheetContent
          side="bottom"
          className="bg-zinc-950 border-zinc-800 rounded-t-3xl pb-10 h-[90vh] flex flex-col overflow-hidden"
        >
          <SheetHeader className="text-left mb-3 shrink-0">
            <SheetTitle className="text-white font-black text-lg">Demo & Hauling Quote</SheetTitle>
            <p className="text-zinc-400 text-xs">Light demolition & debris removal · Reviewed by Darrell</p>
          </SheetHeader>
          <div className="flex-1 overflow-hidden min-h-0">
            <BookingChatbot
              onClose={() => setShowChatbot(false)}
              embedded={true}
              showCloseButton={false}
              className="h-full"
              initialService="Light Demolition"
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
