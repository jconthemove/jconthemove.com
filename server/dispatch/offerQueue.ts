// Task #172 — Uber-style single-offer queue. Sends one offer at a time
// with a 20s TTL; on accept the queue closes; on decline/timeout we
// roll to the next-best candidate. The timer is in-memory but the
// source of truth (dispatch_state, dispatch_offered_to, expires_at) is
// in Postgres so a server restart sweep can recover orphaned offers.

import { randomUUID } from "crypto";
import { pool } from "../db";
import { acquireLock, releaseLock } from "./locks";
import { sendOffer } from "./notify";
import { rankCandidates } from "./engine";
import { logDispatchEvent, recheckKillSwitch, loadJob, persistState } from "./store";
import { OFFER_TTL_MS, OFFER_LOCK_TTL_MS, type DispatchCandidate } from "./types";

// In-memory timers + lock ownership keyed by jobId so a subsequent
// dispatch call, an accept, a decline, or an admin override can cancel
// the pending timer AND release the lock. Storing the offerId alongside
// the timer closes the "decline-then-advance stalls because lock is
// still held" bug: cancelOfferTimer() now fully tears down the state.
type OfferHandle = { timer: NodeJS.Timeout; offerId: string };
const offers = new Map<string, OfferHandle>();

export async function startOfferLoop(jobId: string): Promise<void> {
  // Kill switch
  if (!(await recheckKillSwitch())) {
    await logDispatchEvent(jobId, "skipped", null, null, "pending", "pending", "kill switch off");
    return;
  }

  const job = await loadJob(jobId);
  if (!job) {
    await logDispatchEvent(jobId, "failed", null, null, null, "failed", "job not found");
    return;
  }
  if (job.dispatchState === "assigned" || job.dispatchState === "en_route" ||
      job.dispatchState === "on_site" || job.dispatchState === "completed") {
    return; // nothing to do
  }
  if (["in_progress", "completed", "cancelled"].includes(job.status)) {
    return;
  }

  const triedIds = Array.from(
    new Set([
      ...(job.dispatchTriedIds ?? []),
      ...(job.crewMembers ?? []),
    ]),
  );

  const ranked = await rankCandidates(
    {
      id: job.id,
      serviceType: job.serviceType,
      lat: job.lat,
      lng: job.lng,
      urgency: job.urgency,
      totalPrice: job.totalPrice,
    },
    triedIds,
  );

  if (ranked.length === 0) {
    await persistState(jobId, { dispatchState: "failed", dispatchOfferedTo: null, dispatchOfferExpiresAt: null });
    await logDispatchEvent(jobId, "exhausted", null, null, job.dispatchState, "failed", "no eligible crew");
    return;
  }

  const top = ranked[0];
  const offerId = randomUUID();
  const acquired = acquireLock(`job:${jobId}`, offerId, OFFER_LOCK_TTL_MS);
  if (!acquired) {
    // Someone else is actively offering; bail.
    return;
  }

  const expiresAt = new Date(Date.now() + OFFER_TTL_MS);
  await persistState(jobId, {
    dispatchState: "offering",
    dispatchOfferedTo: top.crewId,
    dispatchOfferExpiresAt: expiresAt,
    dispatchTriedIds: [...triedIds, top.crewId],
  });

  await logDispatchEvent(jobId, "offer_sent", top.crewId, null, job.dispatchState, "offering",
    `score=${top.score} reasons=${top.reasons.join(",")}`);

  await sendOffer({
    crewId: top.crewId,
    leadId: jobId,
    customerName: job.customerName,
    serviceType: job.serviceType,
    distanceMi: top.distanceMi,
    totalPrice: job.totalPrice,
    ttlSec: Math.round(OFFER_TTL_MS / 1000),
  });

  // Schedule timeout.
  const prev = offers.get(jobId);
  if (prev) {
    clearTimeout(prev.timer);
    releaseLock(`job:${jobId}`, prev.offerId);
  }
  const t = setTimeout(() => {
    void onOfferTimeout(jobId, offerId, top);
  }, OFFER_TTL_MS);
  offers.set(jobId, { timer: t, offerId });
}

async function onOfferTimeout(jobId: string, offerId: string, candidate: DispatchCandidate): Promise<void> {
  offers.delete(jobId);
  // Re-read state: if the crew accepted in the last ms, do nothing.
  const fresh = await loadJob(jobId);
  if (!fresh) {
    releaseLock(`job:${jobId}`, offerId);
    return;
  }
  if (fresh.dispatchState !== "offering" || fresh.dispatchOfferedTo !== candidate.crewId) {
    releaseLock(`job:${jobId}`, offerId);
    return;
  }

  await logDispatchEvent(jobId, "offer_expired", candidate.crewId, null, "offering", "pending",
    "no response in TTL");
  releaseLock(`job:${jobId}`, offerId);
  // Roll to next candidate.
  await persistState(jobId, {
    dispatchState: "pending",
    dispatchOfferedTo: null,
    dispatchOfferExpiresAt: null,
  });
  await startOfferLoop(jobId);
}

// Public: called from the crew accept/decline and admin override paths
// after their DB transaction has settled. Cancels the pending timer
// AND releases the in-memory lock so the next offer can start
// immediately (critical for decline → roll-forward flow).
export function cancelOfferTimer(jobId: string): void {
  const h = offers.get(jobId);
  if (h) {
    clearTimeout(h.timer);
    releaseLock(`job:${jobId}`, h.offerId);
    offers.delete(jobId);
  }
}

// Boot sweep: clear stale offers that outlived the process.
export async function sweepStaleOffers(): Promise<number> {
  const { rows } = await pool.query(
    `UPDATE leads
        SET dispatch_state = 'pending',
            dispatch_offered_to = NULL,
            dispatch_offer_expires_at = NULL
      WHERE dispatch_state = 'offering'
        AND (dispatch_offer_expires_at IS NULL OR dispatch_offer_expires_at <= now())
      RETURNING id`,
  );
  return rows.length;
}
