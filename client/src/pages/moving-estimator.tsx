import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Truck, Package2, Users, Clock, DollarSign,
  RotateCcw, ChevronRight, Star, Stairs, AlertCircle
} from "lucide-react";

const RATE = 50;

type Service = "moving" | "junk";
type TruckSize = "small" | "large";
type LoadType = "loadOnly" | "loadUnload";
type JunkSize = "small" | "large";

interface Sel {
  service?: Service;
  truckSize?: TruckSize;
  loadType?: LoadType;
  stairs?: boolean;
  junkSize?: JunkSize;
}

interface Option {
  movers: number;
  hours: number;
  tag?: string;
}

function getOptions(sel: Sel): Option[] {
  const bonus = sel.stairs ? 1 : 0;
  if (sel.service === "moving") {
    if (sel.truckSize === "small" && sel.loadType === "loadOnly") {
      return [{ movers: 2 + bonus, hours: 2, tag: "Standard" }];
    }
    if (sel.truckSize === "large" && sel.loadType === "loadOnly") {
      return [
        { movers: 2 + bonus, hours: 4 },
        { movers: 3 + bonus, hours: 3, tag: "Most Popular" },
        { movers: 4 + bonus, hours: 2, tag: "Fastest" },
      ];
    }
    if (sel.loadType === "loadUnload") {
      return [
        { movers: 2 + bonus, hours: 6 },
        { movers: 3 + bonus, hours: 4, tag: "Most Popular" },
        { movers: 4 + bonus, hours: 3, tag: "Fastest" },
      ];
    }
  }
  return [];
}

type MsgRole = "bot" | "user";
interface Msg {
  role: MsgRole;
  text: string;
  choices?: { label: string; value: string; icon?: string }[];
  isResult?: boolean;
  resultSel?: Sel;
}

function buildMessages(sel: Sel): Msg[] {
  const msgs: Msg[] = [];

  msgs.push({
    role: "bot",
    text: "Hi! I'm your moving estimate assistant. Let's figure out what crew and time you need. What service are you looking for?",
    choices: [
      { label: "Moving Help", value: "moving", icon: "🚛" },
      { label: "Junk Removal", value: "junk", icon: "♻️" },
    ],
  });

  if (!sel.service) return msgs;
  msgs.push({ role: "user", text: sel.service === "moving" ? "🚛 Moving Help" : "♻️ Junk Removal" });

  if (sel.service === "junk") {
    msgs.push({
      role: "bot",
      text: "Great! How much junk are we talking about?",
      choices: [
        { label: "Small Load (pickup truck)", value: "small", icon: "📦" },
        { label: "Full Truckload", value: "large", icon: "🚛" },
      ],
    });
    if (!sel.junkSize) return msgs;
    msgs.push({ role: "user", text: sel.junkSize === "small" ? "📦 Small Load" : "🚛 Full Truckload" });
    msgs.push({ role: "bot", text: "", isResult: true, resultSel: sel });
    return msgs;
  }

  msgs.push({
    role: "bot",
    text: "What size truck will you need?",
    choices: [
      { label: "Small Truck", value: "small", icon: "🚐" },
      { label: "Large Truck", value: "large", icon: "🚛" },
    ],
  });
  if (!sel.truckSize) return msgs;
  msgs.push({ role: "user", text: sel.truckSize === "small" ? "🚐 Small Truck" : "🚛 Large Truck" });

  msgs.push({
    role: "bot",
    text: "Are we loading only, or loading AND unloading at the destination?",
    choices: [
      { label: "Load Only", value: "loadOnly", icon: "⬆️" },
      { label: "Load & Unload", value: "loadUnload", icon: "↕️" },
    ],
  });
  if (!sel.loadType) return msgs;
  msgs.push({ role: "user", text: sel.loadType === "loadOnly" ? "⬆️ Load Only" : "↕️ Load & Unload" });

  msgs.push({
    role: "bot",
    text: "Are there stairs involved at pickup or drop-off? (Stairs require an extra mover for safety.)",
    choices: [
      { label: "Yes, there are stairs", value: "yes", icon: "🪜" },
      { label: "No stairs", value: "no", icon: "✅" },
    ],
  });
  if (sel.stairs === undefined) return msgs;
  msgs.push({ role: "user", text: sel.stairs ? "🪜 Yes, there are stairs" : "✅ No stairs" });

  msgs.push({ role: "bot", text: "", isResult: true, resultSel: sel });
  return msgs;
}

function ResultCard({ sel }: { sel: Sel }) {
  if (sel.service === "junk") {
    const isSmall = sel.junkSize === "small";
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-300 font-medium">Here's your junk removal estimate:</p>
        <div className="rounded-xl overflow-hidden border border-emerald-500/40">
          <div className="bg-emerald-900/40 px-4 py-3 flex items-center gap-2">
            <Package2 className="h-4 w-4 text-emerald-400" />
            <span className="font-semibold text-emerald-200">{isSmall ? "Small Load" : "Full Truckload"}</span>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3 text-sm">
            <div className="text-slate-400">Crew</div>
            <div className="text-white font-semibold">{isSmall ? "2 movers" : "2–3 movers"}</div>
            <div className="text-slate-400">Estimated Time</div>
            <div className="text-white font-semibold">{isSmall ? "1–2 hours" : "2–4 hours"}</div>
            <div className="text-slate-400">Estimate</div>
            <div className="text-emerald-400 font-bold text-base">{isSmall ? "$100–$200" : "$200–$600"}</div>
          </div>
        </div>
        <p className="text-xs text-slate-400 flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-yellow-400" />
          Pricing varies by volume and location. Get a free quote for an exact number.
        </p>
      </div>
    );
  }

  const options = getOptions(sel);
  if (!options.length) return null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-300 font-medium">
        Here are your crew options{sel.stairs ? " (stairs bonus included)" : ""}:
      </p>
      <div className="rounded-xl overflow-hidden border border-slate-700/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/80 text-slate-400 text-xs uppercase tracking-wide">
              <th className="px-3 py-2 text-left">Movers</th>
              <th className="px-3 py-2 text-left">Hours</th>
              <th className="px-3 py-2 text-left">Estimate</th>
              <th className="px-3 py-2 text-left"></th>
            </tr>
          </thead>
          <tbody>
            {options.map((opt, i) => (
              <tr key={i} className={`border-t border-slate-700/40 ${opt.tag === "Most Popular" ? "bg-teal-900/20" : ""}`}>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-teal-400" />
                    <span className="font-semibold text-white">{opt.movers}</span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-blue-400" />
                    <span className="text-slate-200">{opt.hours} hrs</span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="font-bold text-emerald-400 text-base">
                      {(opt.movers * opt.hours * RATE).toLocaleString()}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  {opt.tag && (
                    <Badge className={`text-xs ${opt.tag === "Most Popular" ? "bg-teal-600/40 text-teal-300 border-teal-500/40" : "bg-slate-700/60 text-slate-400 border-slate-600/40"}`}>
                      {opt.tag === "Most Popular" && <Star className="h-2.5 w-2.5 mr-1" />}
                      {opt.tag}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 flex items-start gap-1.5">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-yellow-400" />
        Estimates based on ${RATE}/mover/hr. Travel time &amp; distance may affect final price.
      </p>
    </div>
  );
}

export default function MovingEstimator() {
  const [sel, setSel] = useState<Sel>({});
  const messages = buildMessages(sel);

  function handle(step: keyof Sel | "junkSize", value: string) {
    if (step === "service") setSel({ service: value as Service });
    else if (step === "truckSize") setSel(s => ({ ...s, truckSize: value as TruckSize }));
    else if (step === "loadType") setSel(s => ({ ...s, loadType: value as LoadType }));
    else if (step === "stairs") setSel(s => ({ ...s, stairs: value === "yes" }));
    else if (step === "junkSize") setSel(s => ({ ...s, junkSize: value as JunkSize }));
  }

  function getStepForChoice(msgIndex: number): keyof Sel | "junkSize" {
    const botMsgs = messages.filter(m => m.role === "bot" && m.choices);
    const idx = messages.slice(0, msgIndex + 1).filter(m => m.role === "bot" && m.choices).length - 1;
    const stepOrder: (keyof Sel | "junkSize")[] = ["service", "junkSize", "truckSize", "loadType", "stairs"];
    if (sel.service === "moving") {
      const moveSteps: (keyof Sel | "junkSize")[] = ["service", "truckSize", "loadType", "stairs"];
      return moveSteps[idx] ?? "service";
    }
    return stepOrder[idx] ?? "service";
  }

  const isComplete = messages.some(m => m.isResult);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-lg mx-auto px-4 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3 pt-6 pb-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white p-2">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-teal-500 to-blue-600">
              <Truck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white text-lg leading-tight">Moving Estimator</h1>
              <p className="text-slate-400 text-xs">Get an instant cost estimate</p>
            </div>
          </div>
          {Object.keys(sel).length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSel({})} className="ml-auto text-slate-400 hover:text-white gap-1">
              <RotateCcw className="h-4 w-4" /> Start Over
            </Button>
          )}
        </div>

        {/* Chat bubbles */}
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "bot" && (
                <div className="flex items-end gap-2 max-w-[85%]">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center shrink-0 mb-1">
                    <Truck className="h-4 w-4 text-white" />
                  </div>
                  <div className="space-y-3">
                    {msg.isResult && msg.resultSel ? (
                      <Card className="bg-slate-800/80 border-slate-700/60 p-4">
                        <ResultCard sel={msg.resultSel} />
                        <div className="mt-5 space-y-2">
                          <Link href="/request-quote">
                            <Button className="w-full bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 font-semibold">
                              Get a Free Official Quote <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                          </Link>
                          <Button variant="outline" onClick={() => setSel({})} className="w-full border-slate-600 text-slate-300 hover:bg-slate-700 gap-2">
                            <RotateCcw className="h-4 w-4" /> Start Over
                          </Button>
                        </div>
                      </Card>
                    ) : (
                      <div className="bg-slate-700/60 rounded-2xl rounded-tl-sm px-4 py-3 text-slate-100 text-sm leading-relaxed">
                        {msg.text}
                        {msg.choices && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {msg.choices.map((c) => {
                              const step = getStepForChoice(i);
                              const isAnswered = i < messages.length - 1;
                              return (
                                <button
                                  key={c.value}
                                  disabled={isAnswered}
                                  onClick={() => handle(step, c.value)}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-all
                                    ${isAnswered
                                      ? "border-slate-600/40 text-slate-500 bg-slate-800/30 cursor-default"
                                      : "border-teal-500/60 text-teal-300 bg-teal-900/30 hover:bg-teal-900/60 hover:border-teal-400 active:scale-95"
                                    }`}
                                >
                                  {c.icon && <span>{c.icon}</span>}
                                  {c.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {msg.role === "user" && (
                <div className="bg-gradient-to-r from-teal-600 to-blue-600 rounded-2xl rounded-tr-sm px-4 py-2.5 text-white text-sm font-medium max-w-[75%]">
                  {msg.text}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Tip card while in progress */}
        {!isComplete && Object.keys(sel).length === 0 && (
          <Card className="mt-6 p-4 border-slate-700/50 bg-slate-800/40">
            <p className="text-xs text-slate-400 text-center">
              💡 Tip: Stairs add 1 extra mover for safety and efficiency
            </p>
          </Card>
        )}

        {/* Rate note */}
        <p className="text-center text-xs text-slate-500 mt-6">
          Rates from <span className="text-slate-400 font-medium">${RATE}/mover/hr</span> · Travel time billed separately · Licensed & insured
        </p>
      </div>
    </div>
  );
}
