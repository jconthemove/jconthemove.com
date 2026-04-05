import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { notificationService } from "@/lib/notifications";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sun, Cloud, CloudSnow, CloudRain, Zap, Wind, BookOpen, RefreshCw,
  Wifi, WifiOff, Coins, MapPin, Calendar, ChevronRight, Loader2, Trophy,
  Clock, CheckCircle, XCircle, Plus, LogOut, Briefcase, Users, CheckCircle2,
} from "lucide-react";
import { apiRequest, clearTokens, queryClient as qc } from "@/lib/queryClient";
import { Link } from "wouter";
import type { Lead, User } from "@shared/schema";

type JobBoardLead = {
  id: string;
  serviceType: string;
  fromAddress: string | null;
  toAddress: string | null;
  moveDate: string | null;
  crewSize: number | null;
  status: string;
  price: string | null;
  details: string | null;
  estimatedTokens: number;
  alreadyApplied: boolean;
  crewSlotsFilled: number;
};

type TrashJobSub = {
  customerName: string;
  address: string;
  city: string;
  phone: string;
};

type TrashJob = {
  id: string;
  subscriptionId: string;
  serviceWeekOf: string;
  status: string;
  cans: number;
  bagCount: number;
  isRecyclingWeek: boolean;
  jobValue: string;
};

type TrashJobRow = {
  job: TrashJob;
  sub: TrashJobSub;
};

const SCRIPTURES = [
  { text: "Commit your work to the Lord, and your plans will be established.", ref: "Proverbs 16:3" },
  { text: "Whatever you do, work heartily, as for the Lord and not for men.", ref: "Colossians 3:23" },
  { text: "For I know the plans I have for you, declares the Lord.", ref: "Jeremiah 29:11" },
  { text: "I can do all things through Christ who strengthens me.", ref: "Philippians 4:13" },
  { text: "Be strong and courageous. Do not be afraid.", ref: "Joshua 1:9" },
  { text: "Work with enthusiasm, as though working for the Lord.", ref: "Ephesians 6:7" },
];

const MOVER_QUOTES = [
  { text: "Lift with your legs, not your ego.", ref: "Mover Wisdom" },
  { text: "Every heavy load moved is a family's fresh start.", ref: "Crew Philosophy" },
  { text: "Show up early. Work hard. Go home proud.", ref: "Crew Code" },
];

const ALL_QUOTES = [...SCRIPTURES, ...MOVER_QUOTES];

function getDayOfYear() {
  const now = new Date();
  return Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
}

function getWeatherInfo(code: number) {
  if (code === 0) return { label: "Clear Sky", Icon: Sun, color: "text-yellow-400", isSnow: false };
  if (code <= 2) return { label: "Partly Cloudy", Icon: Cloud, color: "text-slate-300", isSnow: false };
  if (code <= 67) return { label: "Rainy", Icon: CloudRain, color: "text-blue-400", isSnow: false };
  if (code <= 77) return { label: "Snowing", Icon: CloudSnow, color: "text-cyan-300", isSnow: true };
  if (code <= 86) return { label: "Snow Showers", Icon: CloudSnow, color: "text-cyan-300", isSnow: true };
  return { label: "Thunderstorm", Icon: Zap, color: "text-purple-400", isSnow: false };
}

const SERVICE_ICONS: Record<string, string> = {
  moving: "🚛", labor: "💪", residential: "🏠", junk: "🗑️", snow: "❄️",
  cleaning: "✨", handyman: "🔧", demolition: "⚒️", flooring: "🪵", painting: "🎨",
  window_cleaning: "🪟", trash_valet: "🗑️",
};

function isSummerSeason(): boolean {
  const month = new Date().getMonth() + 1; // 1-12
  return month >= 5 && month <= 9;
}

function getAvailableTimeSlots(): Date[] {
  const now = new Date();
  const maxHour = isSummerSeason() ? 20 : 18; // 8pm or 6pm
  const slots: Date[] = [];
  let hour = now.getHours() + 1; // next full hour
  while (hour <= maxHour) {
    const slot = new Date(now);
    slot.setHours(hour, 0, 0, 0);
    slots.push(slot);
    hour += 1;
  }
  return slots;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatCountdown(until: Date): string {
  const diff = until.getTime() - Date.now();
  if (diff <= 0) return "Expiring…";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m remaining`;
  return `${m}m remaining`;
}

export default function CrewTodayPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = ["admin", "business_owner"].includes(user?.role || "");
  const [quoteIdx, setQuoteIdx] = useState(getDayOfYear() % ALL_QUOTES.length);
  const [scriptureClaimed, setScriptureClaimed] = useState(false);

  const userRecord = user as User & { isAvailable?: boolean; availableUntil?: string | null };
  const [dutyStatus, setDutyStatus] = useState<boolean>(Boolean(userRecord?.isAvailable));
  const [availableUntil, setAvailableUntil] = useState<Date | null>(
    userRecord?.availableUntil ? new Date(userRecord.availableUntil) : null
  );
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [countdown, setCountdown] = useState<string>("");
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const timeSlots = useMemo(() => getAvailableTimeSlots(), [showTimePicker]);

  // Sync duty state when user data arrives (handles page refresh while already online)
  useEffect(() => {
    if (!user) return;
    const u = user as User & { isAvailable?: boolean; availableUntil?: string | null };
    setDutyStatus(Boolean(u.isAvailable));
    setAvailableUntil(u.availableUntil ? new Date(u.availableUntil) : null);
  }, [user?.id]);

  // Update countdown every minute
  useEffect(() => {
    if (!dutyStatus || !availableUntil) { setCountdown(""); return; }
    const update = () => setCountdown(formatCountdown(availableUntil));
    update();
    const t = setInterval(update, 30_000);
    return () => clearInterval(t);
  }, [dutyStatus, availableUntil]);

  // Heartbeat every 60 seconds while online
  useEffect(() => {
    if (dutyStatus) {
      heartbeatRef.current = setInterval(async () => {
        try {
          const res = await apiRequest("POST", "/api/crew/heartbeat", {});
          const data = await res.json();
          if (data.expired) {
            setDutyStatus(false);
            setAvailableUntil(null);
            queryClient.invalidateQueries({ queryKey: ["/api/employees/available"] });
            toast({ title: "⏰ Shift Ended", description: "Your availability window has expired." });
          }
        } catch {
          // silent
        }
      }, 60_000);
    } else {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    }
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, [dutyStatus]);

  // Client-side expiry check
  useEffect(() => {
    if (!availableUntil || !dutyStatus) return;
    const msUntilExpiry = availableUntil.getTime() - Date.now();
    if (msUntilExpiry <= 0) { setDutyStatus(false); setAvailableUntil(null); return; }
    const t = setTimeout(() => {
      setDutyStatus(false);
      setAvailableUntil(null);
      queryClient.invalidateQueries({ queryKey: ["/api/employees/available"] });
      toast({ title: "⏰ Shift Ended", description: "Your availability window has expired." });
    }, msUntilExpiry);
    return () => clearTimeout(t);
  }, [availableUntil, dutyStatus]);

  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: [isAdmin ? "/api/leads" : "/api/leads/my-jobs"],
    refetchInterval: 15000,
    staleTime: 0,
  });

  const { data: boardJobs = [] } = useQuery<JobBoardLead[]>({
    queryKey: ["/api/leads/job-board"],
    staleTime: 0,
    refetchOnMount: true,
    refetchInterval: 15000,
  });

  const [applyingId, setApplyingId] = useState<string | null>(null);
  const applyMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const res = await apiRequest("POST", `/api/leads/${leadId}/crew-apply`, {});
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to sign up" }));
        throw new Error(err.error || "Failed to sign up");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads/job-board"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/my-jobs"] });
      setApplyingId(null);
      toast({ title: "✅ Signed up!", description: "The admin will confirm your assignment." });
    },
    onError: (e: Error) => {
      setApplyingId(null);
      toast({ title: "Couldn't sign up", description: e.message, variant: "destructive" });
    },
  });

  const { data: employees = [] } = useQuery<User[]>({ queryKey: ["/api/employees"] });
  const { data: wallet } = useQuery<{ balance: string }>({ queryKey: ["/api/rewards/wallet"] });

  // Trash Valet: fetch this week's jobs (API returns { job, sub }[] shape)
  const { data: trashJobsData = [] } = useQuery<TrashJobRow[]>({
    queryKey: ["/api/trash/jobs"],
    refetchInterval: 30000,
    staleTime: 0,
  });
  // API already defaults to current week — no need to client-filter by date
  const trashJobsThisWeek = trashJobsData.filter(row => row.job.status !== "cancelled");

  // Photo URL state per job (for complete action)
  const [trashPhotoUrls, setTrashPhotoUrls] = useState<Record<string, string>>({});

  const trashActionMutation = useMutation<unknown, Error, { jobId: string; action: string; photoUrl?: string }>({
    mutationFn: async ({ jobId, action, photoUrl }) => {
      const body = photoUrl ? { photoUrl } : {};
      const res = await apiRequest("PATCH", `/api/trash/jobs/${jobId}/${action}`, body);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Action failed" }));
        throw new Error((err as { error?: string }).error || "Action failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trash/jobs"] });
      toast({ title: "✅ Updated", description: "Trash job status updated." });
    },
    onError: (e: Error) => {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    },
  });

  const { data: weather } = useQuery({
    queryKey: ["weather-ironwood"],
    queryFn: async () => {
      const res = await fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=46.4547&longitude=-90.1712&current=temperature_2m,weather_code,wind_speed_10m,precipitation&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch"
      );
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 1000 * 60 * 30,
    retry: false,
  });

  const scriptureClaimMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/mining/scripture-claim", {});
      return res.json();
    },
    onSuccess: (data) => {
      setScriptureClaimed(true);
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      toast({ title: `🎉 +${data.amount} JCMOVES claimed!`, description: `Day ${data.streak} streak!` });
      notificationService.notifyNewReward("scripture claim", data.amount);
    },
    onError: (e: Error) => {
      if (e?.message?.includes("Already claimed")) {
        setScriptureClaimed(true);
        toast({ title: "Already claimed today", description: "Come back tomorrow!" });
      } else {
        toast({ title: "Couldn't claim", description: e?.message, variant: "destructive" });
      }
    },
  });

  const goOnlineMutation = useMutation({
    mutationFn: async (until: Date) => {
      const res = await apiRequest("POST", "/api/crew/go-online", { availableUntil: until.toISOString() });
      return res.json();
    },
    onSuccess: (_, until) => {
      setDutyStatus(true);
      setAvailableUntil(until);
      setShowTimePicker(false);
      queryClient.invalidateQueries({ queryKey: ["/api/employees/available"] });
      toast({ title: `🟢 Online until ${formatTime(until)}`, description: "You'll appear for job dispatch." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const goOfflineMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/crew/go-offline", {});
      return res.json();
    },
    onSuccess: () => {
      setDutyStatus(false);
      setAvailableUntil(null);
      setShowTimePicker(false);
      queryClient.invalidateQueries({ queryKey: ["/api/employees/available"] });
      toast({ title: "🔴 You're OFF DUTY", description: "You won't appear in available crews." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const extendMutation = useMutation({
    mutationFn: async (until: Date) => {
      const res = await apiRequest("POST", "/api/crew/go-online", { availableUntil: until.toISOString() });
      return res.json();
    },
    onSuccess: (_, until) => {
      setAvailableUntil(until);
      setShowTimePicker(false);
      toast({ title: `⏰ Extended until ${formatTime(until)}` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const today = new Date();
  const todayStr = today.toDateString();

  const upcomingBoardJobs = useMemo(() => {
    return boardJobs
      .filter(j => !j.alreadyApplied && (j.crewSize || 2) > j.crewSlotsFilled)
      .sort((a, b) => {
        const da = a.moveDate ? new Date(a.moveDate.split("T")[0]).getTime() : Infinity;
        const db = b.moveDate ? new Date(b.moveDate.split("T")[0]).getTime() : Infinity;
        return da - db;
      });
  }, [boardJobs]);

  const todayJobs = leads.filter(l => {
    const dateStr = l.confirmedDate || l.moveDate;
    if (!dateStr) return false;
    const parts = dateStr.split("T")[0].split("-");
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d.toDateString() === todayStr && !["cancelled", "completed", "paid"].includes(l.status);
  });

  const myAssignments = leads.filter(l => {
    if (["cancelled", "completed", "paid"].includes(l.status)) return false;
    const members: string[] = Array.isArray(l.crewMembers) ? (l.crewMembers as string[]) : [];
    return members.includes(String(user?.id)) || l.assignedToUserId === String(user?.id);
  });

  const completedLeads = leads.filter(l => l.status === "completed");
  const leaderboard = useMemo(() => {
    const counts: Record<string, number> = {};
    completedLeads.forEach(l => {
      const key = l.createdByUserId || "";
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return employees
      .filter(e => counts[e.id])
      .map(e => ({ ...e, count: counts[e.id] as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [completedLeads, employees]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const firstName = user?.firstName || user?.username || "Crew";
  const tokenBalance = wallet?.balance ? parseFloat(wallet.balance).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—";
  const wx = weather?.current;
  const wxInfo = wx ? getWeatherInfo(wx.weather_code) : null;
  const WxIcon = wxInfo?.Icon ?? Cloud;
  const medals = ["🥇", "🥈", "🥉"];
  const isPending = goOnlineMutation.isPending || goOfflineMutation.isPending || extendMutation.isPending;

  async function handleLogout() {
    try { await apiRequest("POST", "/api/auth/logout", {}); } catch { /* ignore */ }
    clearTokens();
    qc.clear();
    window.location.href = "/";
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-900/60 via-slate-800/80 to-slate-900 border border-blue-500/20 p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-blue-300 text-sm font-medium mb-0.5">{greeting} 👋</p>
            <h1 className="text-3xl font-black text-white">{firstName}</h1>
            <p className="text-slate-400 text-sm mt-1">🚛 Ready to move mountains today?</p>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <div>
              <p className="text-xs text-slate-500">Balance</p>
              <p className="text-xl font-black text-purple-400">{tokenBalance}</p>
              <p className="text-xs text-slate-500">JCMOVES</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-slate-500 hover:text-red-400 transition-colors text-xs py-1 px-2 rounded-lg hover:bg-red-500/10"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Log out</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "Today", value: todayJobs.length, color: "text-orange-400", icon: "🔥" },
            { label: "Assigned", value: myAssignments.length, color: "text-blue-400", icon: "📋" },
            { label: "Done", value: completedLeads.length, color: "text-green-400", icon: "✅" },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.04] rounded-xl p-3 text-center border border-white/5">
              <div className="text-lg">{s.icon}</div>
              <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-slate-500 text-[11px]">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Availability Toggle */}
        {dutyStatus ? (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-green-400" />
                <span className="text-green-300 text-sm font-bold">
                  ON DUTY{availableUntil ? ` — until ${formatTime(availableUntil)}` : ""}
                </span>
              </div>
              <div className="w-10 h-5 rounded-full bg-green-500 relative">
                <div className="absolute top-0.5 left-5 w-4 h-4 rounded-full bg-white shadow" />
              </div>
            </div>
            {countdown && (
              <p className="text-xs text-green-400/70 flex items-center gap-1">
                <Clock className="h-3 w-3" /> {countdown}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => setShowTimePicker(v => !v)}
                className="flex-1 border-green-500/30 text-green-300 hover:bg-green-500/10 h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" /> Extend
              </Button>
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => goOfflineMutation.mutate()}
                className="flex-1 bg-red-600/20 hover:bg-red-600/30 text-red-300 border-0 h-7 text-xs"
              >
                {goOfflineMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><XCircle className="h-3 w-3 mr-1" /> Go Offline</>}
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowTimePicker(v => !v)}
            disabled={isPending}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-600/40 bg-slate-800/60 text-slate-400 transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-2">
              <WifiOff className="h-4 w-4" />
              <span className="text-sm font-bold">OFF DUTY — tap to set availability</span>
            </div>
            <div className="w-10 h-5 rounded-full bg-slate-600 relative">
              <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow" />
            </div>
          </button>
        )}

        {/* Time Picker */}
        {showTimePicker && (
          <div className="mt-3 bg-slate-900/80 border border-slate-700/50 rounded-xl p-3">
            <p className="text-slate-400 text-xs font-semibold mb-2 uppercase tracking-wider">
              {dutyStatus ? "Extend until…" : "Available until…"}
            </p>
            {timeSlots.length === 0 ? (
              <p className="text-slate-500 text-xs">No time slots available today (past closing time).</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {timeSlots.map(slot => (
                  <button
                    key={slot.toISOString()}
                    disabled={isPending}
                    onClick={() => dutyStatus ? extendMutation.mutate(slot) : goOnlineMutation.mutate(slot)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-300 text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {formatTime(slot)}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowTimePicker(false)}
              className="mt-2 text-slate-500 text-xs hover:text-slate-400"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Daily Scripture */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-950/80 via-slate-900 to-slate-950 border border-indigo-500/20 p-5">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="h-4 w-4 text-indigo-400" />
          <span className="text-indigo-300 text-xs font-bold uppercase tracking-wider">Daily Inspiration</span>
        </div>
        <blockquote className="text-white text-base font-medium leading-relaxed mb-2 italic">
          "{ALL_QUOTES[quoteIdx].text}"
        </blockquote>
        <p className="text-indigo-400 text-sm font-semibold">— {ALL_QUOTES[quoteIdx].ref}</p>
        <div className="flex gap-2 mt-4 flex-wrap">
          <Button
            size="sm" variant="outline"
            onClick={() => setQuoteIdx(i => (i + 1) % ALL_QUOTES.length)}
            className="border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 h-8 text-xs"
          >
            <RefreshCw className="h-3 w-3 mr-1.5" /> New Verse
          </Button>
          <Button
            size="sm"
            disabled={scriptureClaimed || scriptureClaimMutation.isPending}
            onClick={() => scriptureClaimMutation.mutate()}
            className={`h-8 text-xs font-bold border-0 ${
              scriptureClaimed ? "bg-green-600/20 text-green-400 cursor-default" : "bg-indigo-600 hover:bg-indigo-500 text-white"
            }`}
          >
            {scriptureClaimMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> :
              scriptureClaimed ? "✅ Claimed!" : "🪙 Claim Reward"}
          </Button>
        </div>
      </div>

      {/* Active Assignments — jobs assigned to this crew member regardless of date */}
      {myAssignments.length > 0 && (
        <div className="rounded-2xl bg-slate-800/40 border border-orange-500/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-orange-400" />
            <span className="text-orange-300 font-bold text-sm uppercase tracking-wider">My Assignments</span>
            <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-xs">{myAssignments.length}</Badge>
          </div>
          <div className="space-y-2">
            {myAssignments.map(job => {
              const dateLabel = (job.confirmedDate || job.moveDate)
                ? new Date(((job.confirmedDate || job.moveDate) as string).split("T")[0] + "T12:00:00")
                    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                : "Date TBD";
              return (
                <Link key={job.id} href={`/lead/${job.id}`}>
                  <div className="flex items-center gap-3 bg-white/[0.03] rounded-xl p-3 border border-orange-500/10 cursor-pointer hover:bg-white/[0.06] transition-colors">
                    <span className="text-2xl">{SERVICE_ICONS[job.serviceType] ?? "🚛"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate capitalize">
                        {job.serviceType?.replace(/-/g, " ")} Job
                      </p>
                      <p className="text-slate-400 text-xs flex items-center gap-1">
                        <Calendar className="h-3 w-3" />{dateLabel}
                        {job.fromAddress && (
                          <><MapPin className="h-3 w-3 ml-2" /><span className="truncate max-w-[100px]">{job.fromAddress}</span></>
                        )}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <Badge className={`text-[10px] ${job.status === "in_progress" ? "bg-green-500/20 text-green-300 border-green-500/30" : "bg-orange-500/20 text-orange-300 border-orange-500/30"}`}>
                        {job.status.replace(/_/g, " ")}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-slate-500 mt-1 ml-auto" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Today's Jobs */}
      {todayJobs.length > 0 && (
        <div className="rounded-2xl bg-slate-800/40 border border-orange-500/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-orange-400 font-bold">📅 Today's Jobs</span>
            <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30">{todayJobs.length}</Badge>
          </div>
          <div className="space-y-2">
            {todayJobs.map(job => (
              <Link key={job.id} href={`/lead/${job.id}`}>
                <div className="flex items-center gap-3 bg-white/[0.03] rounded-xl p-3 border border-white/5 cursor-pointer hover:bg-white/[0.06] transition-colors">
                  <span className="text-2xl">{SERVICE_ICONS[job.serviceType] ?? "🚛"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{job.firstName} {job.lastName}</p>
                    {job.fromAddress && (
                      <p className="text-slate-400 text-xs flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{job.fromAddress}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-500" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {todayJobs.length === 0 && upcomingBoardJobs.length === 0 && myAssignments.length === 0 && trashJobsThisWeek.length === 0 && (
        <div className="rounded-2xl bg-slate-800/30 border border-slate-700/30 p-6 text-center">
          <Calendar className="h-10 w-10 text-slate-500 mx-auto mb-2" />
          <p className="text-slate-400 font-medium">No jobs scheduled yet</p>
          <p className="text-slate-500 text-sm mt-1">New jobs will appear here automatically</p>
        </div>
      )}

      {/* Trash Valet Jobs — this week */}
      {trashJobsThisWeek.length > 0 && (
        <div className="rounded-2xl bg-slate-800/40 border border-emerald-500/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-emerald-400 font-bold text-sm uppercase tracking-wider">🗑️ Trash Valet</span>
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs">{trashJobsThisWeek.length}</Badge>
          </div>
          <div className="space-y-3">
            {trashJobsThisWeek.map((row: TrashJobRow) => {
              const tj = row.job;
              const sub = row.sub;
              return (
              <div key={tj.id} className="bg-white/[0.03] rounded-xl p-3 border border-emerald-500/10 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{sub?.customerName || "Customer"}</p>
                    <p className="text-slate-400 text-xs flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{sub?.address}{sub?.city ? `, ${sub.city}` : ""}</span>
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge className="bg-slate-700/60 text-slate-300 border-0 text-[10px]">{tj.cans} can{tj.cans !== 1 ? "s" : ""}</Badge>
                      {tj.bagCount > 0 && <Badge className="bg-slate-700/60 text-slate-300 border-0 text-[10px]">{tj.bagCount} bags</Badge>}
                      {tj.isRecyclingWeek && <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-[10px]">♻️ Recycling</Badge>}
                    </div>
                  </div>
                  <Badge className={`text-[10px] flex-shrink-0 ${
                    tj.status === "completed" ? "bg-green-500/20 text-green-300 border-green-500/30"
                    : tj.status === "pulled_out" ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
                    : tj.status === "returned" ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                    : "bg-slate-500/20 text-slate-300 border-slate-500/30"
                  }`}>{tj.status.replace(/_/g, " ")}</Badge>
                </div>
                {tj.status !== "completed" && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      {tj.status === "scheduled" && (
                        <Button
                          size="sm"
                          className="flex-1 bg-orange-500/20 text-orange-300 border border-orange-500/30 hover:bg-orange-500/30 text-xs h-7"
                          onClick={() => trashActionMutation.mutate({ jobId: tj.id, action: "pull-out" })}
                          disabled={trashActionMutation.isPending}
                        >Pull Out</Button>
                      )}
                      {tj.status === "pulled_out" && (
                        <Button
                          size="sm"
                          className="flex-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 text-xs h-7"
                          onClick={() => trashActionMutation.mutate({ jobId: tj.id, action: "return" })}
                          disabled={trashActionMutation.isPending}
                        >Returned</Button>
                      )}
                    </div>
                    {(tj.status === "pulled_out" || tj.status === "returned") && (
                      <div className="space-y-1.5">
                        <input
                          type="url"
                          placeholder="Photo URL (optional)"
                          value={trashPhotoUrls[tj.id] ?? ""}
                          onChange={(e) => setTrashPhotoUrls(prev => ({ ...prev, [tj.id]: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                        />
                        <Button
                          size="sm"
                          className="w-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 text-xs h-7"
                          onClick={() => trashActionMutation.mutate({
                            jobId: tj.id,
                            action: "complete",
                            photoUrl: trashPhotoUrls[tj.id] || undefined,
                          })}
                          disabled={trashActionMutation.isPending}
                        >✓ Mark Complete</Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Available Jobs to Sign Up For */}
      {upcomingBoardJobs.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-br from-blue-950/60 via-slate-900 to-slate-950 border border-blue-500/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-blue-400" />
              <span className="text-blue-300 text-sm font-bold uppercase tracking-wider">Available Jobs</span>
              <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs">{upcomingBoardJobs.length} open</Badge>
            </div>
            <Link href="/crew/jobs">
              <span className="text-slate-500 text-xs hover:text-slate-300 transition-colors">See all →</span>
            </Link>
          </div>
          <div className="space-y-3">
            {upcomingBoardJobs.slice(0, 5).map(job => {
              const slotsOpen = (job.crewSize || 2) - job.crewSlotsFilled;
              const dateLabel = job.moveDate
                ? new Date(job.moveDate.split("T")[0] + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                : "Date TBD";
              return (
                <div key={job.id} className="bg-white/[0.04] rounded-xl p-3 border border-white/5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl leading-none">{SERVICE_ICONS[job.serviceType] ?? "🚛"}</span>
                      <div>
                        <p className="text-white text-sm font-semibold capitalize">{job.serviceType.replace(/-/g, " ")} Job</p>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-slate-400 text-xs flex items-center gap-1">
                            <Calendar className="h-3 w-3" />{dateLabel}
                          </span>
                          {job.fromAddress && (
                            <span className="text-slate-400 text-xs flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate max-w-[130px]">{job.fromAddress}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-orange-400 font-bold text-xs flex items-center gap-1 justify-end">
                        <Coins className="h-3 w-3" />~{job.estimatedTokens.toLocaleString()}
                      </p>
                      <p className="text-slate-500 text-[10px]">JCMOVES</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-yellow-400 text-xs flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {slotsOpen} slot{slotsOpen !== 1 ? "s" : ""} open · {job.crewSize || 2} needed
                    </span>
                    <Button
                      size="sm"
                      disabled={applyingId === job.id && applyMutation.isPending}
                      onClick={() => { setApplyingId(job.id); applyMutation.mutate(job.id); }}
                      className="h-7 text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3"
                    >
                      {applyingId === job.id && applyMutation.isPending
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : "Sign Up"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weather */}
      <div className={`rounded-2xl p-5 border ${wxInfo?.isSnow ? "bg-gradient-to-br from-cyan-950/60 via-slate-900 to-slate-950 border-cyan-500/30" : "bg-slate-800/40 border-slate-700/40"}`}>
        <div className="flex items-center gap-2 mb-3">
          <WxIcon className={`h-4 w-4 ${wxInfo?.color ?? "text-slate-400"}`} />
          <span className="font-bold text-white">Ironwood, MI — Weather</span>
          {wxInfo?.isSnow && <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-xs animate-pulse">❄️ SNOW ALERT</Badge>}
        </div>
        {wx ? (
          <div className="flex items-center gap-4">
            <p className={`text-4xl font-black ${wxInfo?.color ?? "text-white"}`}>{Math.round(wx.temperature_2m)}°F</p>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <Wind className="h-3.5 w-3.5" />{Math.round(wx.wind_speed_10m)} mph
              </div>
              <p className="text-slate-400">{wxInfo?.label}</p>
            </div>
          </div>
        ) : (
          <p className="text-slate-500 text-sm">Weather unavailable</p>
        )}
      </div>

      {/* Mini Leaderboard */}
      {leaderboard.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 border border-amber-500/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-4 w-4 text-amber-400" />
            <span className="font-bold text-white text-sm">Crew Leaderboard</span>
          </div>
          <div className="space-y-1.5">
            {leaderboard.map((emp, i) => (
              <div key={emp.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02] border border-white/5">
                <span className="text-lg w-6">{medals[i]}</span>
                <p className="text-white text-sm font-semibold flex-1">{emp.firstName || emp.username}</p>
                <span className="text-amber-300 font-black">{emp.count} jobs</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="h-2" />
    </div>
  );
}
