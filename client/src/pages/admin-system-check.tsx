import { useState, useEffect } from "react";
import { Link } from "wouter";
import { CheckCircle2, Circle, ArrowLeft, RefreshCw, AlertTriangle, CheckCheck, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AdminPricingEditor } from "@/components/AdminPricingEditor";

const STORAGE_KEY = "jcmoves-system-check-v2";

interface CheckItem {
  id: string;
  label: string;
  note?: string;
  checked: boolean;
}

interface Section {
  id: string;
  title: string;
  color: string;
  icon: string;
  items: Omit<CheckItem, "checked">[];
}

const SECTIONS: Section[] = [
  {
    id: "emails",
    title: "Email System",
    color: "blue",
    icon: "📧",
    items: [
      { id: "email_welcome", label: "Welcome / Account Approved", note: "Sent when admin approves a new signup" },
      { id: "email_lead", label: "New Lead Notification", note: "Admin alert when quote request submitted" },
      { id: "email_contact", label: "Contact Form Notification", note: "Admin alert for contact form submissions" },
      { id: "email_review", label: "Post-Job Review Request", note: "Sent to customer after job completes" },
      { id: "email_recovery", label: "Account Recovery Code", note: "Password reset email with 6-digit code" },
      { id: "email_newcustomer", label: "New Customer Registration Alert", note: "Admin notified when someone signs up" },
      { id: "email_booking", label: "Booking Confirmation", note: "Customer confirmation after booking" },
      { id: "email_reward", label: "Reward Redemption Confirmation", note: "Customer notified when reward redeemed" },
      { id: "email_bitcoin", label: "Bitcoin Payment Notification", note: "Alert when BTC payment received" },
      { id: "email_labor", label: "Labor Calculator Booking", note: "Admin alert for labor calc bookings" },
    ],
  },
  {
    id: "rewards",
    title: "Reward Shop",
    color: "purple",
    icon: "🎁",
    items: [
      { id: "reward_catalog", label: "Catalog loads correctly (12 official items)", note: "Visit /marketplace to verify" },
      { id: "reward_prices", label: "Token prices are correct (5K–100K range)", note: "Check each card's price" },
      { id: "reward_redeem", label: "Redeem flow works end-to-end", note: "Try redeeming a low-cost item" },
      { id: "reward_admin_edit", label: "Admin can edit item prices & details", note: "Use Edit button at /admin/marketplace" },
      { id: "reward_admin_hide", label: "Admin can hide / show items", note: "Toggle status in admin panel" },
      { id: "reward_admin_reset", label: "Reset Catalog button works", note: "At /admin/marketplace top-right" },
      { id: "reward_featured", label: "Featured cards show on marketplace", note: "Coffee, 10% Off, 20% Off, Spin" },
    ],
  },
  {
    id: "spin",
    title: "Quantum Spin Wheel",
    color: "amber",
    icon: "⚡",
    items: [
      { id: "spin_open", label: "Spin wheel opens from marketplace", note: "Click 'Open Quantum Spin'" },
      { id: "spin_direct", label: "Direct spin (costs 100 JCMOVES)", note: "Should deduct from wallet" },
      { id: "spin_marketplace", label: "Marketplace entry spin (free)", note: "Redeem Quantum Spin Entry item" },
      { id: "spin_prizes", label: "Prizes award correctly", note: "Token wins go to wallet" },
      { id: "spin_jackpots", label: "Mini & Major jackpot meters display", note: "Shows live growing amounts" },
      { id: "spin_coupons", label: "Coupon prizes generate promo codes", note: "Check in Redemptions tab" },
      { id: "spin_admin", label: "Admin spin wheel tab accessible", note: "At /admin/marketplace → Spin Wheel tab" },
    ],
  },
  {
    id: "daily",
    title: "Daily Check-In Tasks",
    color: "green",
    icon: "✅",
    items: [
      { id: "daily_checkin", label: "Daily Quantum Spin check-in works", note: "Coin button → Daily Quantum Spin task" },
      { id: "daily_mining", label: "Mining start / claim works", note: "Session starts and tokens accumulate" },
      { id: "daily_scripture", label: "Daily Scripture claim works (employees)", note: "Scripture streak increments" },
      { id: "daily_pushups", label: "Pushup logging works", note: "Logs fitness and boosts mining speed" },
      { id: "daily_situps", label: "Situp logging works", note: "Logs fitness and boosts mining speed" },
      { id: "daily_lead", label: "Add Job Lead task marks complete", note: "After submitting lead" },
      { id: "daily_bonus", label: "500 JCMOVES completion bonus unlocks", note: "Appears when all tasks done" },
      { id: "daily_reset", label: "Tasks reset at midnight each day", note: "All items reset to unchecked" },
    ],
  },
  {
    id: "leads",
    title: "Jobs & Leads",
    color: "orange",
    icon: "📋",
    items: [
      { id: "leads_view", label: "Leads page loads at /leads", note: "Previously had CheckCheck crash" },
      { id: "leads_calendar", label: "Calendar view shows jobs", note: "Jobs appear on correct dates" },
      { id: "leads_status", label: "Job status updates save correctly", note: "Traffic light: red/yellow/green" },
      { id: "leads_employee", label: "Employee assignment works", note: "Assign crew to a job" },
      { id: "leads_create", label: "Create new lead / quote request", note: "Form submits and email fires" },
    ],
  },
  {
    id: "payments",
    title: "Payments",
    color: "teal",
    icon: "💳",
    items: [
      { id: "pay_square", label: "Square payment processing works", note: "Test with a small charge" },
      { id: "pay_bitcoin", label: "Bitcoin payment page loads", note: "Visit /bitcoin-payment" },
      { id: "pay_btc_confirm", label: "BTC payment confirmation email fires", note: "Check email after test payment" },
    ],
  },
  {
    id: "marketplace_shop",
    title: "Moving Shop (Services)",
    color: "sky",
    icon: "🚛",
    items: [
      { id: "shop_loads", label: "Moving Shop loads at /services", note: "Hero, crew cards, pricing" },
      { id: "shop_switcher", label: "Earn ↔ Spend switcher shows on both shops", note: "Floating pill at bottom" },
      { id: "shop_booking", label: "Book a Crew links to quote form", note: "Clicking crew card → quote" },
      { id: "shop_token_preview", label: "Token earn preview shows on booking", note: "Shows JCMOVES to earn" },
    ],
  },
];

function loadChecks(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch { return {}; }
}

function saveChecks(checks: Record<string, boolean>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(checks)); } catch {}
}

export default function AdminSystemCheckPage() {
  const [checks, setChecks] = useState<Record<string, boolean>>(loadChecks);
  const [tab, setTab] = useState<"checklist" | "pricing">("checklist");
  const { toast } = useToast();

  useEffect(() => { saveChecks(checks); }, [checks]);

  const toggle = (id: string) => setChecks(prev => ({ ...prev, [id]: !prev[id] }));
  const resetAll = () => { if (confirm("Reset all checkboxes?")) { setChecks({}); } };

  const sendTestEmailsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/send-test-emails", { to: "michigankid906@gmail.com" }),
    onSuccess: (data: any) => {
      toast({ title: `📧 Sent ${data.sent}/${data.total} test emails`, description: "Check michigankid906@gmail.com" });
    },
    onError: () => toast({ title: "Failed to send test emails", variant: "destructive" }),
  });

  const allItems = SECTIONS.flatMap(s => s.items.map(i => i.id));
  const checkedCount = allItems.filter(id => checks[id]).length;
  const totalCount = allItems.length;
  const pct = Math.round((checkedCount / totalCount) * 100);

  const colorClasses: Record<string, string> = {
    blue: "border-blue-500/30 bg-blue-500/5",
    purple: "border-purple-500/30 bg-purple-500/5",
    amber: "border-amber-500/30 bg-amber-500/5",
    green: "border-green-500/30 bg-green-500/5",
    orange: "border-orange-500/30 bg-orange-500/5",
    teal: "border-teal-500/30 bg-teal-500/5",
    sky: "border-sky-500/30 bg-sky-500/5",
  };

  const badgeColors: Record<string, string> = {
    blue: "bg-blue-500/20 text-blue-400",
    purple: "bg-purple-500/20 text-purple-400",
    amber: "bg-amber-500/20 text-amber-400",
    green: "bg-green-500/20 text-green-400",
    orange: "bg-orange-500/20 text-orange-400",
    teal: "bg-teal-500/20 text-teal-400",
    sky: "bg-sky-500/20 text-sky-400",
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Header */}
      <div className="bg-card border-b border-border sticky top-0 z-20 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            </Link>
            <div>
              <h1 className="text-base font-bold flex items-center gap-2">
                <CheckCheck className="h-5 w-5 text-green-500" /> System &amp; Config
              </h1>
              {tab === "checklist" && (
                <p className="text-xs text-muted-foreground">{checkedCount}/{totalCount} verified — {pct}% complete</p>
              )}
            </div>
          </div>
          {tab === "checklist" && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="text-xs" onClick={resetAll}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reset All
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                disabled={sendTestEmailsMutation.isPending}
                onClick={() => sendTestEmailsMutation.mutate()}
              >
                {sendTestEmailsMutation.isPending ? "Sending…" : "📧 Send Test Emails"}
              </Button>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="max-w-3xl mx-auto mt-3 flex gap-1 border border-border rounded-lg p-1 bg-muted/40">
          <button
            onClick={() => setTab("checklist")}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md transition-colors ${
              tab === "checklist"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CheckCheck className="h-3.5 w-3.5" /> Checklist
          </button>
          <button
            onClick={() => setTab("pricing")}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md transition-colors ${
              tab === "pricing"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" /> Pricing
          </button>
        </div>

        {tab === "checklist" && (
          <div className="max-w-3xl mx-auto mt-3">
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-gradient-to-r from-green-500 to-emerald-400 h-2 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tab: Checklist */}
      {tab === "checklist" && (
        <div className="max-w-3xl mx-auto px-4 py-5 space-y-6">
          {pct < 100 && (
            <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{totalCount - checkedCount} items still need verification. Check each feature and tick it off when confirmed working.</span>
            </div>
          )}
          {pct === 100 && (
            <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>All systems verified! Great work.</span>
            </div>
          )}

          {SECTIONS.map((section) => {
            const sectionItems = section.items;
            const sectionDone = sectionItems.filter(i => checks[i.id]).length;
            const sectionTotal = sectionItems.length;
            const sectionComplete = sectionDone === sectionTotal;

            return (
              <div key={section.id} className={`border rounded-xl overflow-hidden ${colorClasses[section.color]}`}>
                <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{section.icon}</span>
                    <h2 className="font-semibold text-sm">{section.title}</h2>
                  </div>
                  <Badge className={`text-xs ${badgeColors[section.color]} border-0`}>
                    {sectionComplete ? "✓ Complete" : `${sectionDone}/${sectionTotal}`}
                  </Badge>
                </div>
                <div className="divide-y divide-border/40">
                  {sectionItems.map((item) => {
                    const done = !!checks[item.id];
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggle(item.id)}
                        className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/20 ${done ? "opacity-60" : ""}`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {done
                            ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                            : <Circle className="h-5 w-5 text-muted-foreground" />
                          }
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium leading-tight ${done ? "line-through text-muted-foreground" : ""}`}>
                            {item.label}
                          </p>
                          {item.note && (
                            <p className="text-xs text-muted-foreground mt-0.5">{item.note}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <p className="text-center text-xs text-muted-foreground pb-4">
            Checkboxes saved locally in this browser. Use "Reset All" to start fresh.
          </p>
        </div>
      )}

      {/* Tab: Pricing */}
      {tab === "pricing" && (
        <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold mb-0.5">Pricing Configuration</h2>
            <p className="text-xs text-muted-foreground">
              Changes take effect immediately on the booking page and quote builder.
            </p>
          </div>
          <AdminPricingEditor alwaysOpen />
        </div>
      )}
    </div>
  );
}
