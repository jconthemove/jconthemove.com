// Task #172 — In-memory TTL locks for dispatch offers. Prevents two
// overlapping offers on the same job from racing each other. This is
// intentionally per-process — the dispatch service runs on a single
// Node instance. Redis lands when we shard (out of scope here).

interface Lock {
  key: string;
  holder: string; // offerId or "admin-override"
  expiresAt: number;
}

const locks = new Map<string, Lock>();

export function acquireLock(key: string, holder: string, ttlMs: number): boolean {
  const now = Date.now();
  const existing = locks.get(key);
  if (existing && existing.expiresAt > now && existing.holder !== holder) {
    return false;
  }
  locks.set(key, { key, holder, expiresAt: now + ttlMs });
  return true;
}

export function releaseLock(key: string, holder: string): void {
  const existing = locks.get(key);
  if (existing && existing.holder === holder) {
    locks.delete(key);
  }
}

export function inspectLock(key: string): Lock | null {
  const l = locks.get(key);
  if (!l) return null;
  if (l.expiresAt <= Date.now()) {
    locks.delete(key);
    return null;
  }
  return l;
}

// Test / admin helper.
export function __clearAllLocks(): void {
  locks.clear();
}
