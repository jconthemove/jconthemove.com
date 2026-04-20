import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";

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
}

let mapsApiKey: string | null = null;
let mapsLoadingPromise: Promise<void> | null = null;

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
  if (typeof window !== "undefined" && (window as any).google?.maps?.places) {
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
  comps: any[] | undefined,
): PlaceResult {
  const list = comps || [];
  const get = (type: string) =>
    list.find((c: any) => c.types.includes(type))?.long_name || "";
  const getShort = (type: string) =>
    list.find((c: any) => c.types.includes(type))?.short_name || "";

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
function isCompleteUsAddress(place: any): boolean {
  const comps: any[] = place.address_components || [];
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
}: PlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  // Track the last address we successfully fired `onPlaceSelect` for so the
  // blur-fallback never re-resolves the exact same string twice.
  const lastResolvedRef = useRef<string>("");
  // True for ~250ms after a Places suggestion is clicked. Prevents the
  // immediate blur from kicking off a duplicate Geocoder lookup.
  const justSelectedRef = useRef<boolean>(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    getMapsApiKey()
      .then((key) => loadGoogleMaps(key))
      .then(() => {
        if (cancelled || !inputRef.current) return;
        const autocomplete = new (window as any).google.maps.places.Autocomplete(
          inputRef.current,
          {
            types: ["address"],
            componentRestrictions: { country: "us" },
            fields: ["formatted_address", "address_components"],
          }
        );
        autocompleteRef.current = autocomplete;
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          if (!place || !place.formatted_address) return;
          const result = extractComponents(place.formatted_address, place.address_components);
          lastResolvedRef.current = result.fullAddress;
          justSelectedRef.current = true;
          setTimeout(() => { justSelectedRef.current = false; }, 250);
          onChange(result.fullAddress);
          onPlaceSelect?.(result);
        });
        // Lazy-init the geocoder for the blur fallback path.
        try {
          geocoderRef.current = new (window as any).google.maps.Geocoder();
        } catch { /* harmless — blur fallback simply no-ops */ }
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      if (autocompleteRef.current) {
        (window as any).google?.maps?.event?.clearInstanceListeners(
          autocompleteRef.current
        );
        autocompleteRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tryResolveTypedAddress(addr: string) {
    if (!resolveOnBlur) return;
    if (!geocoderRef.current) return;
    const trimmed = addr.trim();
    if (trimmed.length < 5) return;            // ignore obvious partials
    if (justSelectedRef.current) return;       // suggestion-click already fired
    if (trimmed === lastResolvedRef.current) return; // already resolved this exact string
    geocoderRef.current.geocode(
      { address: trimmed, componentRestrictions: { country: "US" } },
      (results: any, gStatus: any) => {
        if (gStatus !== "OK" || !results || results.length === 0) return;
        const place = results[0];
        if (!isCompleteUsAddress(place)) return;
        const result = extractComponents(place.formatted_address || trimmed, place.address_components);
        if (!result.city || !result.state || !result.zip) return;
        lastResolvedRef.current = result.fullAddress;
        // Replace the raw input with the canonical formatted_address so the
        // pill, the backend, and any downstream geocoders all see the same
        // string the customer effectively confirmed.
        onChange(result.fullAddress);
        onPlaceSelect?.(result);
      },
    );
  }

  const baseInput =
    "w-full bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500/60 transition-all";

  return (
    <div className={`relative ${className || ""}`}>
      {status === "loading" && (
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <Loader2 className="h-3.5 w-3.5 text-slate-500 animate-spin" />
        </div>
      )}
      {status === "ready" && (
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <MapPin className="h-3.5 w-3.5 text-teal-400" />
        </div>
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={(e) => tryResolveTypedAddress(e.target.value)}
        // Browser autofill: Chrome/Safari fire `animationstart` for the
        // synthetic `-webkit-autofill` animation, and most browsers fire
        // `change` after the user moves focus. The blur handler covers the
        // common case; we also try once on `animationend` for sites where
        // the browser fills before the user ever focused the field.
        onAnimationEnd={(e) => {
          if (e.animationName?.toLowerCase().includes("autofill")) {
            tryResolveTypedAddress(e.currentTarget.value);
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
