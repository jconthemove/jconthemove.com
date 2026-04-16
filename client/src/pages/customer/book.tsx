import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { BookingChatbot } from "@/components/booking-chatbot";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { Phone, ArrowLeft, Truck, Trash2, Snowflake, Wrench, Paintbrush, Hammer, Zap } from "lucide-react";

const QUICK_SERVICES = [
  { label: "Moving",          emoji: "📦", slug: "moving",       icon: Truck,      color: "from-blue-900/60 to-blue-800/40 border-blue-500/30 hover:border-blue-400/60" },
  { label: "Junk Removal",    emoji: "🗑️",  slug: "junk",        icon: Trash2,     color: "from-emerald-900/60 to-emerald-800/40 border-emerald-500/30 hover:border-emerald-400/60" },
  { label: "Snow Removal",    emoji: "❄️",  slug: "snow",        icon: Snowflake,  color: "from-sky-900/60 to-sky-800/40 border-sky-500/30 hover:border-sky-400/60" },
  { label: "Handyman",        emoji: "🔧", slug: "handyman",    icon: Wrench,     color: "from-orange-900/60 to-orange-800/40 border-orange-500/30 hover:border-orange-400/60" },
  { label: "Painting",        emoji: "🎨", slug: "painting",    icon: Paintbrush, color: "from-purple-900/60 to-purple-800/40 border-purple-500/30 hover:border-purple-400/60" },
  { label: "Light Demo",      emoji: "🔨", slug: "demolition",  icon: Hammer,     color: "from-red-900/60 to-red-800/40 border-red-500/30 hover:border-red-400/60" },
  { label: "Jump Start",      emoji: "⚡", slug: "jumpstart",   icon: Zap,        color: "from-amber-900/60 to-amber-800/40 border-amber-500/30 hover:border-amber-400/60" },
];

export default function CustomerBookPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [initialService, setInitialService] = useState<string | undefined>(undefined);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const svc = params.get("service");
    if (!svc) return;
    if (svc === "window_cleaning" || svc === "window") { setLocation("/window-cleaning"); return; }
    if (svc === "trash_valet" || svc === "trash-valet") { setLocation("/trash-valet/book"); return; }
    if (svc === "lawn") { setLocation("/book/lawn-care"); return; }
    setInitialService(svc);
    setStarted(true);
  }, []);

  function pickService(slug: string) {
    setInitialService(slug);
    setStarted(true);
  }

  function startGeneral() {
    setInitialService(undefined);
    setStarted(true);
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <div className="px-4 pt-5 pb-3 border-b border-border flex-shrink-0">
        <div className="max-w-2xl mx-auto flex items-start justify-between">
          <div className="flex items-center gap-2">
            {started && (
              <button
                onClick={() => { setStarted(false); setInitialService(undefined); }}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <h1 className="text-xl font-bold">{started ? "Book a Service" : "What do you need?"}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {started ? "Answer a few quick questions and get an instant estimate" : "Choose a service to get started"}
              </p>
            </div>
          </div>
          <a
            href="tel:+12312341234"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
          >
            <Phone className="h-3.5 w-3.5" />
            <span>Call us</span>
          </a>
        </div>
      </div>

      {!started ? (
        <div className="flex-1 overflow-y-auto max-w-2xl mx-auto w-full px-4 pt-5" style={{ paddingBottom: "calc(64px + 1rem)" }}>
          <div className="grid grid-cols-2 gap-3">
            {QUICK_SERVICES.map(({ label, emoji, slug, color }) => (
              <button
                key={slug}
                onClick={() => pickService(slug)}
                className={`bg-gradient-to-br ${color} border rounded-2xl p-4 text-left transition-all active:scale-95`}
              >
                <span className="text-2xl">{emoji}</span>
                <p className="mt-2 font-semibold text-sm text-white">{label}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Get an instant estimate →</p>
              </button>
            ))}
          </div>

          <button
            onClick={startGeneral}
            className="mt-4 w-full border border-border rounded-2xl px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all text-left"
          >
            <span className="font-medium text-foreground">Not sure? Browse all services</span>
            <span className="text-slate-500 ml-2">→</span>
          </button>

          {!user && (
            <p className="text-xs text-center text-muted-foreground pt-4">
              <Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link>
              {" "}to track your bookings and earn JCMOVES rewards.
            </p>
          )}
        </div>
      ) : (
        <div
          className="flex-1 overflow-hidden max-w-2xl mx-auto w-full px-4 pt-4 pb-2 flex flex-col"
          style={{ minHeight: 0, paddingBottom: "calc(64px + 0.5rem)" }}
        >
          <BookingChatbot
            embedded
            initialService={initialService}
            className="flex-1"
          />
          {!user && (
            <p className="text-xs text-center text-muted-foreground pt-1 flex-shrink-0">
              <Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link>
              {" "}to track your bookings and earn JCMOVES rewards automatically.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
