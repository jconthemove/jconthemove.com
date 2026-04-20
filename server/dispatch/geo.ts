// Task #172 — Geocoding adapter. Prefers the existing Google Maps
// integration when GOOGLE_MAPS_API_KEY / VITE_GOOGLE_MAPS_API_KEY is
// configured (the same key server/routes/lawnCare.ts already uses for
// service-area geocoding). Falls back to Nominatim — which other parts
// of the codebase (server/routes.ts travel-surcharge calc) already use
// — so the dispatch module keeps working in dev without a paid key.

interface Coords { lat: number; lng: number }

export async function geocodeAddress(address: string): Promise<Coords | null> {
  if (!address) return null;
  const googleKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (googleKey) {
    const g = await geocodeGoogle(address, googleKey);
    if (g) return g;
  }
  return geocodeNominatim(address);
}

async function geocodeGoogle(address: string, key: string): Promise<Coords | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = (await r.json()) as {
      status: string;
      results: Array<{ geometry: { location: { lat: number; lng: number } } }>;
    };
    if (data.status !== "OK" || !data.results?.length) return null;
    const { lat, lng } = data.results[0].geometry.location;
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

async function geocodeNominatim(address: string): Promise<Coords | null> {
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
