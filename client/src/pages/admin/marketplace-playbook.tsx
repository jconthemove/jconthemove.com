import {
  ArrowRight,
  BadgeDollarSign,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  MapPinned,
  Megaphone,
  Route,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  Users,
  WalletCards,
} from "lucide-react";
import {
  MARKETPLACE_FUNCTIONAL_IDEAS,
  MARKETPLACE_OPERATING_FLYWHEEL,
  MARKETPLACE_REQUEST_SHAPES,
  MARKETPLACE_SIMPLE_SIDES,
  type MarketplaceFlywheelStageId,
  type MarketplaceFunctionalIdeaStatus,
} from "@shared/marketplaceShapes";
import AuthorityTasksCard from "@/components/AuthorityTasksCard";

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

const blueprint = [
  {
    title: "Customer Front Door",
    icon: Store,
    sources: "Google, Yelp, Facebook, Craigslist",
    keep: "Fast discovery, trust signals, clear contact, no dead-end requests.",
    build: "Book asks zip/date first, then service, truck, crew package, notes, photos, and creates a lead card.",
    surface: "Book + Funnel + Ops Board",
  },
  {
    title: "Pricing Engine",
    icon: Route,
    sources: "U-Haul, MovingHelp, MovingHelper, HireAHelper, PODS",
    keep: "Crew-size rates, hourly minimums, zone travel, discounts after longer bookings.",
    build: "Zones and quote snapshots price the job without changing old orders when settings change.",
    surface: "Pricing + Jobs",
  },
  {
    title: "Crew Operations",
    icon: Truck,
    sources: "Two Men and a Truck, Porch Moving Group",
    keep: "Assigned crews, arrival windows, calendar clarity, completion confirmation.",
    build: "Lead cards move from quote to available to assigned to completed, then payout and rewards run once.",
    surface: "Dispatch + Schedule + Crew Tasks",
  },
  {
    title: "Growth Flywheel",
    icon: WalletCards,
    sources: "Target, Walmart, Goodwill, McDonald's, JCMOVES",
    keep: "Simple offers, repeatable local demand, referrals, credits, and easy promos.",
    build: "Rep links, Discord/webhook ads, JCMOVES credits, Square links, and review loops feed the next card.",
    surface: "Marketing + Finance + Playbook",
  },
];

const statusClasses: Record<MarketplaceFunctionalIdeaStatus, string> = {
  live: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  in_progress: "border-blue-400/30 bg-blue-500/10 text-blue-200",
  next: "border-orange-400/30 bg-orange-500/10 text-orange-200",
};

const flywheelIcons: Record<MarketplaceFlywheelStageId, typeof ClipboardList> = {
  attract: Megaphone,
  capture: ClipboardList,
  size: Store,
  quote: BadgeDollarSign,
  dispatch: Truck,
  complete: CheckCircle2,
  collect: WalletCards,
  retain: Sparkles,
};

function statusLabel(status: MarketplaceFunctionalIdeaStatus) {
  return status.replace(/_/g, " ");
}

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

        <AuthorityTasksCard className="mt-5" />

        <section className="mt-5 rounded-lg border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-blue-300" />
            <h2 className="font-black text-white">Best-Of Blueprint</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Borrow the useful parts, then make them JC-simple: one request card, one pricing path, one crew path, one
            money/rewards loop.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {blueprint.map(({ title, icon: Icon, sources, keep, build, surface }) => (
              <div key={title} className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-white">{title}</p>
                    <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{surface}</p>
                  </div>
                  <Icon className="h-5 w-5 shrink-0 text-blue-300" />
                </div>
                <div className="mt-3 space-y-2 text-sm leading-6">
                  <p className="text-slate-400"><span className="font-bold text-slate-200">References:</span> {sources}</p>
                  <p className="text-slate-400"><span className="font-bold text-slate-200">Keep:</span> {keep}</p>
                  <p className="text-slate-300"><span className="font-bold text-emerald-300">JC move:</span> {build}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Route className="h-5 w-5 text-emerald-300" />
                <h2 className="font-black text-white">JC Operating Flywheel</h2>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Every idea gets judged by whether it moves the same card forward: attract, capture, size, quote,
                dispatch, complete, collect, retain.
              </p>
            </div>
            <span className="rounded-full border border-emerald-400/30 bg-slate-950/60 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-200">
              one card loop
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            {MARKETPLACE_OPERATING_FLYWHEEL.map((stage, index) => {
              const Icon = flywheelIcons[stage.id] || ClipboardList;
              return (
                <div key={stage.id} className="rounded-md border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-sm font-black text-emerald-200">
                        {index + 1}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Icon className="h-4 w-4 text-emerald-300" />
                          <p className="text-sm font-black text-white">{stage.label}</p>
                        </div>
                        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          {stage.primarySurface}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                      {stage.sourceOfTruth}
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-200">{stage.objective}</p>

                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {[
                      ["Customer", stage.customerAction],
                      ["Worker", stage.workerAction],
                      ["Company", stage.companyAction],
                    ].map(([label, detail]) => (
                      <div key={label} className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-300">{detail}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <div className="rounded-md border border-blue-400/20 bg-blue-500/10 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-200">Automation</p>
                      <p className="mt-1 text-xs leading-5 text-slate-300">{stage.automation}</p>
                    </div>
                    <div className="rounded-md border border-emerald-400/20 bg-emerald-500/10 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">Proof</p>
                      <p className="mt-1 text-xs leading-5 text-slate-300">{stage.proof}</p>
                    </div>
                    <div className="rounded-md border border-orange-400/20 bg-orange-500/10 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-200">Close</p>
                      <p className="mt-1 text-xs leading-5 text-slate-300">{stage.rewardClose}</p>
                    </div>
                  </div>

                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    References: {stage.references}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-300" />
                <h2 className="font-black text-white">Functional Ideas Matrix</h2>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                These are the practical pieces JC should borrow and simplify. Each idea names the customer reality,
                worker reality, company reality, and where it belongs in the product.
              </p>
            </div>
            <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-300">
              {MARKETPLACE_FUNCTIONAL_IDEAS.length} ideas
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            {MARKETPLACE_FUNCTIONAL_IDEAS.map((idea) => (
              <div key={idea.reference} className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-white">{idea.reference}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{idea.pattern}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClasses[idea.status]}`}>
                    {statusLabel(idea.status)}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  <span className="font-bold text-emerald-300">JC move:</span> {idea.jcMove}
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  {[
                    ["Customer", idea.customerReality],
                    ["Worker", idea.workerReality],
                    ["Company", idea.companyReality],
                  ].map(([label, detail]) => (
                    <div key={label} className="rounded-md border border-slate-800 bg-slate-900/50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-300">{detail}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-200">
                    {idea.surface}
                  </span>
                  {idea.shapeIds.map((shapeId) => (
                    <span key={shapeId} className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {shapeId.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-blue-300" />
            <h2 className="font-black text-white">Request Shapes</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Different jobs can be different shapes, but they should still land in the same card pipeline.
          </p>
          <div className="mt-4 grid gap-3">
            {MARKETPLACE_REQUEST_SHAPES.map((item) => (
              <div key={item.shape} className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-white">{item.shape}</p>
                    <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{item.references}</p>
                  </div>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-200">
                    lead card
                  </span>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  {[
                    ["Customer", item.customer],
                    ["Worker", item.worker],
                    ["Company", item.company],
                  ].map(([label, detail]) => (
                    <div key={label} className="rounded-md border border-slate-800 bg-slate-900/50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-300">{detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-blue-400/20 bg-blue-500/10 p-5">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-300" />
            <h2 className="font-black text-white">Simple Sides</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Keep every side lean: only the tabs people need, the tasks they do daily, and the options they change.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {MARKETPLACE_SIMPLE_SIDES.map((item) => (
              <div key={item.side} className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-sm font-black text-white">{item.side}</p>
                <div className="mt-3 space-y-3 text-sm leading-6">
                  <p className="text-slate-300">
                    <span className="font-bold text-blue-200">Tabs:</span> {item.tabs}
                  </p>
                  <p className="text-slate-300">
                    <span className="font-bold text-emerald-200">Tasks:</span> {item.tasks}
                  </p>
                  <p className="text-slate-300">
                    <span className="font-bold text-orange-200">Options:</span> {item.options}
                  </p>
                </div>
              </div>
            ))}
          </div>
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
