import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Minimal local Google Maps types ───────────────────────────────────────
// We don't take a dependency on `@types/google.maps` for this single
// component, but we still want strong types instead of `any`. These are the
// only fields we actually read — extend as needed if more of the API is used.
interface GAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}
interface GGeocoderResult {
  formatted_address?: string;
  address_components?: GAddressComponent[];
}
type GGeocoderStatus = "OK" | "ZERO_RESULTS" | "OVER_QUERY_LIMIT" | "REQUEST_DENIED" | "INVALID_REQUEST" | "UNKNOWN_ERROR" | "ERROR";
interface GGeocoderRequest {
  address?: string;
  componentRestrictions?: { country?: string | string[] };
}
interface GGeocoder {
  geocode(
    request: GGeocoderRequest,
    callback: (results: GGeocoderResult[] | null, status: GGeocoderStatus) => void,
  ): void;
}
interface GAutocomplete {
  getPlace(): GGeocoderResult;
  addListener(event: string, handler: () => void): void;
}
interface GMaps {
  Geocoder: new () => GGeocoder;
  places: {
    Autocomplete: new (
      input: HTMLInputElement,
      opts: {
        types?: string[];
        componentRestrictions?: { country?: string | string[] };
        fields?: string[];
      },
    ) => GAutocomplete;
  };
  event?: { clearInstanceListeners(instance: unknown): void };
}
function getMaps(): GMaps | null {
  const w = window as unknown as { google?: { maps?: GMaps } };
  return w.google?.maps ?? null;
}

interface PlaceResult {
  fullAddress: string;
  zip: string;
  city: string;
  state: string;
}

interface FallbackAddressResult {
  place_id: number;
  display_name: string;
  address: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
    country_code?: string;
  };
}

interface PlacesAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (place: PlaceResult) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  inputTestId?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Task #164 — when true (default), if the user types / pastes / autofills
   *  an address and blurs without clicking a Places suggestion, we run a
   *  Geocoder lookup against the typed value and fire `onPlaceSelect` with
   *  the resolved city/state/zip. This makes typed and clicked addresses
   *  behave identically for downstream UI (e.g. the green confirmation pill). */
  resolveOnBlur?: boolean;
  /** Fires after EVERY blur-driven resolve attempt with the outcome. Lets the
   *  parent reveal a manual City / State / ZIP fallback whenever a typed or
   *  autofilled address can't be resolved into a complete street address. */
  onResolveAttempt?: (success: boolean) => void;
  /** Keeps typing fully local for flows where Google Maps has proven brittle. */
  disableGoogle?: boolean;
}

let mapsApiKey: string | null = null;
let mapsLoadingPromise: Promise<void> | null = null;

// Inject a no-op `-webkit-autofill` keyframe so we get a deterministic
// `animationend` event when Chrome / Edge / Safari autofill our address
// inputs. Without this rule no animation runs and the autofill hook in
// the component below never fires for browser-driven fills.
let autofillStyleInjected = false;
function ensureAutofillAnimationCss() {
  if (autofillStyleInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-jc-autofill", "1");
  style.textContent = `
    @keyframes jcAutofillStart { from { opacity: 1; } to { opacity: 1; } }
    input:-webkit-autofill { animation-name: jcAutofillStart; animation-duration: 0.001s; }
  `;
  document.head.appendChild(style);
  autofillStyleInjected = true;
}

async function getMapsApiKey(): Promise<string> {
  if (mapsApiKey) return mapsApiKey;
  const res = await fetch("/api/maps-config");
  if (!res.ok) throw new Error("Maps config unavailable");
  const data = await res.json();
  mapsApiKey = data.key;
  if (!mapsApiKey) throw new Error("Maps key unavailable");
  return mapsApiKey!;
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (mapsLoadingPromise) return mapsLoadingPromise;
  if (typeof window !== "undefined" && getMaps()?.places) {
    mapsLoadingPromise = Promise.resolve();
    return mapsLoadingPromise;
  }
  mapsLoadingPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-jc-google-maps='1']");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.setAttribute("data-jc-google-maps", "1");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    const timeout = window.setTimeout(() => reject(new Error("Google Maps timed out")), 8000);
    script.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Failed to load Google Maps"));
    };
    document.head.appendChild(script);
  });
  return mapsLoadingPromise;
}

function extractComponents(
  formattedAddress: string,
  comps: GAddressComponent[] | undefined,
): PlaceResult {
  const list = comps || [];
  const get = (type: string) =>
    list.find((c) => c.types.includes(type))?.long_name || "";
  const getShort = (type: string) =>
    list.find((c) => c.types.includes(type))?.short_name || "";

  return {
    fullAddress: formattedAddress || "",
    zip: get("postal_code"),
    city: get("locality") || get("sublocality"),
    state: getShort("administrative_area_level_1"),
  };
}

function fallbackToPlaceResult(result: FallbackAddressResult): PlaceResult {
  const a = result.address || {};
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const city = a.city || a.town || a.village || "";
  const state = a.state || "";
  const zip = a.postcode || "";
  return {
    fullAddress: street ? [street, city, state, zip].filter(Boolean).join(", ") : result.display_name,
    city,
    state,
    zip,
  };
}

/** Returns true when the geocoded result is a real US street-level address
 *  (street_number + route + city + state + ZIP). Anything less specific —
 *  city-only, ZIP-only, or county-level matches — is rejected so the
 *  confirmation pill never claims success on a partial address. */
function isCompleteUsAddress(place: GGeocoderResult): boolean {
  const comps = place.address_components || [];
  const has = (type: string) => comps.some((c) => c.types.includes(type));
  return (
    has("street_number") &&
    has("route") &&
    (has("locality") || has("sublocality")) &&
    has("administrative_area_level_1") &&
    has("postal_code") &&
    comps.some((c) => c.short_name === "US")
  );
}

export function PlacesAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Start typing an address…",
  className,
  inputClassName,
  inputTestId,
  autoFocus,
  onKeyDown,
  resolveOnBlur = true,
  onResolveAttempt,
  disableGoogle = false,
}: PlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<GAutocomplete | null>(null);
  const geocoderRef = useRef<GGeocoder | null>(null);
  // Track the last address we successfully fired `onPlaceSelect` for so the
  // blur-fallback never re-resolves the exact same string twice.
  const lastResolvedRef = useRef<string>("");
  // True for ~250ms after a Places suggestion is clicked. Prevents the
  // immediate blur from kicking off a duplicate Geocoder lookup.
  const justSelectedRef = useRef<boolean>(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [fallbackSuggestions, setFallbackSuggestions] = useState<FallbackAddressResult[]>([]);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const fallbackDebounceRef = useRef<number | null>(null);

  const searchFallbackAddresses = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 4 || status === "ready") {
      setFallbackSuggestions([]);
      setFallbackOpen(false);
      return;
    }
    setFallbackLoading(true);
    try {
      const params = new URLSearchParams({
        q: `${q} USA`,
        format: "json",
        addressdetails: "1",
        limit: "6",
        countrycodes: "us",
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { "Accept-Language": "en" },
      });
      if (!res.ok) return;
      const data: FallbackAddressResult[] = await res.json();
      const suggestions = data
        .filter((r) => r.address?.country_code === "us" && r.address?.road)
        .slice(0, 5);
      setFallbackSuggestions(suggestions);
      setFallbackOpen(suggestions.length > 0);
    } catch {
      setFallbackSuggestions([]);
      setFallbackOpen(false);
    } finally {
      setFallbackLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (fallbackDebounceRef.current) window.clearTimeout(fallbackDebounceRef.current);
    if (status === "ready") {
      setFallbackSuggestions([]);
      setFallbackOpen(false);
      return;
    }
    fallbackDebounceRef.current = window.setTimeout(() => searchFallbackAddresses(value), 260);
    return () => {
      if (fallbackDebounceRef.current) window.clearTimeout(fallbackDebounceRef.current);
    };
  }, [searchFallbackAddresses, status, value]);

  useEffect(() => {
    ensureAutofillAnimationCss();
    if (disableGoogle) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");

    getMapsApiKey()
      .then((key) => loadGoogleMaps(key))
      .then(() => {
        if (cancelled || !inputRef.current) return;
        const maps = getMaps();
        if (!maps) { setStatus("error"); return; }
        const autocomplete = new maps.places.Autocomplete(inputRef.current, {
          types: ["address"],
          componentRestrictions: { country: "us" },
          fields: ["formatted_address", "address_components"],
        });
        autocompleteRef.current = autocomplete;
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          if (!place || !place.formatted_address) return;
          const result = extractComponents(place.formatted_address, place.address_components);
          lastResolvedRef.current = result.fullAddress;
          justSelectedRef.current = true;
          window.setTimeout(() => { justSelectedRef.current = false; }, 250);
          onChange(result.fullAddress);
          onPlaceSelect?.(result);
        });
        try { geocoderRef.current = new maps.Geocoder(); } catch { /* harmless */ }
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      const maps = getMaps();
      if (autocompleteRef.current && maps?.event) {
        maps.event.clearInstanceListeners(autocompleteRef.current);
      }
      autocompleteRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tryResolveTypedAddress(addr: string): Promise<boolean> {
    if (!resolveOnBlur) return Promise.resolve(false);
    const geocoder = geocoderRef.current;
    if (!geocoder) return Promise.resolve(false);
    const trimmed = addr.trim();
    if (trimmed.length < 5) return Promise.resolve(false);     // obvious partial
    if (justSelectedRef.current) return Promise.resolve(true); // suggestion-click already fired
    if (trimmed === lastResolvedRef.current) return Promise.resolve(true);

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (success: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(success);
      };
      const timeout = window.setTimeout(() => finish(false), 8000);
      try {
        geocoder.geocode(
          { address: trimmed, componentRestrictions: { country: "US" } },
          (results, gStatus) => {
            if (gStatus !== "OK" || !results || results.length === 0) return finish(false);
            const place = results[0];
            if (!isCompleteUsAddress(place)) return finish(false);
            const result = extractComponents(place.formatted_address || trimmed, place.address_components);
            if (!result.city || !result.state || !result.zip) return finish(false);
            lastResolvedRef.current = result.fullAddress;
            // Replace the raw input with the canonical formatted_address so the
            // pill, the backend, and any downstream geocoders all see the same
            // string the customer effectively confirmed.
            onChange(result.fullAddress);
            onPlaceSelect?.(result);
            finish(true);
          },
        );
      } catch {
        finish(false);
      }
    });
  }

  function handleResolveAttempt(addr: string) {
    if (addr.trim().length < 5) return;
    tryResolveTypedAddress(addr)
      .then((success) => {
        onResolveAttempt?.(success);
      })
      .catch(() => onResolveAttempt?.(false));
  }

  function pickFallbackAddress(result: FallbackAddressResult) {
    const place = fallbackToPlaceResult(result);
    lastResolvedRef.current = place.fullAddress;
    onChange(place.fullAddress);
    onPlaceSelect?.(place);
    onResolveAttempt?.(!!(place.city && place.state && place.zip));
    setFallbackSuggestions([]);
    setFallbackOpen(false);
  }

  const baseInput =
    "w-full bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 text-base rounded-md px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500/60 transition-all";

  return (
    <div className={`relative ${className || ""}`}>
      {(status === "loading" || fallbackLoading) && (
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <Loader2 className="h-3.5 w-3.5 text-slate-500 animate-spin" />
        </div>
      )}
      {(status === "ready" || fallbackOpen) && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <MapPin className="h-4 w-4 text-teal-400" />
        </div>
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={(e) => handleResolveAttempt(e.target.value)}
        onFocus={() => fallbackSuggestions.length > 0 && setFallbackOpen(true)}
        // Browser autofill (Chrome/Safari) can fire `change` without ever
        // focusing the field. The `-webkit-autofill` animation gives us a
        // reliable hook to retry resolution in that case.
        onAnimationEnd={(e) => {
          if (e.animationName?.toLowerCase().includes("autofill")) {
            handleResolveAttempt(e.currentTarget.value);
          }
        }}
        placeholder={status === "loading" ? "Loading maps…" : placeholder}
        autoFocus={autoFocus}
        className={cn(inputClassName || baseInput, (status === "ready" || fallbackOpen) && "pl-9")}
        name="street-address"
        autoComplete="street-address"
        data-testid={inputTestId}
      />
      {fallbackOpen && fallbackSuggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
          {fallbackSuggestions.map((result) => {
            const place = fallbackToPlaceResult(result);
            return (
              <li
                key={result.place_id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickFallbackAddress(result);
                }}
                className="flex cursor-pointer items-start gap-2 px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-slate-800"
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-teal-400" />
                <span className="leading-tight">{place.fullAddress}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export type { PlaceResult };
