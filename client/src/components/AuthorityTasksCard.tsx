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
  minTier: "bronze" | "silver" | "gold" | "platinum";
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
  quoteChoices?: QuoteConsensusChoice[];
  quoteConsensus?: QuoteConsensus;
  myQuoteChoice?: string | null;
  playbook?: AuthorityPlaybookTask;
};

type AuthorityOption = {
  key: string;
  label: string;
  href: string;
  description: string;
};

type AuthorityStage = {
  taskKey: AuthorityTask["taskKey"];
  title: string;
  minTier: AuthorityTask["minTier"];
  bonusTokens: number;
  instructions: string;
  playbook?: AuthorityPlaybookTask;
};

type AuthorityPlaybookTask = {
  id: string;
  phase: "start" | "progress" | "finish";
  rail: "customer" | "bronze" | "silver" | "gold" | "platinum";
  side: "customer" | "worker" | "company";
  action: string;
  proof: string;
  customerImpact: string;
  companyGuardrail: string;
  sourcePatterns: string;
};

type QuoteConsensusChoice = {
  key: string;
  label: string;
  description: string;
  basePrice: number | null;
  totalPrice: number | null;
  crewSize: number | null;
  hours: number | null;
  autoApplies: boolean;
};

type QuoteConsensus = {
  byChoice?: Array<{ choiceKey: string; choiceLabel: string; votes: number }>;
  totalVotes?: number;
  topChoiceKey?: string | null;
  topChoiceLabel?: string | null;
  topVotes?: number;
  softApproved?: boolean;
  autoApproved?: boolean;
};

type AuthorityTasksResponse = {
  authority: {
    tier: string;
    rank?: number;
    canBuildQuote: boolean;
    canApproveQuote: boolean;
    canManageOps: boolean;
  };
  stages?: AuthorityStage[];
  progress?: {
    openTasks: number;
    readyTasks: number;
    waitingTasks: number;
    todayBonusCount: number;
    todayBonusTokens: number;
    marketingPostsToday: number;
    quoteSamplesToday: number;
    quoteActionsToday: number;
    opsActionsToday: number;
    nextAction: string;
  };
  options: AuthorityOption[];
  tasks: AuthorityTask[];
};

const localTierRank: Record<string, number> = {
  worker: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

const tierStyles: Record<AuthorityTask["minTier"], string> = {
  bronze: "border-orange-400/30 bg-orange-400/10 text-orange-200",
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

function formatTokens(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";
  return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function AuthorityTasksCard({ className = "" }: { className?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<AuthorityTasksResponse>({
    queryKey: ["/api/ops-tasks"],
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const defaultTab = useMemo(() => {
    if (typeof window === "undefined") return "tasks";
    const tab = new URLSearchParams(window.location.search).get("tab");
    return tab === "options" || tab === "tasks" ? tab : "tasks";
  }, []);

  const tasks = useMemo(() => {
    const list = data?.tasks || [];
    return [...list].sort((a, b) => Number(a.completed) - Number(b.completed));
  }, [data?.tasks]);
  const stageByKey = useMemo(() => {
    return new Map((data?.stages || []).map((stage) => [stage.taskKey, stage]));
  }, [data?.stages]);
  const openCount = tasks.filter((task) => !task.completed).length;
  const openTasks = tasks.filter((task) => !task.completed).slice(0, 6);
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

  const voteMutation = useMutation({
    mutationFn: async ({ task, choiceKey }: { task: AuthorityTask; choiceKey: string }) => {
      const res = await apiRequest("POST", `/api/workers/quote-consensus/leads/${task.leadId}/vote`, { choiceKey });
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/history"] });
      toast({
        title: result.applied ? "Quote consensus applied" : "Quote pick saved",
        description: result.consensus?.autoApproved
          ? "3 matching picks moved the card forward."
          : result.consensus?.softApproved
            ? "2 matching picks created a strong recommendation."
            : "Waiting for matching marketer picks.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Quote pick not saved", description: error.message, variant: "destructive" });
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
  if (!authority || authority.tier === "worker") return null;

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
            {openCount} open
          </Badge>
        </div>

        <RailSplitSummary authority={authority} stageByKey={stageByKey} />
        {data?.progress && <AuthorityProgressStrip progress={data.progress} />}

        <Tabs defaultValue={defaultTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-2 border border-slate-800 bg-slate-950/60">
            <TabsTrigger value="tasks" className="text-xs">Tasks</TabsTrigger>
            <TabsTrigger value="options" className="text-xs">Options</TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="mt-3 space-y-2">
            {openTasks.length === 0 ? (
              <SimpleEmpty label="No authority tasks ready." />
            ) : (
              openTasks.map((task) => (
                <TaskRow key={task.id} task={task} completeMutation={completeMutation} voteMutation={voteMutation} />
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

function AuthorityProgressStrip({ progress }: { progress: NonNullable<AuthorityTasksResponse["progress"]> }) {
  const cells = [
    {
      label: "Today",
      value: `${formatTokens(progress.todayBonusTokens)} JCMOVES`,
      detail: `${progress.todayBonusCount} bonus${progress.todayBonusCount === 1 ? "" : "es"}`,
    },
    {
      label: "Ready",
      value: String(progress.readyTasks),
      detail: `${progress.waitingTasks} waiting`,
    },
    {
      label: "Next",
      value: progress.nextAction,
      detail: `${progress.openTasks} open`,
    },
  ];

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-md border border-slate-800 bg-slate-950/55 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{cell.label}</p>
          <p className="mt-1 truncate text-sm font-black text-white">{cell.value}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">{cell.detail}</p>
        </div>
      ))}
    </div>
  );
}

function RailSplitSummary({
  authority,
  stageByKey,
}: {
  authority: AuthorityTasksResponse["authority"];
  stageByKey: Map<string, AuthorityStage>;
}) {
  const rank = authority.rank ?? localTierRank[String(authority.tier || "worker").toLowerCase()] ?? 0;
  const quoteBuild = stageByKey.get("quote_build");
  const quoteApprove = stageByKey.get("quote_approve");
  const dispatchReady = stageByKey.get("dispatch_ready");
  const payoutReview = stageByKey.get("payout_review");
  const quoteBonus = [quoteBuild?.bonusTokens, quoteApprove?.bonusTokens].filter(Boolean).join(" / ");
  const opsBonus = [dispatchReady?.bonusTokens, payoutReview?.bonusTokens].filter(Boolean).join(" / ");
  const steps = [
    {
      number: "1",
      label: "Lead",
      rail: "Bronze+",
      detail: "Add request card",
      unlocked: rank >= localTierRank.bronze,
      bonus: "lead credit",
    },
    {
      number: "2",
      label: "Quote",
      rail: "Silver / Gold",
      detail: "Build, then approve",
      unlocked: authority.canBuildQuote || authority.canApproveQuote,
      bonus: quoteBonus ? `${quoteBonus} JCMOVES` : "task bonus",
    },
    {
      number: "3",
      label: "Dispatch + Pay",
      rail: "Platinum",
      detail: "Crew, calendar, payout",
      unlocked: authority.canManageOps,
      bonus: opsBonus ? `${opsBonus} JCMOVES` : "task bonus",
    },
  ];

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      {steps.map((step) => (
        <div
          key={step.number}
          className={`rounded-md border px-3 py-2 ${
            step.unlocked
              ? "border-blue-400/30 bg-blue-500/10"
              : "border-slate-800 bg-slate-950/50"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
              step.unlocked ? "bg-blue-500 text-white" : "bg-slate-800 text-slate-500"
            }`}>
              {step.number}
            </span>
            <span className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {step.rail}
            </span>
          </div>
          <p className="mt-2 text-sm font-black text-white">{step.label}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">{step.detail}</p>
          <p className="mt-2 truncate text-[10px] font-bold uppercase text-orange-300">{step.bonus}</p>
        </div>
      ))}
    </div>
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
  voteMutation,
}: {
  task: AuthorityTask;
  completeMutation: UseMutationResult<any, Error, AuthorityTask, unknown>;
  voteMutation: UseMutationResult<any, Error, { task: AuthorityTask; choiceKey: string }, unknown>;
}) {
  const isQuoteSample = task.taskKey === "quote_sample" && Array.isArray(task.quoteChoices) && task.quoteChoices.length > 0;
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

      {isQuoteSample ? (
        <QuoteChoicePanel task={task} voteMutation={voteMutation} />
      ) : (
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
      )}
      {task.playbook && <TaskPlaybookSignal playbook={task.playbook} />}
    </div>
  );
}

function TaskPlaybookSignal({ playbook }: { playbook: AuthorityPlaybookTask }) {
  return (
    <div className="mt-3 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-slate-700 bg-slate-950/70 px-2 py-0.5 text-[10px] font-black uppercase text-blue-200">
          {playbook.phase}
        </span>
        <span className="rounded-full border border-slate-700 bg-slate-950/70 px-2 py-0.5 text-[10px] font-black uppercase text-slate-300">
          {playbook.sourcePatterns}
        </span>
      </div>
      <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-200">
        {playbook.customerImpact}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        Guardrail: {playbook.companyGuardrail}
      </p>
    </div>
  );
}

function QuoteChoicePanel({
  task,
  voteMutation,
}: {
  task: AuthorityTask;
  voteMutation: UseMutationResult<any, Error, { task: AuthorityTask; choiceKey: string }, unknown>;
}) {
  const consensus = task.quoteConsensus || {};
  const byChoice = consensus.byChoice || [];
  const choices = task.quoteChoices || [];
  const statusText = consensus.autoApproved
    ? "3-match approved"
    : consensus.softApproved
      ? "2-match ready"
      : `${consensus.totalVotes || 0} pick${consensus.totalVotes === 1 ? "" : "s"}`;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2">
        <p className="text-xs font-bold text-slate-300">{statusText}</p>
        <a
          href={task.actionUrl}
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-300 hover:text-blue-200"
        >
          Open
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="grid gap-2">
        {choices.map((choice) => {
          const count = byChoice.find((item) => item.choiceKey === choice.key)?.votes || 0;
          const selected = task.myQuoteChoice === choice.key;
          const top = consensus.topChoiceKey === choice.key && count > 0;
          const price = choice.totalPrice != null ? `$${Number(choice.totalPrice).toFixed(0)}` : "review";
          return (
            <button
              key={choice.key}
              type="button"
              disabled={voteMutation.isPending}
              onClick={() => voteMutation.mutate({ task, choiceKey: choice.key })}
              className={`rounded-md border px-3 py-2 text-left transition-colors ${
                selected
                  ? "border-blue-400/60 bg-blue-500/15"
                  : top
                    ? "border-emerald-400/50 bg-emerald-500/10"
                    : "border-slate-800 bg-slate-950/60 hover:border-blue-500/40 hover:bg-blue-500/10"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-white">{choice.label}</span>
                <span className="shrink-0 rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-black uppercase text-slate-300">
                  {price}
                </span>
              </span>
              <span className="mt-1 flex items-center justify-between gap-2">
                <span className="line-clamp-1 text-xs text-slate-500">{choice.description}</span>
                <span className="shrink-0 text-[10px] font-bold uppercase text-orange-300">
                  {count} match{count === 1 ? "" : "es"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
