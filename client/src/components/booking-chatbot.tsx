import { useState, useRef, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Send, CheckCircle2, ArrowRight, Sparkles, RotateCcw, ChevronRight } from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type StepType = "choice" | "multiselect" | "text" | "contact" | "notes";

interface Step {
  id: string;
  question: string;
  subtext?: string;
  type: StepType;
  options?: string[];
  show?: (a: Answers) => boolean;
  placeholder?: string;
  optional?: boolean;
}

interface Answers {
  serviceType?: string;
  fromZip?: string;
  toZip?: string;
  moveDate?: string;
  homeSize?: string;
  originFloor?: string;
  originElevator?: string;
  destFloor?: string;
  destElevator?: string;
  parkingDistance?: string;
  furniture?: string[];
  boxCount?: string;
  specialItems?: string[];
  packingHelp?: string;
  truckSituation?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
}

interface Quote {
  crew: number;
  minHrs: number;
  maxHrs: number;
  minPrice: number;
  maxPrice: number;
  tokensEstimate: number;
  specialSurcharge: number;
}

interface Message {
  from: "bot" | "user";
  text: string;
  ts: number;
}

// ─────────────────────────────────────────────
// Step Definitions
// ─────────────────────────────────────────────
const STEPS: Step[] = [
  {
    id: "serviceType",
    question: "What service do you need?",
    subtext: "Pick the one that best describes your situation.",
    type: "choice",
    options: [
      "📦 Local Move (origin → destination)",
      "💪 Loading Help Only (you drive)",
      "🏠 Unloading Help Only (you arrive)",
      "🗑️ Junk Removal",
      "📫 Packing Only (no truck)",
    ],
  },
  {
    id: "fromZip",
    question: "What ZIP code are you moving FROM?",
    subtext: "Enter the 5-digit ZIP of the pickup address.",
    type: "text",
    placeholder: "e.g. 48201",
  },
  {
    id: "toZip",
    question: "What ZIP code are you moving TO?",
    subtext: "Enter the 5-digit ZIP of the drop-off address.",
    type: "text",
    placeholder: "e.g. 48103",
    show: (a) => ["📦 Local Move (origin → destination)"].includes(a.serviceType || ""),
  },
  {
    id: "moveDate",
    question: "When do you need this done?",
    type: "choice",
    options: [
      "🔥 ASAP / This week",
      "📅 Next week",
      "🗓️ 2–3 weeks out",
      "📆 Next month",
      "⏳ 2+ months out",
      "🌀 Flexible / Not sure",
    ],
  },
  {
    id: "homeSize",
    question: "What's the size of the space being moved?",
    subtext: "Pick the closest match.",
    type: "choice",
    options: [
      "Studio / Single Room",
      "1 Bedroom Apartment",
      "2 Bedroom Apartment",
      "3 Bedroom Apartment",
      "4+ Bedroom Apartment",
      "1–2 Bedroom House",
      "3 Bedroom House",
      "4+ Bedroom House",
      "Commercial / Office",
    ],
  },
  {
    id: "originFloor",
    question: "Which floor are you on at the PICKUP location?",
    type: "choice",
    options: ["Ground Floor / 1st", "2nd Floor", "3rd Floor", "4th Floor or Higher"],
    show: (a) => !["🗑️ Junk Removal"].includes(a.serviceType || ""),
  },
  {
    id: "originElevator",
    question: "Is there a working elevator at the pickup location?",
    type: "choice",
    options: ["✅ Yes, there's an elevator", "🪜 No elevator — stairs only"],
    show: (a) =>
      !["Ground Floor / 1st"].includes(a.originFloor || "") &&
      !["🗑️ Junk Removal"].includes(a.serviceType || ""),
  },
  {
    id: "destFloor",
    question: "Which floor at the DROP-OFF location?",
    type: "choice",
    options: ["Ground Floor / 1st", "2nd Floor", "3rd Floor", "4th Floor or Higher"],
    show: (a) => ["📦 Local Move (origin → destination)"].includes(a.serviceType || ""),
  },
  {
    id: "destElevator",
    question: "Is there a working elevator at the drop-off location?",
    type: "choice",
    options: ["✅ Yes, there's an elevator", "🪜 No elevator — stairs only"],
    show: (a) =>
      ["📦 Local Move (origin → destination)"].includes(a.serviceType || "") &&
      !["Ground Floor / 1st"].includes(a.destFloor || ""),
  },
  {
    id: "parkingDistance",
    question: "How far is truck parking from your door?",
    subtext: "Longer carries take more time.",
    type: "choice",
    options: [
      "🚛 Right outside the door (<30 ft)",
      "🚶 Short walk (30–100 ft)",
      "🏃 Long carry (100 ft+)",
    ],
    show: (a) => !["🗑️ Junk Removal", "📫 Packing Only (no truck)"].includes(a.serviceType || ""),
  },
  {
    id: "furniture",
    question: "Select all large furniture items you have:",
    subtext: "Tap everything that applies. Tap again to deselect.",
    type: "multiselect",
    options: [
      "King Bed", "Queen Bed", "Full / Twin Bed",
      "Sofa", "Sectional Sofa", "Loveseat",
      "Dining Table", "Dining Chairs (4+)",
      "Desk / Office Chair", "Dresser",
      "Wardrobe / Armoire", "Large Bookshelf",
      "TV (65\"+)", "TV (under 65\")",
      "Refrigerator", "Washer / Dryer",
      "Stove / Range", "None of the above",
    ],
    show: (a) => !["🗑️ Junk Removal"].includes(a.serviceType || ""),
  },
  {
    id: "boxCount",
    question: "Roughly how many packed boxes?",
    subtext: "Boxes under 20 lbs count. Don't overthink it.",
    type: "choice",
    options: [
      "Under 10 boxes", "10–25 boxes", "25–50 boxes",
      "50–75 boxes", "75–100 boxes", "100+ boxes",
    ],
    show: (a) => !["🗑️ Junk Removal"].includes(a.serviceType || ""),
  },
  {
    id: "specialItems",
    question: "Any specialty / heavy items?",
    subtext: "These require extra crew or equipment.",
    type: "multiselect",
    options: [
      "🎹 Upright Piano",
      "🎹 Grand Piano",
      "🎱 Pool Table",
      "♨️ Hot Tub",
      "🔒 Heavy Safe (300 lbs+)",
      "None of these",
    ],
  },
  {
    id: "packingHelp",
    question: "Do you need packing help?",
    subtext: "We bring all supplies.",
    type: "choice",
    options: [
      "✅ No — I'm already packed",
      "📦 Pack a few fragile items",
      "🏠 Full packing service (whole home)",
    ],
    show: (a) => !["🗑️ Junk Removal"].includes(a.serviceType || ""),
  },
  {
    id: "truckSituation",
    question: "Truck situation?",
    type: "choice",
    options: [
      "🚛 I need JC to provide a truck",
      "🚗 I have my own truck / rental",
      "📋 Not sure yet",
    ],
    show: (a) => ["📦 Local Move (origin → destination)", "💪 Loading Help Only (you drive)"].includes(a.serviceType || ""),
  },
  {
    id: "contact",
    question: "Almost done! What's the best way to reach you?",
    subtext: "Your quote will be reviewed by Darrell personally before anything is sent.",
    type: "contact",
  },
  {
    id: "notes",
    question: "Anything else we should know?",
    subtext: "Narrow hallways, parking restrictions, tight deadlines, etc. Type 'skip' or leave blank if none.",
    type: "notes",
    optional: true,
    placeholder: "e.g. 'Moving out-of-state in 10 days, tight hallways, big sectional needs to be disassembled'",
  },
];

// ─────────────────────────────────────────────
// Quote Engine
// ─────────────────────────────────────────────
function computeQuote(a: Answers): Quote {
  const sizeMap: Record<string, { crew: number; minH: number; maxH: number }> = {
    "Studio / Single Room":        { crew: 2, minH: 1.5, maxH: 2.5 },
    "1 Bedroom Apartment":         { crew: 2, minH: 2,   maxH: 3   },
    "2 Bedroom Apartment":         { crew: 2, minH: 3,   maxH: 4.5 },
    "3 Bedroom Apartment":         { crew: 3, minH: 4,   maxH: 6   },
    "4+ Bedroom Apartment":        { crew: 3, minH: 5,   maxH: 7   },
    "1–2 Bedroom House":           { crew: 2, minH: 3,   maxH: 5   },
    "3 Bedroom House":             { crew: 3, minH: 5,   maxH: 7   },
    "4+ Bedroom House":            { crew: 4, minH: 6,   maxH: 9   },
    "Commercial / Office":         { crew: 3, minH: 5,   maxH: 8   },
  };

  const cfg = sizeMap[a.homeSize || ""] || { crew: 2, minH: 2, maxH: 4 };
  let { crew } = cfg;
  let minH = cfg.minH;
  let maxH = cfg.maxH;

  // Origin floor (no elevator)
  const oFloor = { "Ground Floor / 1st": 1, "2nd Floor": 2, "3rd Floor": 3, "4th Floor or Higher": 4 }[a.originFloor || ""] || 1;
  if (oFloor >= 2 && a.originElevator === "🪜 No elevator — stairs only") {
    minH += (oFloor - 1) * 0.4;
    maxH += (oFloor - 1) * 0.6;
  }

  // Dest floor (no elevator)
  const dFloor = { "Ground Floor / 1st": 1, "2nd Floor": 2, "3rd Floor": 3, "4th Floor or Higher": 4 }[a.destFloor || ""] || 1;
  if (dFloor >= 2 && a.destElevator === "🪜 No elevator — stairs only") {
    minH += (dFloor - 1) * 0.4;
    maxH += (dFloor - 1) * 0.6;
  }

  // Parking
  if (a.parkingDistance === "🚶 Short walk (30–100 ft)") { minH += 0.25; maxH += 0.5; }
  if (a.parkingDistance === "🏃 Long carry (100 ft+)") { minH += 0.5; maxH += 1; }

  // Furniture
  const furn = (a.furniture || []).filter(f => f !== "None of the above").length;
  minH += Math.floor(furn / 5) * 0.25;
  maxH += Math.floor(furn / 3) * 0.5;

  // Boxes
  const boxAdj: Record<string, [number, number]> = {
    "Under 10 boxes": [0, 0], "10–25 boxes": [0.25, 0.5], "25–50 boxes": [0.5, 1],
    "50–75 boxes": [1, 1.5], "75–100 boxes": [1.5, 2], "100+ boxes": [2.5, 3.5],
  };
  const [bMin, bMax] = boxAdj[a.boxCount || ""] || [0, 0];
  minH += bMin; maxH += bMax;

  // Special items
  let specialSurcharge = 0;
  const specials = (a.specialItems || []).filter(s => s !== "None of these");
  if (specials.includes("🎹 Grand Piano"))   { crew = Math.max(crew, 4); minH += 2; maxH += 3;   specialSurcharge += 250; }
  if (specials.includes("🎹 Upright Piano")) { crew = Math.max(crew, 3); minH += 1; maxH += 2;   specialSurcharge += 150; }
  if (specials.includes("🎱 Pool Table"))    { crew = Math.max(crew, 3); minH += 1; maxH += 2;   specialSurcharge += 150; }
  if (specials.includes("♨️ Hot Tub"))       { crew = Math.max(crew, 3); minH += 1; maxH += 2;   specialSurcharge += 200; }
  if (specials.includes("🔒 Heavy Safe (300 lbs+)")) { minH += 0.5; maxH += 1; specialSurcharge += 75; }

  // Packing
  if (a.packingHelp === "📦 Pack a few fragile items") { minH += 0.5; maxH += 1; }
  if (a.packingHelp === "🏠 Full packing service (whole home)") { minH += 2; maxH += 4; crew = Math.max(crew, 3); }

  // Loading/unloading only ≈ half the time
  if (["💪 Loading Help Only (you drive)", "🏠 Unloading Help Only (you arrive)"].includes(a.serviceType || "")) {
    minH *= 0.55; maxH *= 0.55;
  }

  // Junk removal
  if (a.serviceType === "🗑️ Junk Removal") {
    crew = Math.min(crew, 2);
    minH = Math.max(1, minH * 0.45);
    maxH = Math.max(2, maxH * 0.55);
  }

  const RATE = 75;
  const round25 = (n: number) => Math.ceil(n / 25) * 25;
  const minPrice = round25(crew * minH * RATE) + specialSurcharge;
  const maxPrice = round25(crew * maxH * RATE) + specialSurcharge;
  const midPrice = (minPrice + maxPrice) / 2;
  const tokensEstimate = Math.round(midPrice * 50);

  return {
    crew,
    minHrs: Math.round(minH * 2) / 2,
    maxHrs: Math.round(maxH * 2) / 2,
    minPrice,
    maxPrice,
    tokensEstimate,
    specialSurcharge,
  };
}

// ─────────────────────────────────────────────
// Short answer for chat bubbles
// ─────────────────────────────────────────────
function shortAnswer(stepId: string, val: string | string[]): string {
  if (Array.isArray(val)) {
    if (val.includes("None of the above") || val.includes("None of these")) {
      const others = val.filter(v => v !== "None of the above" && v !== "None of these");
      return others.length > 0 ? others.join(", ") : "None";
    }
    return val.length <= 3 ? val.join(", ") : `${val.slice(0, 2).join(", ")} +${val.length - 2} more`;
  }
  return val;
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
export function BookingChatbot({ onClose }: { onClose?: () => void }) {
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [answers, setAnswers] = useState<Answers>({});
  const [messages, setMessages] = useState<Message[]>([
    {
      from: "bot",
      text: "👋 Hey! I'm JC — your moving assistant. I'll ask you a few quick questions to build your custom quote.\n\nDarrell reviews every quote personally before anything is sent. No spam, no pressure.",
      ts: Date.now(),
    },
  ]);
  const [stepIdx, setStepIdx] = useState(0);
  const [textInput, setTextInput] = useState("");
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [quoteVisible, setQuoteVisible] = useState(false);
  const [pendingQuote, setPendingQuote] = useState<Quote | null>(null);

  // Visible steps filtered by show()
  const visibleSteps = useMemo(
    () => STEPS.filter(s => !s.show || s.show(answers)),
    [answers]
  );

  const currentStep = visibleSteps[stepIdx];

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, quoteVisible]);

  // Push a bot message
  function botSay(text: string, delay = 0) {
    setTimeout(() => {
      setMessages(prev => [...prev, { from: "bot", text, ts: Date.now() + delay }]);
    }, delay);
  }

  // Push a user message
  function userSay(text: string) {
    setMessages(prev => [...prev, { from: "user", text, ts: Date.now() }]);
  }

  function advanceStep(stepId: string, value: string | string[]) {
    const newAnswers = { ...answers };

    // Store answer
    if (stepId === "contact") {
      newAnswers.contactName = contactName.trim();
      newAnswers.contactPhone = contactPhone.trim();
      newAnswers.contactEmail = contactEmail.trim();
    } else if (Array.isArray(value)) {
      (newAnswers as any)[stepId] = value;
    } else {
      (newAnswers as any)[stepId] = value;
    }
    setAnswers(newAnswers);

    // User bubble
    if (stepId === "contact") {
      userSay(`${contactName} · ${contactPhone} · ${contactEmail}`);
    } else {
      userSay(shortAnswer(stepId, value));
    }

    // Find next visible step with updated answers
    const nextVisibleSteps = STEPS.filter(s => !s.show || s.show(newAnswers));
    const nextIdx = stepIdx + 1;

    if (nextIdx < nextVisibleSteps.length) {
      const nextStep = nextVisibleSteps[nextIdx];
      setTimeout(() => {
        botSay(nextStep.question + (nextStep.subtext ? `\n\n_${nextStep.subtext}_` : ""));
        setStepIdx(nextIdx);
        setTextInput("");
        setMultiSel([]);
      }, 500);
    } else {
      // All done — compute quote
      setTimeout(() => {
        const q = computeQuote(newAnswers);
        setPendingQuote(q);
        botSay(
          `Perfect! Based on everything you've told me, I've put together your quote estimate. Scroll down to review it — then hit **Submit for Review** and Darrell will finalize it personally. 👇`
        );
        setTimeout(() => setQuoteVisible(true), 600);
        setStepIdx(nextVisibleSteps.length); // past end
      }, 500);
    }
  }

  // Handlers
  function handleChoice(opt: string) {
    if (!currentStep) return;
    advanceStep(currentStep.id, opt);
  }

  function handleTextSubmit() {
    if (!currentStep) return;
    const val = textInput.trim();
    if (!val && !currentStep.optional) return;
    advanceStep(currentStep.id, val || "(none)");
  }

  function handleMultiSubmit() {
    if (!currentStep) return;
    if (multiSel.length === 0) return;
    advanceStep(currentStep.id, multiSel);
    setMultiSel([]);
  }

  function toggleMulti(opt: string) {
    setMultiSel(prev => {
      const isExclusive = opt === "None of the above" || opt === "None of these";
      if (isExclusive) return [opt];
      const withoutExcl = prev.filter(x => x !== "None of the above" && x !== "None of these");
      return withoutExcl.includes(opt)
        ? withoutExcl.filter(x => x !== opt)
        : [...withoutExcl, opt];
    });
  }

  function handleContactSubmit() {
    if (!contactName.trim() || !contactPhone.trim() || !contactEmail.trim()) return;
    advanceStep("contact", "");
  }

  // Submission
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!pendingQuote) throw new Error("No quote");
      return apiRequest("POST", "/api/chatbot-quote", {
        answers,
        quote: pendingQuote,
      });
    },
    onSuccess: async () => {
      setSubmitted(true);
      botSay("✅ Your quote request has been submitted! Darrell will review it and send you a finalized quote. We typically respond within 2–4 hours during business hours.");
    },
    onError: (err: any) => {
      toast({ title: "Submission failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  function resetChat() {
    setAnswers({});
    setMessages([{
      from: "bot",
      text: "👋 Hey! I'm JC — your moving assistant. I'll ask you a few quick questions to build your custom quote.\n\nDarrell reviews every quote personally before anything is sent. No spam, no pressure.",
      ts: Date.now(),
    }]);
    setStepIdx(0);
    setTextInput("");
    setMultiSel([]);
    setContactName("");
    setContactPhone("");
    setContactEmail("");
    setSubmitted(false);
    setQuoteVisible(false);
    setPendingQuote(null);
  }

  const isDone = stepIdx >= visibleSteps.length;
  const progress = isDone ? 100 : Math.round((stepIdx / visibleSteps.length) * 100);

  return (
    <div className="flex flex-col h-full min-h-[500px]">
      {/* Progress bar */}
      <div className="px-1 pb-2 shrink-0">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span>{isDone ? "✅ All done!" : `Step ${stepIdx + 1} of ${visibleSteps.length}`}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.from === "bot" ? "justify-start" : "justify-end"}`}>
            {m.from === "bot" && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0 mr-2 mt-0.5">JC</div>
            )}
            <div
              className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                m.from === "bot"
                  ? "bg-slate-800 text-slate-100 rounded-tl-sm"
                  : "bg-teal-600 text-white rounded-tr-sm"
              }`}
              dangerouslySetInnerHTML={{
                __html: m.text
                  .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                  .replace(/_(.*?)_/g, "<em class='text-teal-300 not-italic'>$1</em>"),
              }}
            />
          </div>
        ))}

        {/* Quote Card */}
        {quoteVisible && pendingQuote && (
          <div className="mx-1 mt-2 rounded-2xl border border-teal-500/30 bg-gradient-to-br from-teal-900/30 to-slate-900/60 overflow-hidden">
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-teal-400" />
                <span className="text-sm font-bold text-teal-300 uppercase tracking-wide">Your Estimated Quote</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-400 mb-1">Crew Size</p>
                  <p className="text-xl font-bold text-white">{pendingQuote.crew}</p>
                  <p className="text-[10px] text-slate-400">movers</p>
                </div>
                <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-400 mb-1">Est. Hours</p>
                  <p className="text-xl font-bold text-white">{pendingQuote.minHrs}–{pendingQuote.maxHrs}</p>
                  <p className="text-[10px] text-slate-400">hours</p>
                </div>
                <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-400 mb-1">JCMOVES Earned</p>
                  <p className="text-lg font-bold text-yellow-400">{(pendingQuote.tokensEstimate / 1000).toFixed(0)}K</p>
                  <p className="text-[10px] text-slate-400">tokens</p>
                </div>
              </div>
              <div className="bg-slate-900/60 rounded-xl p-3 text-center mb-3">
                <p className="text-xs text-slate-400 mb-1">Estimated Price Range</p>
                <p className="text-2xl font-bold text-white">
                  ${pendingQuote.minPrice.toLocaleString()} – ${pendingQuote.maxPrice.toLocaleString()}
                </p>
                {pendingQuote.specialSurcharge > 0 && (
                  <p className="text-xs text-orange-400 mt-1">Includes ${pendingQuote.specialSurcharge} specialty item surcharge</p>
                )}
                <p className="text-[11px] text-slate-500 mt-1">Final price confirmed by Darrell after review</p>
              </div>
              <div className="flex items-start gap-2 bg-blue-900/20 border border-blue-500/20 rounded-lg px-3 py-2">
                <span className="text-base shrink-0">🔍</span>
                <p className="text-xs text-slate-300">
                  This is an <strong className="text-white">estimate only</strong>. Darrell personally reviews every submission and may adjust based on specific circumstances before sending your official quote.
                </p>
              </div>
            </div>
            {!submitted ? (
              <div className="px-4 pb-4">
                <Button
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending}
                  className="w-full bg-gradient-to-r from-teal-600 to-blue-600 hover:from-teal-500 hover:to-blue-500 text-white font-bold py-3 rounded-xl text-sm"
                >
                  {submitMutation.isPending ? (
                    "Submitting…"
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Submit for Review
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="px-4 pb-4 flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <p className="font-bold text-white text-sm">Quote Submitted!</p>
                  <p className="text-xs text-slate-400">Darrell will review and reach out soon.</p>
                </div>
                {onClose && (
                  <Button variant="outline" size="sm" onClick={onClose} className="border-slate-600 text-slate-300 hover:bg-slate-800">
                    Close <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                )}
                <button onClick={resetChat} className="text-xs text-slate-500 hover:text-slate-400 flex items-center gap-1">
                  <RotateCcw className="h-3 w-3" /> Start a new quote
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area — only show if not done */}
      {!isDone && currentStep && (
        <div className="shrink-0 pt-2 border-t border-slate-800/60">
          {/* CHOICE */}
          {currentStep.type === "choice" && (
            <div className="grid grid-cols-1 gap-1.5">
              {currentStep.options!.map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleChoice(opt)}
                  className="text-left px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-teal-800/60 border border-slate-700/60 hover:border-teal-500/60 text-sm text-slate-200 transition-all flex items-center justify-between group"
                >
                  <span>{opt}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-teal-400 transition-colors" />
                </button>
              ))}
            </div>
          )}

          {/* MULTISELECT */}
          {currentStep.type === "multiselect" && (
            <div>
              <div className="flex flex-wrap gap-1.5 mb-2 max-h-36 overflow-y-auto">
                {currentStep.options!.map((opt) => {
                  const sel = multiSel.includes(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() => toggleMulti(opt)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        sel
                          ? "bg-teal-600 border-teal-500 text-white"
                          : "bg-slate-800 border-slate-700 text-slate-300 hover:border-teal-500/60"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              <Button
                onClick={handleMultiSubmit}
                disabled={multiSel.length === 0}
                size="sm"
                className="w-full bg-teal-600 hover:bg-teal-500 text-white"
              >
                Continue ({multiSel.length} selected) <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}

          {/* TEXT */}
          {currentStep.type === "text" && (
            <div className="flex gap-2">
              <Input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
                placeholder={currentStep.placeholder || "Type your answer…"}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                autoFocus
              />
              <Button onClick={handleTextSubmit} size="icon" className="bg-teal-600 hover:bg-teal-500 shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* NOTES */}
          {currentStep.type === "notes" && (
            <div className="space-y-2">
              <Textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={currentStep.placeholder || "Type here or leave blank to skip…"}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm resize-none"
                rows={2}
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => advanceStep(currentStep.id, "(no additional notes)")}
                  className="border-slate-600 text-slate-400 hover:bg-slate-800">
                  Skip
                </Button>
                <Button onClick={handleTextSubmit} size="sm" className="flex-1 bg-teal-600 hover:bg-teal-500 text-white">
                  Submit Notes <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* CONTACT */}
          {currentStep.type === "contact" && (
            <div className="space-y-2">
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Full name"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
              />
              <Input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="Phone number"
                type="tel"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
              />
              <Input
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="Email address"
                type="email"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleContactSubmit()}
              />
              <Button
                onClick={handleContactSubmit}
                disabled={!contactName.trim() || !contactPhone.trim() || !contactEmail.trim()}
                className="w-full bg-teal-600 hover:bg-teal-500 text-white"
                size="sm"
              >
                Continue <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
