// Task #173 — shared crew incentive bonus calc. Both the server (to
// stamp the bonus onto /api/leads/job-board responses) and the client
// (to render it on the Job Board card before the crew signs up) import
// from here so the numbers stay in lock-step.
//
// The bonus is layered on top of the normal base payout (500 JCMOVES
// flat + 25/hr). Each signal independently adds a fixed USD bonus and
// is surfaced to the crew so they know *why* it's bigger. Values are
// intentionally simple first-order heuristics — a later pass will tie
// them to real surge data in pricing/revenue.step.

export interface CrewBonusInput {
  urgency?: string | null;
  moveDate?: string | null;
  confirmedDate?: string | null;
  arrivalWindow?: string | null;
  crewSize?: number | null;
  crewSlotsFilled?: number | null;
  totalPrice?: number | string | null;
  serviceType?: string | null;
}

export interface CrewBonus {
  amount: number;          // USD bonus amount
  reasons: string[];       // short human-readable labels, shown as badges
}

const LATE_HOUR_BONUS = 15;
const HIGH_URGENCY_BONUS = 20;
const LOW_AVAILABILITY_BONUS = 25;
const LARGE_MOVE_BONUS = 20; // totalPrice ≥ $800

function isLateHour(arrivalWindow?: string | null, moveDate?: string | null): boolean {
  // arrivalWindow looks like "6:00 PM – 8:00 PM" → late if start hour ≥ 17
  if (arrivalWindow) {
    const m = arrivalWindow.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (m) {
      let h = parseInt(m[1], 10);
      const ampm = m[3].toUpperCase();
      if (ampm === "PM" && h < 12) h += 12;
      if (ampm === "AM" && h === 12) h = 0;
      if (h >= 17 || h <= 6) return true;
    }
  }
  // Evening same-day fallback: if moveDate is today and it's already past 4pm local
  if (moveDate) {
    try {
      const d = new Date(moveDate);
      const now = new Date();
      if (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate() &&
        now.getHours() >= 16
      ) return true;
    } catch { /* noop */ }
  }
  return false;
}

export function calcCrewBonus(input: CrewBonusInput): CrewBonus {
  const reasons: string[] = [];
  let amount = 0;

  if (input.urgency === "high") {
    amount += HIGH_URGENCY_BONUS;
    reasons.push(`+$${HIGH_URGENCY_BONUS} urgent`);
  }

  const crewSize = input.crewSize ?? 2;
  const filled = input.crewSlotsFilled ?? 0;
  const openSlots = Math.max(0, crewSize - filled);
  if (crewSize >= 2 && openSlots >= 2 && filled === 0) {
    amount += LOW_AVAILABILITY_BONUS;
    reasons.push(`+$${LOW_AVAILABILITY_BONUS} hard-to-fill`);
  }

  if (isLateHour(input.arrivalWindow, input.confirmedDate || input.moveDate)) {
    amount += LATE_HOUR_BONUS;
    reasons.push(`+$${LATE_HOUR_BONUS} late hour`);
  }

  const price = typeof input.totalPrice === "string" ? parseFloat(input.totalPrice) : (input.totalPrice ?? 0);
  if (price >= 800) {
    amount += LARGE_MOVE_BONUS;
    reasons.push(`+$${LARGE_MOVE_BONUS} large job`);
  }

  return { amount, reasons };
}
