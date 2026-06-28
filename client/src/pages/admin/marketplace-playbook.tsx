import {
  ArrowRight,
  BadgeDollarSign,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  MapPinned,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
} from "lucide-react";

const steps = [
  {
    number: "1",
    title: "Customer Requests",
    icon: ClipboardList,
    action: "Address, date, service, truck details, notes, and photos become one lead card.",
    inspiration: "Google, Yelp, Facebook, Craigslist, Walmart, Goodwill",
  },
  {
    number: "2",
    title: "JC Prices And Assigns",
    icon: MapPinned,
    action: "Zone rates, crew size, hours, travel, and Square invoice links attach to that card.",
    inspiration: "MovingHelp, MovingHelper, U-Haul, HireAHelper, PODS",
  },
  {
    number: "3",
    title: "Crew Completes And Gets Paid",
    icon: Users,
    action: "Calendar, dispatch, completion, cash payout, company profit, and JCMOVES rewards close the loop.",
    inspiration: "Two Men and a Truck, Porch Moving Group, JC-native rewards",
  },
];

const automation = [
  {
    title: "Auto-create the card",
    detail: "Every quote or worker-submitted request should create a quote_requested lead immediately.",
  },
  {
    title: "Auto-estimate the range",
    detail: "Use address autocomplete, zone match, crew count, hours, minimums, discounts, and travel padding.",
  },
  {
    title: "Auto-notify the right people",
    detail: "Owner/admin on new request, eligible crew when available, assigned crew after dispatch.",
  },
  {
    title: "Auto-prepare billing",
    detail: "Generate Square invoice/payment link after staff confirms the quote and deposit rules.",
  },
  {
    title: "Auto-close rewards",
    detail: "Completion triggers payout safety checks and JCMOVES distribution once, not twice.",
  },
];

const humanChecks = [
  "Final quote approval",
  "Crew assignment override",
  "Payment/deposit exceptions",
  "Deleting or archiving real lead cards",
];

export default function AdminMarketplacePlaybookPage() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <section className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-5">
          <div className="flex items-center gap-2 text-emerald-300">
            <Sparkles className="h-5 w-5" />
            <p className="text-xs font-bold uppercase tracking-[0.25em]">Marketplace Playbook</p>
          </div>
          <h1 className="mt-3 text-3xl font-black text-white">Keep it 1, 2, 3.</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            Simple rule: every request becomes a card, every card can be priced and assigned, every completed job feeds
            payout, profit, reviews, and JCMOVES.
          </p>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-3">
          {steps.map(({ number, title, icon: Icon, action, inspiration }) => (
            <div key={number} className="rounded-lg border border-slate-800 bg-slate-900/70 p-5">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-lg font-black text-white">
                  {number}
                </div>
                <Icon className="h-5 w-5 text-blue-300" />
              </div>
              <h2 className="mt-4 text-lg font-black text-white">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">{action}</p>
              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Reference patterns</p>
              <p className="mt-1 text-sm text-slate-400">{inspiration}</p>
            </div>
          ))}
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.75fr]">
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              <h2 className="font-black text-white">Semi-Automation Plan</h2>
            </div>
            <div className="mt-4 space-y-3">
              {automation.map((item) => (
                <div key={item.title} className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    <p className="font-bold text-slate-100">{item.title}</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-orange-400/25 bg-orange-500/10 p-5">
              <div className="flex items-center gap-2 text-orange-200">
                <BadgeDollarSign className="h-5 w-5" />
                <h2 className="font-black">Human Approval Gates</h2>
              </div>
              <div className="mt-4 space-y-2">
                {humanChecks.map((check) => (
                  <div key={check} className="flex items-center gap-2 text-sm text-slate-200">
                    <ArrowRight className="h-4 w-4 text-orange-300" />
                    {check}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-5">
              <div className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-blue-300" />
                <h2 className="font-black text-white">Daily Motion</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                A couple minutes of crew advertising can feed a couple extra jobs a week. Rep links, Discord reminders,
                and focus-area ads should point people back into the same request card flow.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                [Truck, "Dispatch"],
                [CalendarCheck, "Calendar"],
              ].map(([Icon, label]) => {
                const TypedIcon = Icon as typeof Truck;
                return (
                  <div key={label as string} className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-center">
                    <TypedIcon className="mx-auto h-5 w-5 text-blue-300" />
                    <p className="mt-2 text-sm font-bold text-slate-200">{label as string}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
