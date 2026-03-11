import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { notificationService } from "@/lib/notifications";
import { useAuth } from "@/hooks/useAuth";

interface MiningStatus {
  isActive: boolean;
  accumulatedTokens: number;
  canClaim: boolean;
  nextClaimAt?: string;
  sessionStreak?: number;
  tokenBalance?: number;
}

interface RewardItem {
  id: number;
  rewardType: string;
  tokenAmount: string;
  createdAt: string;
}

interface RewardHistoryResponse {
  rewards: RewardItem[];
  total: number;
  totalTokensEarned: string;
}

/**
 * Background hook that polls mining status and fires local push notifications when:
 * 1. Mining tokens become claimable (canClaim flips true)
 * 2. A mining session completes its 24-hour cycle
 */
export function useMiningNotifications() {
  const { user } = useAuth();
  const wasClaimable = useRef<boolean>(false);
  const lastNotifiedRewards = useRef<Set<string>>(new Set());
  const notificationCooldown = useRef<Map<string, number>>(new Map());
  // Only fire notifications for rewards that arrive AFTER this hook mounted (not stale history on login)
  const sessionStartTime = useRef<number>(Date.now());

  const { data: miningStatus } = useQuery<MiningStatus>({
    queryKey: ["/api/mining/status"],
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  useEffect(() => {
    if (!user) return;
    if (!miningStatus) return;
    if (typeof Notification === 'undefined' || Notification.permission !== "granted") return;

    const { canClaim, accumulatedTokens, isActive } = miningStatus;
    const now = Date.now();

    if (canClaim && !wasClaimable.current && isActive) {
      const cooldownKey = "mining-ready";
      const lastFired = notificationCooldown.current.get(cooldownKey) || 0;
      if (now - lastFired > 30 * 60 * 1000) {
        notificationService.notifyCanClaim(Math.round(accumulatedTokens));
        notificationCooldown.current.set(cooldownKey, now);
      }
    }
    wasClaimable.current = canClaim;
  }, [miningStatus, user]);

  const { data: rewardHistoryData } = useQuery<RewardHistoryResponse>({
    queryKey: ["/api/rewards/history"],
    enabled: !!user,
    refetchInterval: 90_000,
    staleTime: 85_000,
  });

  useEffect(() => {
    if (!user) return;
    if (typeof Notification === 'undefined' || Notification.permission !== "granted") return;

    const rewardHistory: RewardItem[] = Array.isArray(rewardHistoryData)
      ? rewardHistoryData
      : (rewardHistoryData?.rewards ?? []);

    if (rewardHistory.length === 0) return;

    const now = Date.now();

    for (const reward of rewardHistory.slice(0, 5)) {
      const rewardKey = String(reward.id);
      if (lastNotifiedRewards.current.has(rewardKey)) continue;

      const createdAt = new Date(reward.createdAt).getTime();
      // Skip rewards that existed before this session started (prevents stale login notifications)
      if (createdAt < sessionStartTime.current) {
        lastNotifiedRewards.current.add(rewardKey);
        continue;
      }
      // Also skip if reward is older than 5 minutes from now
      if (now - createdAt > 5 * 60 * 1000) {
        lastNotifiedRewards.current.add(rewardKey);
        continue;
      }

      if (reward.rewardType === "mining_claim") {
        lastNotifiedRewards.current.add(rewardKey);
        continue;
      }

      const cooldownKey = `reward-${reward.rewardType}`;
      const lastFired = notificationCooldown.current.get(cooldownKey) || 0;
      if (now - lastFired > 5 * 60 * 1000) {
        const amount = Math.round(parseFloat(reward.tokenAmount));
        if (amount > 0) {
          notificationService.notifyNewReward(
            reward.rewardType.replace(/_/g, " "),
            amount
          );
          notificationCooldown.current.set(cooldownKey, now);
        }
      }

      lastNotifiedRewards.current.add(rewardKey);
    }
  }, [rewardHistoryData, user]);
}
