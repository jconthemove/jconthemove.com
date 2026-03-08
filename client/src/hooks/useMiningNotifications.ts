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

  const { data: miningStatus } = useQuery<MiningStatus>({
    queryKey: ["/api/mining/status"],
    enabled: !!user,
    refetchInterval: 60_000, // poll every 60 seconds
    staleTime: 55_000,
  });

  useEffect(() => {
    if (!user) return;
    if (!miningStatus) return;
    if (Notification.permission !== "granted") return;

    const { canClaim, accumulatedTokens, isActive } = miningStatus;
    const now = Date.now();

    // Notify when mining becomes claimable (edge: false → true)
    if (canClaim && !wasClaimable.current && isActive) {
      const cooldownKey = "mining-ready";
      const lastFired = notificationCooldown.current.get(cooldownKey) || 0;
      // Respect 30-minute cooldown so we don't spam on every poll
      if (now - lastFired > 30 * 60 * 1000) {
        notificationService.notifyCanClaim(Math.round(accumulatedTokens));
        notificationCooldown.current.set(cooldownKey, now);
      }
    }
    wasClaimable.current = canClaim;
  }, [miningStatus, user]);

  // Also listen for reward history changes and notify on new rewards
  const { data: rewardHistory } = useQuery<Array<{ id: number; rewardType: string; tokenAmount: string; createdAt: string }>>({
    queryKey: ["/api/rewards/history"],
    enabled: !!user,
    refetchInterval: 90_000,
    staleTime: 85_000,
  });

  useEffect(() => {
    if (!user) return;
    if (!rewardHistory || rewardHistory.length === 0) return;
    if (Notification.permission !== "granted") return;

    const now = Date.now();

    for (const reward of rewardHistory.slice(0, 5)) {
      const rewardKey = String(reward.id);
      if (lastNotifiedRewards.current.has(rewardKey)) continue;

      // Only notify for rewards created in the last 5 minutes that we haven't seen
      const createdAt = new Date(reward.createdAt).getTime();
      if (now - createdAt > 5 * 60 * 1000) {
        // Mark as seen even if old — we don't want to notify for historical items on first load
        lastNotifiedRewards.current.add(rewardKey);
        continue;
      }

      // Don't fire for mining_claim — the claim endpoint already handles that
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
  }, [rewardHistory, user]);
}
