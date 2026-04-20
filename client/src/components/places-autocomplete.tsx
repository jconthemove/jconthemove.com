import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";

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

interface PlacesAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (place: PlaceResult) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
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
  return mapsApiKey!;
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (mapsLoadingPromise) return mapsLoadingPromise;
  if (typeof window !== "undefined" && getMaps()?.places) {
    mapsLoadingPromise = Promise.resolve();
    return mapsLoadingPromise;
  }
  mapsLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
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
  autoFocus,
  onKeyDown,
  resolveOnBlur = true,
  onResolveAttempt,
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

  useEffect(() => {
    ensureAutofillAnimationCss();
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
      geocoder.geocode(
        { address: trimmed, componentRestrictions: { country: "US" } },
        (results, gStatus) => {
          if (gStatus !== "OK" || !results || results.length === 0) return resolve(false);
          const place = results[0];
          if (!isCompleteUsAddress(place)) return resolve(false);
          const result = extractComponents(place.formatted_address || trimmed, place.address_components);
          if (!result.city || !result.state || !result.zip) return resolve(false);
          lastResolvedRef.current = result.fullAddress;
          // Replace the raw input with the canonical formatted_address so the
          // pill, the backend, and any downstream geocoders all see the same
          // string the customer effectively confirmed.
          onChange(result.fullAddress);
          onPlaceSelect?.(result);
          resolve(true);
        },
      );
    });
  }

  function handleResolveAttempt(addr: string) {
    if (addr.trim().length < 5) return;
    tryResolveTypedAddress(addr).then((success) => {
      onResolveAttempt?.(success);
    });
  }

  const baseInput =
    "w-full bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 text-base rounded-md px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500/60 transition-all";

  return (
    <div className={`relative ${className || ""}`}>
      {status === "loading" && (
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <Loader2 className="h-3.5 w-3.5 text-slate-500 animate-spin" />
        </div>
      )}
      {status === "ready" && (
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
        className={
          inputClassName ||
          `${baseInput} ${status === "ready" ? "pl-8" : ""}`
        }
        autoComplete="off"
      />
    </div>
  );
}

export type { PlaceResult };
