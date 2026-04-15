import { useState } from "react";
import { useLocation } from "wouter";
import { Sparkles, CheckCircle2, Clock, Users, ChevronLeft, Phone, MessageCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookingChatbot } from "@/components/booking-chatbot";
import { Button } from "@/components/ui/button";

const INCLUDES = [
  "All bathrooms scrubbed top-to-bottom",
  "Kitchen appliances wiped (outside & in)",
  "Baseboards & window sills dusted",
  "All floors vacuumed & mopped",
  "Mirrors & glass streak-free",
  "Cabinet interiors wiped",
  "Light switches & door handles sanitized",
];

const PACKAGES = [
  {
    label: "Light Clean",
    emoji: "🧹",
    desc: "Surface-level refresh — ideal before movers arrive or after light use",
    price: "From $150",
    tags: ["2–3 hrs", "1–2 crew"],
    color: "from-purple-600/20 to-purple-900/10",
    border: "border-purple-600/30",
  },
  {
    label: "Deep Clean",
    emoji: "✨",
    desc: "Full top-to-bottom — appliances, baseboards, inside cabinets, all surfaces",
    price: "From $250",
    tags: ["4–6 hrs", "1–3 crew"],
    color: "from-violet-600/20 to-violet-900/10",
    border: "border-violet-500/50",
    tag: "Most Popular",
  },
];

const FAQS = [
  { q: "Do you supply cleaning products?", a: "Yes — we bring everything. Just make sure we have access to the property." },
  { q: "Do I need to be home?", a: "No, just leave us a key or code. We'll send a completion message when done." },
  { q: "How long does it take?", a: "Light cleans: 2–3 hrs. Deep cleans: 4–6 hrs depending on home size." },
  { q: "Can I book same-day?", a: "Often yes — call (906) 285-9312 to check availability." },
];

export default function MoveOutCleaningPage() {
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
            background: "linear-gradient(160deg, #170c2e 0%, #240d3a 35%, #130924 65%, #0a0514 100%)",
            boxShadow: "0 0 0 1.5px rgba(168,85,247,0.2), 0 8px 40px rgba(0,0,0,0.7)",
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
              <p className="text-purple-400 text-xs font-bold uppercase tracking-[0.25em]">✨ Move-In / Move-Out</p>
              <h1 className="text-4xl font-black leading-none tracking-tight text-white"
                style={{ textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>
                SPOTLESS
              </h1>
              <h1 className="text-4xl font-black leading-none tracking-tight"
                style={{ color: "#c084fc", textShadow: "0 2px 16px rgba(192,132,252,0.4)" }}>
                EVERY ROOM
              </h1>
              <p className="text-zinc-300 text-sm font-medium mt-2">
                We clean so your deposit comes back.
              </p>
            </div>

            <div
              className="rounded-2xl px-4 py-3 space-y-2"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(168,85,247,0.2)" }}
            >
              <p className="text-purple-400 text-[10px] font-black uppercase tracking-widest">Deep Clean Includes</p>
              <div className="grid grid-cols-1 gap-1">
                {INCLUDES.slice(0, 4).map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-purple-400 flex-shrink-0" />
                    <span className="text-zinc-200 text-xs">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1 rounded-xl px-3 py-2 text-center"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(168,85,247,0.15)" }}>
                <Clock className="h-4 w-4 text-purple-400 mx-auto mb-1" />
                <p className="text-white text-sm font-bold">2–6 hrs</p>
                <p className="text-zinc-500 text-[10px]">depending on size</p>
              </div>
              <div className="flex-1 rounded-xl px-3 py-2 text-center"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(168,85,247,0.15)" }}>
                <Users className="h-4 w-4 text-purple-400 mx-auto mb-1" />
                <p className="text-white text-sm font-bold">1–3 crew</p>
                <p className="text-zinc-500 text-[10px]">per job size</p>
              </div>
              <div className="flex-1 rounded-xl px-3 py-2 text-center"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(168,85,247,0.15)" }}>
                <Sparkles className="h-4 w-4 text-purple-400 mx-auto mb-1" />
                <p className="text-white text-sm font-bold">From $150</p>
                <p className="text-zinc-500 text-[10px]">light clean</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={() => setShowChatbot(true)}
            className="flex-1 h-12 bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm rounded-2xl"
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
                  <span className="absolute top-3 right-3 text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full uppercase tracking-wide">
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
                      <span className="text-purple-300 text-xs font-bold ml-auto">{pkg.price}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* All Includes */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Full Deep Clean Includes</p>
          {INCLUDES.map((item) => (
            <div key={item} className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-purple-400 flex-shrink-0" />
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
          className="w-full h-13 bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm rounded-2xl py-4"
        >
          Book a Cleaning — Get My Quote
        </Button>
      </div>

      {/* Chatbot Sheet */}
      <Sheet open={showChatbot} onOpenChange={setShowChatbot}>
        <SheetContent
          side="bottom"
          className="bg-zinc-950 border-zinc-800 rounded-t-3xl pb-10 h-[90vh] flex flex-col overflow-hidden"
        >
          <SheetHeader className="text-left mb-3 shrink-0">
            <SheetTitle className="text-white font-black text-lg">Book a Cleaning</SheetTitle>
            <p className="text-zinc-400 text-xs">Move-In / Move-Out · Real human review before anything is sent</p>
          </SheetHeader>
          <div className="flex-1 overflow-hidden min-h-0">
            <BookingChatbot
              onClose={() => setShowChatbot(false)}
              embedded={true}
              showCloseButton={false}
              className="h-full"
              initialService="Move-In/Out Cleaning"
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
