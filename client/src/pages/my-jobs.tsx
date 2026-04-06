import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  MapPin, Calendar, Loader2, Truck, Trash2, Snowflake, Wrench,
  Plus, CheckCircle, Clock, AlertCircle, Users, DollarSign, X,
  Package, ChevronRight, RefreshCw, Coins, HelpCircle, Phone,
  FileText, Star, ArrowRight, Info
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { LucideIcon } from "lucide-react";

interface CustomerJob {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  serviceType: string;
  pickupAddress: string;
  dropoffAddress: string;
  moveDate: string;
  status: string;
  estimatedTotal: string;
  quotedPrice: string;
  crewSize?: number | null;
  details?: string;
  notes?: string;
  createdAt: string;
}

// ── Service config — covers all serviceType values ────────────────────────────
const SERVICE_CONFIG: Record<string, { icon: LucideIcon; color: string; bg: string; label: string }> = {
  moving:      { icon: Truck,      color: "text-blue-400",   bg: "bg-blue-500/15",   label: "Moving"       },
  residential: { icon: Truck,      color: "text-blue-400",   bg: "bg-blue-500/15",   label: "Moving"       },
  labor:       { icon: Wrench,     color: "text-amber-400",  bg: "bg-amber-500/15",  label: "Labor Only"   },
  handyman:    { icon: Wrench,     color: "text-amber-400",  bg: "bg-amber-500/15",  label: "Labor Only"   },
  junk:        { icon: Trash2,     color: "text-orange-400", bg: "bg-orange-500/15", label: "Junk Removal" },
  snow:        { icon: Snowflake,  color: "text-cyan-400",   bg: "bg-cyan-500/15",   label: "Snow Removal" },
  cleaning:    { icon: Package,    color: "text-green-400",  bg: "bg-green-500/15",  label: "Cleaning"     },
  demolition:  { icon: Truck,      color: "text-red-400",    bg: "bg-red-500/15",    label: "Demolition"   },
  custom:      { icon: HelpCircle, color: "text-violet-400", bg: "bg-violet-500/15", label: "Custom Job"   },
};

function getSvcConfig(type: string) {
  return SERVICE_CONFIG[type] ?? SERVICE_CONFIG.moving;
}

// ── Status config ──────────────────────────────────────────────────────────────
type StatusInfo = {
  label: string;
  cls: string;
  icon: LucideIcon;
  banner: {
    bg: string;
    border: string;
    iconColor: string;
    headline: string;
    body: string;
  };
};

function getStatus(status: string): StatusInfo {
  switch (status) {
    case "completed":
    case "paid":
      return {
        label: "Done",
        cls: "bg-green-500/15 text-green-400",
        icon: CheckCircle,
        banner: {
          bg: "bg-green-500/10", border: "border-green-500/20", iconColor: "text-green-400",
          headline: "Job Complete!",
          body: "Your job is finished. Tokens will be credited to your wallet shortly. Thank you for choosing JC on the Move!",
        },
      };
    case "in_progress":
      return {
        label: "In Progress",
        cls: "bg-blue-500/15 text-blue-400",
        icon: Clock,
        banner: {
          bg: "bg-blue-500/10", border: "border-blue-500/20", iconColor: "text-blue-400",
          headline: "Your crew is working now",
          body: "Everything is underway. Questions or concerns? Call or text us anytime: (906) 285-9312",
        },
      };
    case "available":
    case "confirmed":
    case "accepted":
      return {
        label: "Crew Assigned",
        cls: "bg-blue-500/15 text-blue-400",
        icon: Users,
        banner: {
          bg: "bg-blue-500/10", border: "border-blue-500/20", iconColor: "text-blue-400",
          headline: "Crew confirmed!",
          body: "Your crew is set and ready to go. They'll reach out 30 minutes before arrival to confirm. Call us with any changes: (906) 285-9312",
        },
      };
    case "quoted":
      return {
        label: "Quote Ready",
        cls: "bg-emerald-500/15 text-emerald-400",
        icon: DollarSign,
        banner: {
          bg: "bg-emerald-500/10", border: "border-emerald-500/20", iconColor: "text-emerald-400",
          headline: "Your quote is ready!",
          body: "We've reviewed your request and put together a price. Call us to confirm and schedule your crew.",
        },
      };
    case "cancelled":
      return {
        label: "Cancelled",
        cls: "bg-red-500/15 text-red-400",
        icon: AlertCircle,
        banner: {
          bg: "bg-red-500/10", border: "border-red-500/20", iconColor: "text-red-400",
          headline: "Job cancelled",
          body: "This job was cancelled. Book a new service whenever you're ready.",
        },
      };
    default:
      return {
        label: "Submitted",
        cls: "bg-orange-500/15 text-orange-400",
        icon: Clock,
        banner: {
          bg: "bg-orange-500/10", border: "border-orange-500/20", iconColor: "text-orange-400",
          headline: "We're reviewing your request",
          body: "Our team will reach out within a few hours to confirm details and send your quote. Watch for a call or text from (906) 285-9312.",
        },
      };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isJustZip(addr: string) {
  return /^\d{5}(-\d{4})?$/.test(addr.trim());
}

function formatAddress(addr: string) {
  if (!addr || isJustZip(addr)) return null;
  return addr;
}

// Strip leading emoji chars (like "🔥 ", "✅ ") from chatbot answer text
function stripEmoji(str: string): string {
  return str.replace(/^[\p{Emoji}\s]+/u, "").trim();
}

// Parse chatbot JSON details into structured, human-readable lines
type DetailLine = { label: string; value: string };

function parseChatbotDetails(raw: string): DetailLine[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed._source !== "chatbot" || !parsed.answers) return null;
    const a = parsed.answers;
    const lines: DetailLine[] = [];

    if (a.serviceType) lines.push({ label: "Service", value: stripEmoji(a.serviceType) });
    if (a.homeSize)    lines.push({ label: "Home size", value: a.homeSize });
    if (a.moveDate)    lines.push({ label: "Preferred date", value: stripEmoji(a.moveDate) });
    if (a.fromZip)     lines.push({ label: "ZIP / From", value: a.fromZip });
    if (a.originFloor) lines.push({ label: "Floor", value: a.originFloor });
    if (a.parkingDistance) lines.push({ label: "Parking", value: stripEmoji(a.parkingDistance) });

    if (Array.isArray(a.furniture) && a.furniture.length > 0) {
      lines.push({ label: "Large furniture", value: a.furniture.join(", ") });
    }
    if (a.boxCount)    lines.push({ label: "Boxes", value: a.boxCount });
    if (Array.isArray(a.specialItems) && a.specialItems.some((s: string) => !s.toLowerCase().includes("none"))) {
      lines.push({ label: "Special items", value: a.specialItems.filter((s: string) => !s.toLowerCase().includes("none")).join(", ") });
    }
    if (a.packingHelp) lines.push({ label: "Packing help", value: stripEmoji(a.packingHelp) });
    if (a.notes && a.notes !== "(none)") lines.push({ label: "Notes", value: a.notes });

    return lines.length > 0 ? lines : null;
  } catch {
    return null;
  }
}

// ── JobSheet ──────────────────────────────────────────────────────────────────
function JobSheet({ job, open, onClose, onNewJob }: {
  job: CustomerJob; open: boolean; onClose: () => void; onNewJob: () => void;
}) {
  const svc = getSvcConfig(job.serviceType);
  const Icon = svc.icon;
  const st = getStatus(job.status);
  const StatusIcon = st.icon;

  const price = parseFloat(job.quotedPrice || job.estimatedTotal || "0");
  const hasCost = price > 0;
  const estimatedTokens = hasCost ? Math.floor(price * 15) + 1500 : 0;

  const pickupAddr = formatAddress(job.pickupAddress);
  const dropoffAddr = formatAddress(job.dropoffAddress);

  const rawDescription = job.details || job.notes || "";
  const chatbotLines = rawDescription ? parseChatbotDetails(rawDescription) : null;
  const jobDescription = chatbotLines ? "" : rawDescription;
  const showReschedule = ["new", "quote_requested", "quoted", "available", "confirmed"].includes(job.status);
  const isQuoted = job.status === "quoted";
  const isActive = ["available", "confirmed", "in_progress", "accepted"].includes(job.status);
  const isDone = ["completed", "paid"].includes(job.status);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent
        side="bottom"
        className="bg-zinc-900 border-zinc-800 rounded-t-3xl pb-10 max-h-[90vh] overflow-y-auto"
      >
        <SheetHeader className="text-left mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${svc.bg}`}>
              <Icon className={`h-6 w-6 ${svc.color}`} />
            </div>
            <div>
              <SheetTitle className="text-white text-lg font-black">{svc.label}</SheetTitle>
              <div className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>
                <StatusIcon className="h-3 w-3" />
                {st.label}
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-3">

          {/* Status banner */}
          <div className={`rounded-2xl border p-4 ${st.banner.bg} ${st.banner.border}`}>
            <div className="flex items-start gap-3">
              <StatusIcon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${st.banner.iconColor}`} />
              <div>
                <p className="text-white font-bold text-sm">
                  {job.status === "quoted" && job.serviceType === "junk"
                    ? "Price locked in!"
                    : st.banner.headline}
                </p>
                <p className="text-zinc-400 text-xs mt-0.5 leading-relaxed">
                  {job.status === "quoted" && job.serviceType === "junk"
                    ? "Your pickup price is set — no review needed. Call us to schedule your crew."
                    : st.banner.body}
                </p>
              </div>
            </div>
          </div>

          {/* Quote price highlight — shown when quoted */}
          {isQuoted && hasCost && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
              <p className="text-xs text-zinc-400 mb-1 font-semibold uppercase tracking-widest">Your Quote</p>
              <p className="text-3xl font-black text-emerald-400">${price.toFixed(0)}</p>
              <p className="text-xs text-zinc-500 mt-1">Call to confirm: <span className="text-white font-semibold">(906) 285-9312</span></p>
            </div>
          )}

          {/* Job details block */}
          <div className="bg-zinc-800/50 rounded-2xl p-4 space-y-3">

            {pickupAddr && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">{job.serviceType === "moving" || job.serviceType === "residential" ? "Pickup Address" : "Address"}</p>
                  <p className="text-sm text-white">{pickupAddr}</p>
                </div>
              </div>
            )}

            {dropoffAddr && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Drop-off Address</p>
                  <p className="text-sm text-white">{dropoffAddr}</p>
                </div>
              </div>
            )}

            {job.moveDate && (
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Scheduled Date</p>
                  <p className="text-sm text-white font-semibold">
                    {new Date(job.moveDate).toLocaleDateString("en-US", {
                      weekday: "long", month: "long", day: "numeric", year: "numeric"
                    })}
                  </p>
                </div>
              </div>
            )}

            {job.crewSize && (
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Crew Size</p>
                  <p className="text-sm text-white">
                    {job.crewSize}{" "}
                    {svc.label === "Labor Only" ? "helper" : svc.label === "Junk Removal" ? "crew member" : "mover"}
                    {job.crewSize > 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            )}

            {chatbotLines && chatbotLines.length > 0 && (
              <div className="flex items-start gap-3">
                <FileText className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-500 mb-2">Job Details</p>
                  <div className="space-y-1.5">
                    {chatbotLines.map((line, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-xs text-zinc-500 w-24 flex-shrink-0 pt-0.5">{line.label}</span>
                        <span className="text-xs text-white leading-relaxed">{line.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {jobDescription && (
              <div className="flex items-start gap-3">
                <FileText className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Job Description</p>
                  <p className="text-sm text-white leading-relaxed">{jobDescription}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-zinc-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Submitted</p>
                <p className="text-sm text-zinc-400">
                  {new Date(job.createdAt).toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric"
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Price + tokens (non-quoted) */}
          {hasCost && !isQuoted && (
            <div className="flex gap-3">
              <div className="flex-1 bg-zinc-800/50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-green-400" />
                  <p className="text-xs text-zinc-500">{isDone ? "Final Total" : "Estimated"}</p>
                </div>
                <p className="text-xl font-black text-green-400">${price.toFixed(0)}</p>
              </div>
              {estimatedTokens > 0 && (
                <div className="flex-1 bg-zinc-800/50 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Coins className="h-4 w-4 text-orange-400" />
                    <p className="text-xs text-zinc-500">{isDone ? "Earned" : "Earn"}</p>
                  </div>
                  <p className="text-xl font-black text-orange-400">~{estimatedTokens.toLocaleString()}</p>
                  <p className="text-[10px] text-zinc-600">JCMOVES</p>
                </div>
              )}
            </div>
          )}

          {/* Call to confirm button when quoted */}
          {isQuoted && (
            <a
              href="tel:+19062859312"
              className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] transition-all text-white font-bold text-sm"
            >
              <Phone className="h-4 w-4" />
              {job.serviceType === "junk" ? "Call to Schedule Pickup" : "Call to Confirm Booking"}
            </a>
          )}

          {/* Actions */}
          {showReschedule && !isQuoted && (
            <button className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl border border-zinc-700 text-zinc-300 text-sm font-semibold hover:bg-zinc-800 active:scale-[0.98] transition-all">
              <RefreshCw className="h-4 w-4" />
              Request Reschedule
            </button>
          )}

          {/* Need help — always visible when active */}
          {(isActive || isQuoted) && (
            <a
              href="tel:+19062859312"
              className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl border border-zinc-700 text-zinc-400 text-sm font-semibold hover:bg-zinc-800 active:scale-[0.98] transition-all"
            >
              <Phone className="h-4 w-4" />
              Call JC on the Move
            </a>
          )}

          <button
            onClick={onNewJob}
            className="w-full h-11 rounded-2xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm active:scale-[0.98] transition-all"
          >
            Book Another Service
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── MyJobsPage ────────────────────────────────────────────────────────────────
export default function MyJobsPage() {
  const [, setLocation] = useLocation();
  const [selectedJob, setSelectedJob] = useState<CustomerJob | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");

  const { data: jobs = [], isLoading, isError, refetch } = useQuery<CustomerJob[]>({
    queryKey: ["/api/customer/my-leads"],
    retry: 2,
  });

  const filtered = jobs
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .filter(j => {
      if (filter === "active") return !["completed", "cancelled", "paid"].includes(j.status);
      if (filter === "done")   return ["completed", "paid"].includes(j.status);
      return true;
    });

  return (
    <div className="min-h-screen bg-zinc-950 pb-28">
      <div className="max-w-[430px] mx-auto px-4 pt-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-black text-white">My Jobs</h1>
          <button
            onClick={() => setLocation("/post-job")}
            className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-all"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 mb-5">
          {([
            { value: "all",    label: "All"    },
            { value: "active", label: "Active" },
            { value: "done",   label: "Done"   },
          ] as const).map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                filter === f.value
                  ? "bg-orange-500 text-white"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
          </div>
        ) : isError ? (
          <div className="bg-zinc-900 rounded-2xl border border-red-900/30 p-8 text-center">
            <p className="text-red-400 font-semibold mb-2">Couldn't load your jobs</p>
            <button onClick={() => refetch()} className="text-sm text-orange-400 font-semibold">Try Again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto mb-4">
              <Truck className="h-8 w-8 text-orange-400" />
            </div>
            <p className="font-bold text-white mb-1">
              {filter === "all" ? "No jobs yet" : `No ${filter} jobs`}
            </p>
            <p className="text-zinc-500 text-sm mb-5">
              {filter === "all" ? "Post a job and earn JCMOVES tokens" : "Book a new service to get started"}
            </p>
            <button
              onClick={() => setLocation("/post-job")}
              className="h-11 px-8 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-400 active:scale-[0.97] transition-all"
            >
              Book a Service
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(job => {
              const svc = getSvcConfig(job.serviceType);
              const Icon = svc.icon;
              const st = getStatus(job.status);
              const price = parseFloat(job.estimatedTotal || "0");

              const pickupAddr = formatAddress(job.pickupAddress);
              const rawDesc = job.details || job.notes || "";
              const chatbotParsed = rawDesc ? parseChatbotDetails(rawDesc) : null;
              const shortDesc = chatbotParsed
                ? (chatbotParsed[0]?.value || "").slice(0, 40)
                : rawDesc.slice(0, 40);

              return (
                <button
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-left hover:border-zinc-700 active:scale-[0.97] transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${svc.bg}`}>
                      <Icon className={`h-5 w-5 ${svc.color}`} />
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${st.cls}`}>
                      {st.label}
                    </span>
                  </div>

                  <p className="font-bold text-white text-sm leading-tight mb-1">{svc.label}</p>

                  {job.moveDate ? (
                    <p className="text-xs text-zinc-500 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(job.moveDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  ) : pickupAddr ? (
                    <p className="text-xs text-zinc-500 truncate">{pickupAddr}</p>
                  ) : shortDesc ? (
                    <p className="text-xs text-zinc-500 truncate">{shortDesc}</p>
                  ) : (
                    <p className="text-xs text-zinc-600 italic">Details on file</p>
                  )}

                  {price > 0 && (
                    <p className={`text-xs font-semibold mt-1 ${
                      job.status === "quoted" ? "text-emerald-400" : "text-green-400"
                    }`}>
                      ${price.toFixed(0)} {job.status === "quoted" ? "quoted" : "est."}
                    </p>
                  )}

                  <div className="mt-2 flex items-center gap-1 text-zinc-600">
                    <ChevronRight className="h-3.5 w-3.5" />
                    <span className="text-[10px]">View details</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedJob && (
        <JobSheet
          job={selectedJob}
          open={true}
          onClose={() => setSelectedJob(null)}
          onNewJob={() => { setSelectedJob(null); setLocation("/post-job"); }}
        />
      )}
    </div>
  );
}
