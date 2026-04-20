// Task #172 — Geocoding adapter. We use the free Nominatim endpoint that
// the rest of the app already relies on (see client/src/hooks/use-geolocation.ts)
// to keep the dependency surface identical. On failure the job keeps null
// coords and the engine falls back to territory-center matching.

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address) return null;
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
      { headers: { "User-Agent": "JCMoves-Dispatch/1.0" } },
    );
    if (!r.ok) return null;
    const data = (await r.json()) as Array<{ lat: string; lon: string }>;
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
