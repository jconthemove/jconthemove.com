import { Link } from "wouter";
import { Gem, ChevronRight, Coins, UserPlus, RotateCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const RECURRING_DESTINATIONS: Record<string, { href: string; label: string; hint: string }> = {
  trash_valet: {
    href: "/trash-valet/book",
    label: "Make this recurring",
    hint: "Switch to a monthly trash valet plan and never miss a pickup",
  },
  lawn_care: {
    href: "/book-lawn-care",
    label: "Set up recurring lawn visits",
    hint: "Weekly or biweekly lawn care — auto-scheduled",
  },
  snow: {
    href: "/snow-removal",
    label: "Add me to recurring snow service",
    hint: "We'll show up every storm — no calling required",
  },
  snow_removal: {
    href: "/snow-removal",
    label: "Add me to recurring snow service",
    hint: "We'll show up every storm — no calling required",
  },
  cleaning: {
    href: "/post-job?serviceType=cleaning",
    label: "Schedule recurring cleanings",
    hint: "Weekly, biweekly, or monthly — your call",
  },
  window_cleaning: {
    href: "/window-cleaning",
    label: "Set up seasonal window service",
    hint: "Spring + fall on autopilot",
  },
};

interface BookingConfirmedTilesProps {
  // Optional service id to surface a "make this recurring" CTA tailored to it
  serviceType?: string;
  // Email used on the booking — pre-fills /customer-login so the just-
  // submitted quote auto-links to the new account by email (Task #116).
  customerEmail?: string;
}

export default function BookingConfirmedTiles({ serviceType, customerEmail }: BookingConfirmedTilesProps = {}) {
  const { isAuthenticated } = useAuth();
  const recurring = serviceType ? RECURRING_DESTINATIONS[serviceType] : undefined;
  const trackHref = customerEmail
    ? `/customer-login?intent=track&email=${encodeURIComponent(customerEmail)}`
    : `/customer-login?intent=track`;

  return (
    <div className="mt-4 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center mb-3">
        While You Wait — Explore More
      </p>

      {/* Make this recurring (Task #116) */}
      {recurring && (
        <Link href={recurring.href}>
          <a
            className="flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-gradient-to-r from-emerald-900/25 to-teal-900/15 px-4 py-3 hover:border-emerald-500/50 transition-all active:scale-[0.98]"
            data-testid="link-make-recurring"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <RotateCw className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-tight">{recurring.label}</p>
              <p className="text-xs text-emerald-300/80 mt-0.5">{recurring.hint}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-emerald-400/60 shrink-0" />
          </a>
        </Link>
      )}

      {/* Track this job — create an account (Task #116) — anonymous only */}
      {!isAuthenticated && (
        <Link href={trackHref}>
          <a
            className="flex items-center gap-3 rounded-2xl border border-sky-500/25 bg-gradient-to-r from-sky-900/25 to-indigo-900/15 px-4 py-3 hover:border-sky-500/50 transition-all active:scale-[0.98]"
            data-testid="link-create-account"
          >
            <div className="w-10 h-10 rounded-xl bg-sky-500/15 flex items-center justify-center shrink-0">
              <UserPlus className="h-5 w-5 text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-tight">Track this job — create an account</p>
              <p className="text-xs text-sky-300/80 mt-0.5">
                {customerEmail
                  ? `We'll link it to ${customerEmail} so you can pause, skip, or re-book anytime`
                  : "Pause, skip, or re-book anytime — and earn JCMOVES rewards"}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-sky-400/60 shrink-0" />
          </a>
        </Link>
      )}

      {/* Ashley's Jewelry Shop */}
      <Link href="/nature-made-jewls">
        <a className="flex items-center gap-3 rounded-2xl border border-rose-500/25 bg-gradient-to-r from-rose-900/25 to-pink-900/15 px-4 py-3 hover:border-rose-500/50 transition-all active:scale-[0.98]">
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center shrink-0">
            <Gem className="h-5 w-5 text-rose-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white leading-tight">Ashley's Jewelry Shop</p>
            <p className="text-xs text-rose-300/80 mt-0.5">Nature Made Jewls · Handcrafted with love</p>
          </div>
          <ChevronRight className="h-4 w-4 text-rose-400/60 shrink-0" />
        </a>
      </Link>

      {/* Rewards Marketplace */}
      <Link href="/marketplace">
        <a className="flex items-center gap-3 rounded-2xl border border-orange-500/25 bg-gradient-to-r from-orange-900/25 to-amber-900/15 px-4 py-3 hover:border-orange-500/50 transition-all active:scale-[0.98]">
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
            <Coins className="h-5 w-5 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white leading-tight">Earn &amp; Redeem JCMOVES</p>
            <p className="text-xs text-orange-300/80 mt-0.5">Rewards marketplace · Tokens earned every job</p>
          </div>
          <ChevronRight className="h-4 w-4 text-orange-400/60 shrink-0" />
        </a>
      </Link>
    </div>
  );
}
