/**
 * Date utilities using Eastern time (UTC-5) as the canonical "today".
 *
 * The server runs in UTC. US-based users doing tasks in the evening
 * (e.g. 9 PM Eastern = 2 AM UTC next day) would have their work recorded
 * as the NEXT UTC date, causing tasks to look "already done" the next morning.
 *
 * Fixing all daily-task comparisons to Eastern time (UTC-5, ~US Eastern Standard)
 * keeps task resets aligned with the user's local midnight.
 */

const EASTERN_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC-5 (Eastern Standard Time)

/** Returns today's date string in Eastern time, e.g. "2026-03-07" */
export function getEasternDateStr(): string {
  return new Date(Date.now() - EASTERN_OFFSET_MS).toISOString().split('T')[0];
}

/**
 * Returns the UTC Date object that represents midnight Eastern time today.
 * Midnight Eastern (UTC-5) = 05:00 UTC same Eastern calendar day.
 */
export function getEasternDayStart(): Date {
  const todayEastern = getEasternDateStr();
  return new Date(todayEastern + 'T05:00:00.000Z');
}

/**
 * Returns the UTC Date object that represents end-of-day Eastern time today.
 * 11:59:59 PM Eastern = 04:59:59 UTC the NEXT calendar day.
 */
export function getEasternDayEnd(): Date {
  const start = getEasternDayStart();
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}
