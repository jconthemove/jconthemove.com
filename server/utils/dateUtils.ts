/**
 * Date utilities using Central time (UTC-6) as the canonical "today".
 *
 * The server runs in UTC. US-based users (Michigan / Central time) doing
 * tasks in the evening (e.g. 10 PM Central = 4 AM UTC next day) would have
 * their work recorded as the NEXT UTC date, causing tasks to look "already done"
 * the next morning.
 *
 * All daily-task comparisons now use Central time (UTC-6) so resets happen
 * at midnight Central — aligned with the user's local experience.
 */

const CENTRAL_OFFSET_MS = 6 * 60 * 60 * 1000; // UTC-6 (Central Standard Time)

/** Returns today's date string in Central time, e.g. "2026-03-07" */
export function getEasternDateStr(): string {
  return new Date(Date.now() - CENTRAL_OFFSET_MS).toISOString().split('T')[0];
}

/**
 * Returns the UTC Date object that represents midnight Central time today.
 * Midnight Central (UTC-6) = 06:00 UTC of the same Central calendar day.
 */
export function getEasternDayStart(): Date {
  const todayCentral = getEasternDateStr();
  return new Date(todayCentral + 'T06:00:00.000Z');
}

/**
 * Returns the UTC Date object that represents end-of-day Central time today.
 * 11:59:59 PM Central = 05:59:59 UTC the NEXT calendar day.
 */
export function getEasternDayEnd(): Date {
  const start = getEasternDayStart();
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}
