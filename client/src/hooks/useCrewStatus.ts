import { useQuery } from "@tanstack/react-query";

export interface CrewStatus {
  count: number;
  tier: "high" | "medium" | "limited";
  tierLabel: string;
  tierEmoji: string;
}

function getTier(count: number): Omit<CrewStatus, "count"> {
  if (count >= 5) return { tier: "high", tierLabel: "High", tierEmoji: "🔥" };
  if (count >= 3) return { tier: "medium", tierLabel: "Medium", tierEmoji: "⚡" };
  return { tier: "limited", tierLabel: "Limited", tierEmoji: "⏳" };
}

export function useCrewStatus(pollIntervalMs = 5000): { data: CrewStatus | null; isLoading: boolean } {
  const { data, isLoading } = useQuery<{ count: number }>({
    queryKey: ["/api/crew/online"],
    refetchInterval: pollIntervalMs,
    staleTime: pollIntervalMs,
  });

  if (!data) return { data: null, isLoading };

  const count = typeof data.count === "number" ? data.count : 0;
  return {
    data: { count, ...getTier(count) },
    isLoading,
  };
}
