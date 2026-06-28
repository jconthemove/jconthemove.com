import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { CheckCircle2, Coins, ExternalLink, Loader2, Lock, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type AuthorityTask = {
  id: string;
  taskKey: string;
  title: string;
  instructions: string;
  minTier: "silver" | "gold" | "platinum";
  bonusTokens: number;
  leadId: string;
  orderNumber?: string | number | null;
  customerName: string;
  serviceType: string;
  status: string;
  date?: string | null;
  price?: string | null;
  completed: boolean;
  canComplete: boolean;
  completionReason: string;
  actionUrl: string;
};

type AuthorityOption = {
  key: string;
  label: string;
  href: string;
  description: string;
};

type AuthorityTasksResponse = {
  authority: {
    tier: string;
    canBuildQuote: boolean;
    canApproveQuote: boolean;
    canManageOps: boolean;
  };
  options: AuthorityOption[];
  tasks: AuthorityTask[];
};

const tierStyles: Record<AuthorityTask["minTier"], string> = {
  silver: "border-slate-400/30 bg-slate-400/10 text-slate-200",
  gold: "border-yellow-400/30 bg-yellow-400/10 text-yellow-200",
  platinum: "border-purple-400/30 bg-purple-400/10 text-purple-200",
};

function formatDate(date: string | null | undefined) {
  if (!date) return "TBD";
  try {
    const value = new Date(date.includes("T") ? date : `${date}T12:00:00`);
    return value.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return date;
  }
}

function formatPrice(price: string | null | undefined) {
  const amount = Number(price || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "No price";
  return `$${amount.toFixed(0)}`;
}

export default function AuthorityTasksCard({ className = "" }: { className?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<AuthorityTasksResponse>({
    queryKey: ["/api/ops-tasks"],
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const tasks = useMemo(() => {
    const list = data?.tasks || [];
    return [...list].sort((a, b) => Number(a.completed) - Number(b.completed)).slice(0, 6);
  }, [data?.tasks]);
  const openTasks = tasks.filter((task) => !task.completed);
  const doneTasks = tasks.filter((task) => task.completed);
  const options = data?.options || [];

  const completeMutation = useMutation({
    mutationFn: async (task: AuthorityTask) => {
      const res = await apiRequest("POST", `/api/ops-tasks/${task.taskKey}/complete`, { leadId: task.leadId });
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/history"] });
      toast({
        title: result.awarded ? "Task bonus issued" : "Task already complete",
        description: result.awarded
          ? `${Number(result.bonusTokens || 0).toLocaleString()} JCMOVES added.`
          : result.reason || "This task was already recorded.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Task not ready", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <Card className={`border-slate-800 bg-slate-900/60 ${className}`}>
        <CardContent className="flex items-center gap-3 p-4 text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
          Loading authority tasks
        </CardContent>
      </Card>
    );
  }

  const authority = data?.authority;
  if (!authority || authority.tier === "worker" || authority.tier === "bronze") return null;

  return (
    <Card className={`border-blue-500/25 bg-slate-900/70 ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-300" />
              <h2 className="text-sm font-black text-white">Authority Tasks</h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {authority.tier.toUpperCase()} rail: verified ops work earns task bonuses.
            </p>
          </div>
          <Badge className="border border-blue-400/30 bg-blue-500/10 text-blue-200">
            {openTasks.length} open
          </Badge>
        </div>

        <Tabs defaultValue="tasks" className="mt-4">
          <TabsList className="grid w-full grid-cols-3 border border-slate-800 bg-slate-950/60">
            <TabsTrigger value="tasks" className="text-xs">Tasks</TabsTrigger>
            <TabsTrigger value="done" className="text-xs">Done</TabsTrigger>
            <TabsTrigger value="options" className="text-xs">Options</TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="mt-3 space-y-2">
            {openTasks.length === 0 ? (
              <SimpleEmpty label="No authority tasks ready." />
            ) : (
              openTasks.map((task) => (
                <TaskRow key={task.id} task={task} completeMutation={completeMutation} />
              ))
            )}
          </TabsContent>

          <TabsContent value="done" className="mt-3 space-y-2">
            {doneTasks.length === 0 ? (
              <SimpleEmpty label="No task bonuses claimed yet." />
            ) : (
              doneTasks.map((task) => (
                <TaskRow key={task.id} task={task} completeMutation={completeMutation} />
              ))
            )}
          </TabsContent>

          <TabsContent value="options" className="mt-3">
            {options.length === 0 ? (
              <SimpleEmpty label="No options ready." />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {options.map((option) => (
                  <OptionButton key={option.key} option={option} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function SimpleEmpty({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-400">
      {label}
    </div>
  );
}

function OptionButton({ option }: { option: AuthorityOption }) {
  return (
    <a
      href={option.href}
      className="flex min-h-[54px] items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2 text-left hover:border-blue-500/40 hover:bg-blue-500/10"
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-blue-300" />
          {option.label}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">{option.description}</span>
      </span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-500" />
    </a>
  );
}

function TaskRow({
  task,
  completeMutation,
}: {
  task: AuthorityTask;
  completeMutation: UseMutationResult<any, Error, AuthorityTask, unknown>;
}) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold text-white">{task.title}</p>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${tierStyles[task.minTier]}`}>
              {task.minTier}
            </span>
            {task.completed && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                paid
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-slate-300">
            {task.customerName} - {formatDate(task.date)} - {formatPrice(task.price)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-orange-300">
          <Coins className="h-3.5 w-3.5" />
          <span className="text-xs font-black">{task.bonusTokens}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          href={task.actionUrl}
          className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-slate-200 hover:bg-slate-800"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </a>
        <Button
          size="sm"
          disabled={!task.canComplete || task.completed || completeMutation.isPending}
          onClick={() => completeMutation.mutate(task)}
          className="min-h-[38px] bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500"
          title={task.canComplete ? "Complete verified task" : task.completionReason}
        >
          {completeMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : task.canComplete ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Complete
            </>
          ) : (
            <>
              <Lock className="h-3.5 w-3.5 mr-1" />
              Waiting
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
