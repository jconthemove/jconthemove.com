import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Target, CalendarDays, Clock, TrendingUp, Calendar, Trophy, CheckCircle2, X, Loader2, Users, Edit3
} from "lucide-react";
import type { User } from "@shared/schema";

export default function CrewSchedulePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = ["admin", "business_owner"].includes(user?.role || "");

  const [blockDate, setBlockDate] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [goalWeekly, setGoalWeekly] = useState(0);
  const [goalMonthly, setGoalMonthly] = useState(0);
  const [goalJobSize, setGoalJobSize] = useState("any");
  const [adminGoalTarget, setAdminGoalTarget] = useState<string | null>(null);
  const [adminGoalWeekly, setAdminGoalWeekly] = useState(0);
  const [adminGoalMonthly, setAdminGoalMonthly] = useState(0);

  const { data: myAvailability, refetch: refetchAvailability } = useQuery<{
    blocks: { id: number; date: string; reason: string | null }[];
    schedule: { dayOfWeek: number; startHour: number | null; endHour: number | null; isAvailable: boolean | null }[];
    goals: { weeklyJobGoal: number | null; monthlyJobGoal: number | null; preferredJobSize: string | null } | null;
    stats: { thisWeek: number; thisMonth: number; allTime: number };
  }>({ queryKey: ["/api/workers/my-availability"] });

  const { data: allWorkersAvail = [] } = useQuery<{
    user: User & { isAvailable?: boolean };
    goals: { weeklyJobGoal: number | null; monthlyJobGoal: number | null } | null;
    thisWeek: number; thisMonth: number; blockedDates: string[];
  }[]>({
    queryKey: ["/api/workers/all-availability"],
    enabled: isAdmin,
  });

  const addDayBlockMutation = useMutation({
    mutationFn: async ({ date, reason }: { date: string; reason: string }) => {
      const res = await apiRequest("POST", "/api/workers/day-blocks", { date, reason });
      return res.json();
    },
    onSuccess: () => { refetchAvailability(); setBlockDate(""); setBlockReason(""); toast({ title: "Day blocked" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeDayBlockMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/workers/day-blocks/${id}`, {});
      return res.json();
    },
    onSuccess: () => { refetchAvailability(); toast({ title: "Day unblocked" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateScheduleMutation = useMutation({
    mutationFn: async (payload: { dayOfWeek: number; startHour: number; endHour: number; isAvailable: boolean }) => {
      const res = await apiRequest("PUT", "/api/workers/schedule", payload);
      return res.json();
    },
    onSuccess: () => refetchAvailability(),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveGoalsMutation = useMutation({
    mutationFn: async (payload: { weeklyJobGoal: number; monthlyJobGoal: number; preferredJobSize: string }) => {
      const res = await apiRequest("PUT", "/api/workers/goals/my", payload);
      return res.json();
    },
    onSuccess: () => { refetchAvailability(); toast({ title: "Goals saved!" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const setAdminGoalsMutation = useMutation({
    mutationFn: async ({ userId, weeklyJobGoal, monthlyJobGoal }: { userId: string; weeklyJobGoal: number; monthlyJobGoal: number }) => {
      const res = await apiRequest("PUT", `/api/workers/${userId}/goals`, { weeklyJobGoal, monthlyJobGoal });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workers/all-availability"] });
      setAdminGoalTarget(null);
      toast({ title: "Goals set!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
      <div>
        <h1 className="text-2xl font-black text-white">My Schedule</h1>
        <p className="text-slate-400 text-sm">Manage availability and goals</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "This Week", val: myAvailability?.stats.thisWeek ?? 0, icon: TrendingUp, color: "text-cyan-400" },
          { label: "This Month", val: myAvailability?.stats.thisMonth ?? 0, icon: Calendar, color: "text-blue-400" },
          { label: "All Time", val: myAvailability?.stats.allTime ?? 0, icon: Trophy, color: "text-yellow-400" },
        ].map(s => (
          <div key={s.label} className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-3 text-center">
            <s.icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
            <p className={`text-lg font-bold ${s.color}`}>{s.val}</p>
            <p className="text-[10px] text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Goal Progress */}
      {myAvailability?.goals && (myAvailability.goals.weeklyJobGoal ?? 0) > 0 && (
        <div className="bg-slate-800/40 border border-cyan-500/20 rounded-xl p-3 space-y-2">
          <p className="text-xs text-cyan-300 font-semibold flex items-center gap-1"><Target className="h-3 w-3" /> Goal Progress</p>
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Weekly: {myAvailability.stats.thisWeek} / {myAvailability.goals.weeklyJobGoal} jobs</span>
              <span>{Math.round((myAvailability.stats.thisWeek / (myAvailability.goals.weeklyJobGoal || 1)) * 100)}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-1.5">
              <div className="bg-cyan-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (myAvailability.stats.thisWeek / (myAvailability.goals.weeklyJobGoal || 1)) * 100)}%` }} />
            </div>
          </div>
          {(myAvailability.goals.monthlyJobGoal ?? 0) > 0 && (
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Monthly: {myAvailability.stats.thisMonth} / {myAvailability.goals.monthlyJobGoal} jobs</span>
                <span>{Math.round((myAvailability.stats.thisMonth / (myAvailability.goals.monthlyJobGoal || 1)) * 100)}%</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (myAvailability.stats.thisMonth / (myAvailability.goals.monthlyJobGoal || 1)) * 100)}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* My Goals */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-white flex items-center gap-2"><Target className="h-4 w-4 text-cyan-400" /> My Job Goals</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-wider">Weekly Goal</label>
            <Input
              type="number" min="0" max="50"
              value={goalWeekly || myAvailability?.goals?.weeklyJobGoal || 0}
              onChange={e => setGoalWeekly(parseInt(e.target.value) || 0)}
              className="mt-1 h-8 text-sm bg-slate-700/50 border-slate-600 text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-wider">Monthly Goal</label>
            <Input
              type="number" min="0" max="200"
              value={goalMonthly || myAvailability?.goals?.monthlyJobGoal || 0}
              onChange={e => setGoalMonthly(parseInt(e.target.value) || 0)}
              className="mt-1 h-8 text-sm bg-slate-700/50 border-slate-600 text-white"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-slate-400 uppercase tracking-wider">Preferred Job Size</label>
          <Select value={goalJobSize || myAvailability?.goals?.preferredJobSize || "any"} onValueChange={setGoalJobSize}>
            <SelectTrigger className="mt-1 h-8 text-sm bg-slate-700/50 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              {["any", "small", "medium", "large"].map(s => (
                <SelectItem key={s} value={s} className="text-white capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm"
          onClick={() => saveGoalsMutation.mutate({
            weeklyJobGoal: goalWeekly || myAvailability?.goals?.weeklyJobGoal || 0,
            monthlyJobGoal: goalMonthly || myAvailability?.goals?.monthlyJobGoal || 0,
            preferredJobSize: goalJobSize || myAvailability?.goals?.preferredJobSize || "any"
          })}
          disabled={saveGoalsMutation.isPending}
          className="w-full bg-cyan-600 hover:bg-cyan-700 text-white h-8 text-sm"
        >
          {saveGoalsMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />} Save Goals
        </Button>
      </div>

      {/* Block a Day Off */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-white flex items-center gap-2"><CalendarDays className="h-4 w-4 text-red-400" /> Block a Day Off</p>
        <div className="flex gap-2">
          <Input
            type="date"
            value={blockDate}
            onChange={e => setBlockDate(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
            className="h-8 text-sm bg-slate-700/50 border-slate-600 text-white flex-1"
          />
          <Input
            value={blockReason}
            onChange={e => setBlockReason(e.target.value)}
            placeholder="Reason (optional)"
            className="h-8 text-sm bg-slate-700/50 border-slate-600 text-white flex-1"
          />
          <Button size="sm"
            onClick={() => blockDate && addDayBlockMutation.mutate({ date: blockDate, reason: blockReason })}
            disabled={!blockDate || addDayBlockMutation.isPending}
            className="h-8 bg-red-700 hover:bg-red-600 text-white shrink-0"
          >
            {addDayBlockMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Block"}
          </Button>
        </div>
        {(myAvailability?.blocks ?? []).length > 0 && (
          <div className="space-y-1.5">
            {myAvailability!.blocks.map(b => (
              <div key={b.id} className="flex items-center justify-between bg-red-950/30 border border-red-800/30 rounded-lg px-3 py-1.5">
                <div>
                  <span className="text-sm text-white font-medium">{b.date}</span>
                  {b.reason && <span className="text-xs text-slate-400 ml-2">— {b.reason}</span>}
                </div>
                <button onClick={() => removeDayBlockMutation.mutate(b.id)} className="text-red-400 hover:text-red-300">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weekly Availability */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-white flex items-center gap-2"><Clock className="h-4 w-4 text-blue-400" /> Weekly Availability</p>
        <p className="text-xs text-slate-500">Set your available hours for each day.</p>
        <div className="space-y-2">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day, dow) => {
            const existing = (myAvailability?.schedule ?? []).find(s => s.dayOfWeek === dow);
            const avail = existing?.isAvailable ?? true;
            return (
              <div key={dow} className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${avail ? "border-slate-700/40 bg-slate-800/30" : "border-slate-800/30 bg-slate-900/50 opacity-50"}`}>
                <button
                  onClick={() => updateScheduleMutation.mutate({ dayOfWeek: dow, startHour: existing?.startHour ?? 8, endHour: existing?.endHour ?? 17, isAvailable: !avail })}
                  className={`w-8 h-5 rounded-full transition-colors shrink-0 ${avail ? "bg-cyan-600" : "bg-slate-600"}`}
                >
                  <div className={`w-3.5 h-3.5 bg-white rounded-full mx-auto transition-transform ${avail ? "translate-x-1.5" : "-translate-x-1.5"}`} />
                </button>
                <span className="text-xs font-medium text-slate-300 w-7">{day}</span>
                {avail && (
                  <>
                    <select
                      value={existing?.startHour ?? 8}
                      onChange={e => updateScheduleMutation.mutate({ dayOfWeek: dow, startHour: parseInt(e.target.value), endHour: existing?.endHour ?? 17, isAvailable: true })}
                      className="text-xs bg-slate-700 border-0 text-white rounded px-1 py-0.5 flex-1"
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h-12}pm`}</option>
                      ))}
                    </select>
                    <span className="text-slate-500 text-xs">to</span>
                    <select
                      value={existing?.endHour ?? 17}
                      onChange={e => updateScheduleMutation.mutate({ dayOfWeek: dow, startHour: existing?.startHour ?? 8, endHour: parseInt(e.target.value), isAvailable: true })}
                      className="text-xs bg-slate-700 border-0 text-white rounded px-1 py-0.5 flex-1"
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h-12}pm`}</option>
                      ))}
                    </select>
                  </>
                )}
                {!avail && <span className="text-xs text-slate-500 ml-1">Off</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Admin: all workers */}
      {isAdmin && allWorkersAvail.length > 0 && (
        <div className="bg-slate-800/40 border border-purple-500/20 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-white flex items-center gap-2"><Users className="h-4 w-4 text-purple-400" /> Crew Availability Overview</p>
          {adminGoalTarget && (
            <div className="flex gap-2 items-end bg-slate-700/40 rounded-xl p-3">
              <div className="flex-1">
                <label className="text-[10px] text-slate-400 uppercase">Weekly Goal</label>
                <Input type="number" value={adminGoalWeekly} onChange={e => setAdminGoalWeekly(parseInt(e.target.value) || 0)} className="h-7 text-xs bg-slate-700/50 border-slate-600 text-white mt-0.5" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-slate-400 uppercase">Monthly Goal</label>
                <Input type="number" value={adminGoalMonthly} onChange={e => setAdminGoalMonthly(parseInt(e.target.value) || 0)} className="h-7 text-xs bg-slate-700/50 border-slate-600 text-white mt-0.5" />
              </div>
              <Button size="sm" onClick={() => setAdminGoalsMutation.mutate({ userId: adminGoalTarget, weeklyJobGoal: adminGoalWeekly, monthlyJobGoal: adminGoalMonthly })} disabled={setAdminGoalsMutation.isPending} className="h-7 bg-purple-600 text-white text-xs">Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setAdminGoalTarget(null)} className="h-7 text-slate-400"><X className="h-3.5 w-3.5" /></Button>
            </div>
          )}
          <div className="space-y-2">
            {allWorkersAvail.map(w => {
              const todayStr = new Date().toISOString().split("T")[0];
              const isBlocked = w.blockedDates.includes(todayStr);
              return (
                <div key={w.user.id} className={`rounded-lg border p-3 ${isBlocked ? "border-red-800/30 bg-red-950/20" : "border-slate-700/30 bg-slate-800/20"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${w.user.isAvailable && !isBlocked ? "bg-green-400" : "bg-red-400"}`} />
                      <span className="text-sm font-medium text-white">{w.user.firstName} {w.user.lastName || ""}</span>
                      {isBlocked && <Badge className="bg-red-900/50 text-red-300 border-red-700/30 text-[10px]">Day Off</Badge>}
                    </div>
                    <button onClick={() => { setAdminGoalTarget(w.user.id); setAdminGoalWeekly(w.goals?.weeklyJobGoal || 0); setAdminGoalMonthly(w.goals?.monthlyJobGoal || 0); }} className="text-slate-400 hover:text-white">
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                    <span>Week: <strong className="text-cyan-300">{w.thisWeek}</strong>{(w.goals?.weeklyJobGoal ?? 0) > 0 ? ` / ${w.goals?.weeklyJobGoal}` : ""} jobs</span>
                    <span>Month: <strong className="text-blue-300">{w.thisMonth}</strong>{(w.goals?.monthlyJobGoal ?? 0) > 0 ? ` / ${w.goals?.monthlyJobGoal}` : ""} jobs</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="h-2" />
    </div>
  );
}
