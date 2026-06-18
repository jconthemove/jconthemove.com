import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Coins, Phone, MessageSquare, ChevronRight, Loader2, Search, Sparkles, MessageCircle, Zap, DollarSign, CalendarClock } from "lucide-react";
import ServiceCard from "@/components/ServiceCard";
import { getService } from "@/lib/services";
import { JunkFlow, MovingFlow } from "@/components/ServiceSelector";
import LiveCrewBeacon from "@/components/LiveCrewBeacon";
import { BookingChatbot } from "@/components/booking-chatbot";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserStatusBar } from "@/components/UserStatusBar";
import { ConfettiBurst } from "@/components/ConfettiBurst";
import { calculateJCMovesReward, TOKEN_ECONOMY, type LoyaltyTierKey } from "@/lib/loyalty";
import { useSheetBackButton } from "@/hooks/useSheetBackButton";

// ── Job Status Card (post-booking polling) ────────────────────────────────────

function JobStatusCard({ jobId, totalPrice, tier, onDismiss }: { jobId: string; totalPrice: number; tier: LoyaltyTierKey; onDismiss: () => void }) {
  const [celebrationFired, setCelebrationFired] = useState(false);
  const [showJobComplete, setShowJobComplete] = useState(false);

  const { data, isLoading } = useQuery<{ status: string; crewCount: number; crewSize: number; serviceType: string }>({
    queryKey: ["/api/jobs", jobId, "status"],
    queryFn: () => fetch(`/api/jobs/${jobId}/status`).then(r => r.json()),
    refetchInterval: 4000,
  });

  const status = data?.status ?? "";
  const isCompleted = status === "completed" || status === "paid";
  const crewReady = ["available", "assigned", "in_progress"].includes(status) && (data?.crewCount ?? 0) > 0;
  const priceConfirmed = status === "quoted";
  const isJunk = data?.serviceType === "junk";

  useEffect(() => {
    if (isCompleted && !celebrationFired) {
      setCelebrationFired(true);
      setShowJobComplete(true);
      setTimeout(() => setShowJobComplete(false), 2500);
    }
  }, [isCompleted, celebrationFired]);

  const estimatedTokens = calculateJCMovesReward(totalPrice, tier);

  return (
    <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-4 space-y-3 overflow-hidden">
      <ConfettiBurst active={showJobComplete} variant="inline" />
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Booking Status</span>
        <button onClick={onDismiss} className="text-zinc-600 text-xs hover:text-zinc-400">Dismiss</button>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Checking status…</span>
        </div>
      ) : isCompleted ? (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🎉</span>
            <span className="font-bold text-white">Job Complete!</span>
          </div>
          <p className="text-sm text-zinc-400">
            Thank you for choosing JC On The Move! Your tokens have been credited.
          </p>
          <div className="mt-2 flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2">
            <Coins className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
            <p className="text-xs text-orange-300 font-bold">+{estimatedTokens.toLocaleString()} JCMOVES earned!</p>
          </div>
        </div>
      ) : crewReady ? (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🟢</span>
            <span className="font-bold text-white">Crew Assigned!</span>
          </div>
          <p className="text-sm text-zinc-400">
            {data?.crewCount} {isJunk ? "crew member" : "mover"}{(data?.crewCount ?? 1) > 1 ? "s" : ""} assigned · Total: <span className="text-white font-semibold">${totalPrice}</span>
          </p>
          <p className="text-xs text-zinc-500 mt-1">They'll be in touch to confirm details.</p>
        </div>
      ) : priceConfirmed ? (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">✅</span>
            <span className="font-bold text-white">Price Confirmed!</span>
          </div>
          <p className="text-sm text-zinc-400">Total: <span className="text-white font-semibold">${totalPrice}</span></p>
          <p className="text-xs text-zinc-500 mt-1">
            {isJunk ? "Call us to schedule your pickup:" : "Call to confirm:"}{" "}
            <a href="tel:+19062859312" className="text-orange-400 font-semibold">(906) 285-9312</a>
          </p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Search className="h-5 w-5 text-orange-400 animate-pulse" />
            <span className="font-bold text-white">Booking received!</span>
          </div>
          <p className="text-sm text-zinc-400">Total: <span className="text-white font-semibold">${totalPrice}</span></p>
          <p className="text-xs text-zinc-500 mt-0.5">Our team will reach out to confirm — watch for a call from (906) 285-9312.</p>
        </div>
      )}
      {/* Token earn preview */}
      {estimatedTokens > 0 && (
        <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2">
          <Coins className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
          <p className="text-xs text-orange-300">
            <span className="font-bold">+{estimatedTokens.toLocaleString()} JCMOVES</span>
            <span className="text-orange-500 ml-1">credited when this job completes</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface TrashSub {
  id: string;
  finalMonthlyPrice: string;
  planType: string;
  serviceDayOfWeek: number;
  nextBillingDate: string | null;
  status: string;
}

function getNextServiceDate(serviceDayOfWeek: number): string {
  const now = new Date();
  const today = now.getDay();
  let daysUntil = serviceDayOfWeek - today;
  if (daysUntil <= 0) daysUntil += 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntil);
  return next.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

type ExpandedService = "moving" | "junk" | null;

export default function CustomerHomePage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [activeBooking, setActiveBooking] = useState<{ jobId: string; totalPrice: number } | null>(null);
  const [expanded, setExpanded] = useState<ExpandedService>(null);
  const [showChatbot, setShowChatbot] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Back-button interception: browser back closes whichever sheet is open
  const handleCloseChatbot = useCallback(() => setShowChatbot(false), []);
  const handleCloseMoving = useCallback(() => setExpanded(null), []);
  const handleCloseJunk = useCallback(() => setExpanded(null), []);
  useSheetBackButton(showChatbot, handleCloseChatbot);
  useSheetBackButton(expanded === "moving", handleCloseMoving);
  useSheetBackButton(expanded === "junk", handleCloseJunk);

  const { data: wallet } = useQuery<{ tokenBalance: string; cashBalance: string }>({
    queryKey: ["/api/rewards/wallet"],
    retry: 2,
  });

  const { data: trashSub } = useQuery<TrashSub | null>({
    queryKey: ["/api/trash/my-subscription"],
    retry: 1,
  });

  // Task #116: one-line "Next visit" summary across all active recurring plans
  const { data: recurringPlans = [] } = useQuery<Array<{
    id: string;
    serviceKey: string;
    serviceLabel: string;
    frequency: string;
    address: string;
    nextVisitDate: string | null;
    rebookHref: string;
  }>>({
    queryKey: ["/api/customer/recurring-plans"],
    retry: 1,
  });
  const upcomingPlan = recurringPlans
    .filter(p => p.nextVisitDate)
    .sort((a, b) => (a.nextVisitDate! < b.nextVisitDate! ? -1 : 1))[0];
  const formatNextDate = (iso: string) => {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const tokenBalance = parseFloat(wallet?.tokenBalance || "0");
  const cashBalance = parseFloat(wallet?.cashBalance || "0");
  const isApril = new Date().getMonth() === 3;

  const userTier = (user?.loyaltyTier && user.loyaltyTier in { bronze: 1, silver: 1, gold: 1, vip: 1 }
    ? user.loyaltyTier
    : "bronze") as LoyaltyTierKey;

  function handleBooked(id: string, price: number) {
    setExpanded(null);
    setActiveBooking({ jobId: id, totalPrice: price });
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 1200);
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-28">
      <ConfettiBurst active={showConfetti} variant="overlay" />
      <div className="max-w-[430px] mx-auto px-4 pt-4 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-zinc-500 text-sm">Hey, {user?.firstName || "there"}</p>
            <h1 className="text-2xl font-black text-white">Need Help Today?</h1>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <button
              onClick={() => setLocation("/wallet")}
              className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2"
            >
              <Coins className="h-4 w-4 text-orange-400" />
              <span className="text-sm font-bold text-white">
                {tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span className="text-[10px] text-zinc-500 font-medium">JCMOVES</span>
            </button>
            <button
              onClick={() => setLocation("/rewards")}
              className="flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-500/30 rounded-lg px-2.5 py-1"
            >
              <DollarSign className="h-3 w-3 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-300">
                {cashBalance.toFixed(2)}
              </span>
              <span className="text-[9px] text-emerald-600 font-medium">USD Credit</span>
            </button>
          </div>
        </div>

        {/* Top HUD — tier + streak + wallet progress (injected from parent query) */}
        <UserStatusBar variant="dark" injectedTokenBalance={tokenBalance} />

        {/* HERO CHATBOT CTA */}
        <button
          onClick={() => setShowChatbot(true)}
          className="w-full relative overflow-hidden flex items-center gap-4 bg-gradient-to-br from-teal-900/60 to-blue-900/40 border border-teal-500/30 hover:border-teal-500/60 rounded-2xl px-5 py-4 active:scale-[0.98] transition-all text-left"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent pointer-events-none" />
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-teal-500/20">
            <MessageCircle className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="font-black text-white text-base">Get a Quote</p>
              <span className="text-[9px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 px-1.5 py-0.5 rounded-full uppercase tracking-wide">Fast · Free</span>
            </div>
            <p className="text-zinc-400 text-xs">All 8 services · Takes 60 seconds · Reviewed by Darrell</p>
          </div>
          <Sparkles className="h-5 w-5 text-teal-400 shrink-0" />
        </button>

        {/* Contact CTAs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open("tel:+19062226009", "_self")}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-full bg-orange-500/15 border border-orange-500/30 hover:bg-orange-500/25 active:scale-[0.97] transition-all"
          >
            <Phone className="h-3.5 w-3.5 text-orange-400" />
            <span className="text-orange-300 font-semibold text-xs">Call a Mover</span>
          </button>
          <button
            onClick={() => window.open("sms:+19062226009", "_self")}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-full bg-zinc-800 border border-zinc-700 hover:border-zinc-600 active:scale-[0.97] transition-all"
          >
            <MessageSquare className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-zinc-300 font-semibold text-xs">Text a Mover</span>
          </button>
        </div>

        {/* Task #116: Next visit summary across active recurring plans */}
        {upcomingPlan && (
          <button
            onClick={() => setLocation("/my-jobs")}
            data-testid="link-next-visit"
            className="w-full flex items-center gap-3 bg-emerald-950/40 border border-emerald-500/30 hover:border-emerald-500/60 rounded-2xl px-4 py-3 active:scale-[0.98] transition-all text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <CalendarClock className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/80">Next visit</p>
              <p className="text-sm font-bold text-white leading-tight truncate">
                {upcomingPlan.serviceLabel} · {formatNextDate(upcomingPlan.nextVisitDate!)}{upcomingPlan.frequency ? ` · ${upcomingPlan.frequency}` : ""}
                {recurringPlans.length > 1 ? ` · +${recurringPlans.length - 1} more plan${recurringPlans.length > 2 ? "s" : ""}` : ""}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-emerald-400/60 shrink-0" />
          </button>
        )}

        {/* Live crew beacon */}
        <LiveCrewBeacon />

        {/* Post-booking status card */}
        {activeBooking && (
          <JobStatusCard
            jobId={activeBooking.jobId}
            totalPrice={activeBooking.totalPrice}
            tier={userTier}
            onDismiss={() => setActiveBooking(null)}
          />
        )}

        {/* Unified service grid */}
        <div>
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Services</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {(
              [
                { key: "residential",    onClick: () => setExpanded("moving"),                badge: undefined,                                                    badgeColor: undefined   },
                { key: "junk",           onClick: () => setExpanded("junk"),                  badge: undefined,                                                    badgeColor: undefined   },
                { key: "labor",          onClick: () => setLocation("/book?service=labor"),   badge: undefined,                                                    badgeColor: undefined   },
                { key: "snow",           onClick: () => setLocation("/book?service=snow_removal"), badge: undefined,                                               badgeColor: undefined   },
                { key: "window_cleaning",onClick: () => setLocation("/window-cleaning"),      badge: isApril ? "April Special — 20% Off" : undefined,              badgeColor: "orange" as const },
                { key: "trash_valet",    onClick: () => setLocation("/trash-valet"),          badge: trashSub ? "Active" : undefined,                              badgeColor: "green"  as const },
                { key: "painting",       onClick: () => setLocation("/book?service=painting"),badge: undefined,                                                    badgeColor: undefined   },
                { key: "flooring",       onClick: () => setLocation("/book?service=flooring"),badge: undefined,                                                    badgeColor: undefined   },
                { key: "lawn_care",      onClick: () => setLocation("/lawn-care"),            badge: undefined,                                                   badgeColor: undefined   },
                { key: "handyman",       onClick: () => setLocation("/book?service=handyman"),badge: undefined,                                                    badgeColor: undefined   },
                { key: "demolition",     onClick: () => setLocation("/demolition"),           badge: undefined,                                                    badgeColor: undefined   },
                { key: "roofing",        onClick: () => setLocation("/roofing"),              badge: undefined,                                                    badgeColor: undefined   },
                { key: "cleaning",       onClick: () => setLocation("/cleaning"),             badge: undefined,                                                    badgeColor: undefined   },
              ] as Array<{ key: string; onClick: () => void; badge?: string; badgeColor?: "green" | "orange" | "zinc" | "blue" }>
            ).map(({ key, onClick, badge, badgeColor }) => {
              const svc = getService(key);
              if (!svc) return null;
              return (
                <ServiceCard
                  key={key}
                  service={svc}
                  onClick={onClick}
                  badge={badge}
                  badgeColor={badgeColor}
                />
              );
            })}
          </div>
        </div>

        {/* Earn More shortcut — rates from TOKEN_ECONOMY */}
        <div className="rounded-2xl border border-orange-500/20 bg-zinc-900/60 overflow-hidden">
          <button
            onClick={() => setLocation("/earn")}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center">
                <Zap className="h-5 w-5 text-orange-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-white">Earn More JCMOVES</p>
                <p className="text-xs text-zinc-500">
                  Book a service · {TOKEN_ECONOMY.TOKENS_PER_USD_EARNED} tokens per $1 spent (Bronze base)
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-600" />
          </button>
          <div className="border-t border-zinc-800 grid grid-cols-3 divide-x divide-zinc-800">
            <div className="px-3 py-2 text-center">
              <p className="text-[10px] text-zinc-500">Book a Job</p>
              <p className="text-xs font-bold text-orange-300">
                {TOKEN_ECONOMY.TOKENS_PER_USD_EARNED}<span className="text-zinc-500 font-normal">×/$</span>
              </p>
            </div>
            <div className="px-3 py-2 text-center">
              <p className="text-[10px] text-zinc-500">Referral</p>
              <p className="text-xs font-bold text-orange-300">5,000 <span className="text-zinc-500 font-normal">tokens</span></p>
            </div>
            <button onClick={() => setLocation("/rewards")} className="px-3 py-2 text-center hover:bg-white/[0.02] transition-colors">
              <p className="text-[10px] text-zinc-500">Redeem</p>
              <p className="text-xs font-bold text-amber-300">Shop →</p>
            </button>
          </div>
        </div>

      </div>

      {/* Moving Modal */}
      <Sheet open={expanded === "moving"} onOpenChange={open => !open && setExpanded(null)}>
        <SheetContent
          side="bottom"
          className="bg-zinc-950 border-zinc-800 rounded-t-3xl pb-10 h-[92vh] flex flex-col overflow-hidden"
        >
          <SheetHeader className="text-left mb-3 shrink-0">
            <SheetTitle className="text-white font-black text-lg">Book a Move</SheetTitle>
            <p className="text-zinc-400 text-xs">Full-service local & long-distance movers</p>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto min-h-0">
            <MovingFlow user={user} onBooked={handleBooked} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Junk Removal Modal */}
      <Sheet open={expanded === "junk"} onOpenChange={open => !open && setExpanded(null)}>
        <SheetContent
          side="bottom"
          className="bg-zinc-950 border-zinc-800 rounded-t-3xl pb-10 h-[92vh] flex flex-col overflow-hidden"
        >
          <SheetHeader className="text-left mb-3 shrink-0">
            <SheetTitle className="text-white font-black text-lg">Junk Removal</SheetTitle>
            <p className="text-zinc-400 text-xs">Pickup & haul away — quick & easy</p>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto min-h-0">
            <JunkFlow user={user} onBooked={handleBooked} onBack={() => setExpanded(null)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Chatbot Sheet */}
      <Sheet open={showChatbot} onOpenChange={setShowChatbot}>
        <SheetContent
          side="bottom"
          className="bg-zinc-950 border-zinc-800 rounded-t-3xl pb-10 h-[90vh] flex flex-col overflow-hidden"
        >
          <SheetHeader className="text-left mb-3 shrink-0">
            <SheetTitle className="text-white font-black text-lg">Get a Quote</SheetTitle>
            <p className="text-zinc-400 text-xs">All 12 services · Real human review before anything is sent</p>
          </SheetHeader>
          <div className="flex-1 overflow-hidden min-h-0">
            <BookingChatbot
              onClose={() => setShowChatbot(false)}
              embedded={true}
              showCloseButton={false}
              className="h-full"
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
