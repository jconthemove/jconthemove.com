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

function extractComponents(place: google.maps.places.PlaceResult): PlaceResult {
  const comps = place.address_components || [];
  const get = (type: string) =>
    comps.find((c) => c.types.includes(type))?.long_name || "";
  const getShort = (type: string) =>
    comps.find((c) => c.types.includes(type))?.short_name || "";

  return {
    fullAddress: place.formatted_address || "",
    zip: get("postal_code"),
    city: get("locality") || get("sublocality"),
    state: getShort("administrative_area_level_1"),
  };
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
}: PlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
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
          const result = extractComponents(place);
          onChange(result.fullAddress);
          onPlaceSelect?.(result);
        });
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
  }, []);

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
