import { useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

// Task #173 — crew GPS beacon. Streams the device position to
// /api/crew/location at most once every 30s while the crew member is on
// duty. Lives in a hook that's mounted by CrewLayout so tracking
// continues across every /crew/* route (Today, Jobs, Schedule, Earnings)
// instead of stopping when the crew navigates away from the Today tab.
// Stops immediately when duty flips off to respect battery + privacy.
// Permission failures are swallowed silently — this is best-effort.
export function useCrewGpsBeacon(params: {
  enabled: boolean;
  minIntervalMs?: number;
}): void {
  const { enabled, minIntervalMs = 30_000 } = params;

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let lastSent = 0;
    let watchId: number | null = null;
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const now = Date.now();
          if (now - lastSent < minIntervalMs) return;
          lastSent = now;
          apiRequest("POST", "/api/crew/location", {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }).catch(() => {
            /* silent — best-effort */
          });
        },
        () => {
          /* permission denied, etc. — silent */
        },
        { enableHighAccuracy: false, maximumAge: 20_000, timeout: 30_000 },
      );
    } catch {
      /* ignore */
    }
    return () => {
      if (watchId != null && navigator.geolocation) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch {
          /* noop */
        }
      }
    };
  }, [enabled, minIntervalMs]);
}
