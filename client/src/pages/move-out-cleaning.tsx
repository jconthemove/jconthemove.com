import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Sparkles, CheckCircle2, Clock, Users, ChevronLeft, MessageCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookingChatbot } from "@/components/booking-chatbot";
import { Button } from "@/components/ui/button";
import ServicePlacard, { getPlacardTheme } from "@/components/ServicePlacard";
import { useSheetBackButton } from "@/hooks/useSheetBackButton";

const PACKAGES = [
  {
    label: "Standard Clean",
    emoji: "🧹",
    desc: "Surface-level refresh — ideal before movers arrive or for recently vacated spaces",
    price: "From $120",
    tags: ["2–3 hrs", "1–2 crew"],
    color: "from-purple-600/20 to-purple-900/10",
    border: "border-purple-600/30",
  },
  {
    label: "Deep Clean",
    emoji: "✨",
    desc: "Full top-to-bottom — inside appliances, baseboards, inside cabinets, all surfaces",
    price: "From $220",
    tags: ["4–6 hrs", "1–3 crew"],
    color: "from-violet-600/20 to-violet-900/10",
    border: "border-violet-500/50",
    tag: "Most Popular",
  },
  {
    label: "Premium Clean",
    emoji: "💎",
    desc: "Everything in Deep Clean plus carpet treatment, window cleaning, and garage/basement",
    price: "From $350",
    tags: ["6–8 hrs", "2–3 crew"],
    color: "from-fuchsia-600/20 to-fuchsia-900/10",
    border: "border-fuchsia-600/30",
    tag: "Best Value",
  },
];

const ALL_INCLUDES = [
  "All bathrooms scrubbed top-to-bottom",
  "Kitchen appliances wiped (outside & in)",
  "Inside cabinet interiors wiped",
  "Baseboards & window sills dusted",
  "All floors vacuumed & mopped",
  "Mirrors & glass streak-free",
  "Light switches & door handles sanitized",
];

const FAQS = [
  { q: "Do you supply cleaning products?", a: "Yes — we bring everything. Just make sure we have access to the property." },
  { q: "Do I need to be home?", a: "No, just leave us a key or code. We'll send a completion message when done." },
  { q: "How long does it take?", a: "Standard: 2–3 hrs. Deep: 4–6 hrs. Premium: 6–8 hrs depending on home size." },
  { q: "Can I book same-day?", a: "Often yes — call (906) 285-9312 to check availability." },
];

const theme = getPlacardTheme("cleaning");

export default function MoveOutCleaningPage() {
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
          tagline="✨ Move-In / Move-Out"
          headline="SPOTLESS"
          subheadline="EVERY ROOM"
          bodyText="We clean so your deposit comes back."
          featuresLabel="Deep Clean Includes"
          features={ALL_INCLUDES.slice(0, 4)}
          stats={[
            { icon: Clock, value: "2–8 hrs", label: "depending on size" },
            { icon: Users, value: "1–3 crew", label: "per job size" },
            { icon: Sparkles, value: "From $120", label: "standard clean" },
          ]}
          howItWorks={[
            { step: "1", label: "Pick your package" },
            { step: "2", label: "We confirm & schedule" },
            { step: "3", label: "Crew cleans & you inspect" },
          ]}
          cta={{
            label: "Get a Quote",
            onClick: () => setShowChatbot(true),
            phoneNumber: "+19062859312",
            colorClass: "bg-purple-600 hover:bg-purple-500",
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

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Deep Clean Includes</p>
          {ALL_INCLUDES.map((item) => (
            <div key={item} className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-purple-400 flex-shrink-0" />
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
          className="w-full h-13 bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm rounded-2xl py-4"
        >
          Book a Cleaning — Get My Quote
        </Button>
      </div>

      <Sheet open={showChatbot} onOpenChange={setShowChatbot}>
        <SheetContent
          side="bottom"
          className="bg-zinc-950 border-zinc-800 rounded-t-3xl pb-10 h-[90vh] flex flex-col overflow-hidden"
        >
          <SheetHeader className="text-left mb-3 shrink-0">
            <SheetTitle className="text-white font-black text-lg">Book a Cleaning</SheetTitle>
            <p className="text-zinc-400 text-xs">Move-In / Move-Out · Standard, Deep & Premium packages</p>
          </SheetHeader>
          <div className="flex-1 overflow-hidden min-h-0">
            <BookingChatbot
              onClose={handleClose}
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
