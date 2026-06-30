import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Loader2, AlertCircle } from "lucide-react";

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
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

function formatAddress(r: NominatimResult): string {
  const a = r.address;
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const city = a.city || a.town || a.village || "";
  const state = a.state || "";
  const zip = a.postcode || "";
  if (!street) return r.display_name;
  return [street, city, state, zip].filter(Boolean).join(", ");
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  error?: boolean;
  errorMessage?: string;
  label?: string;
  required?: boolean;
  className?: string;
  dark?: boolean;
  onSelect?: (value: string, result: NominatimResult) => void;
  allowPlaceResults?: boolean;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onBlur,
  placeholder = "123 Main St, City, State",
  error,
  errorMessage,
  label,
  required,
  dark = true,
  onSelect,
  allowPlaceResults = false,
}: Props) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 4) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: q + " USA",
        format: "json",
        addressdetails: "1",
        limit: "6",
        countrycodes: "us",
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { "Accept-Language": "en" },
      });
      if (!res.ok) return;
      const data: NominatimResult[] = await res.json();
      const us = data.filter((r) => r.address.country_code === "us" && (allowPlaceResults || r.address.road));
      setSuggestions(us.slice(0, 5));
      setOpen(us.length > 0);
    } catch {
      // Still usable as a plain input if lookup is unavailable.
    } finally {
      setLoading(false);
    }
  }, [allowPlaceResults]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 380);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value, search]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const pick = (r: NominatimResult) => {
    const formatted = formatAddress(r);
    onChange(formatted);
    onSelect?.(formatted, r);
    setSuggestions([]);
    setOpen(false);
  };

  const inputClass = dark
    ? `w-full bg-zinc-800 border rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none transition-colors pl-8 ${
        error ? "border-red-500 focus:border-red-400" : "border-zinc-700 focus:border-orange-500"
      }`
    : `w-full bg-white border rounded-xl px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors pl-8 ${
        error ? "border-red-500 focus:border-red-400" : "border-zinc-300 focus:border-orange-500"
      }`;

  return (
    <div className="relative" ref={containerRef}>
      {label && (
        <label className={`text-xs font-semibold block mb-1 ${dark ? "text-zinc-500" : "text-zinc-600"}`}>
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      <div className="relative">
        <MapPin className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none ${dark ? "text-zinc-500" : "text-zinc-400"}`} />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className={inputClass}
        />
        {loading && (
          <Loader2 className={`absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin ${dark ? "text-zinc-500" : "text-zinc-400"}`} />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className={`absolute z-50 top-full mt-1 w-full rounded-xl border shadow-xl overflow-hidden text-sm ${
          dark ? "bg-zinc-900 border-zinc-700" : "bg-white border-zinc-200"
        }`}>
          {suggestions.map(r => (
            <li
              key={r.place_id}
              onMouseDown={() => pick(r)}
              className={`flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors ${
                dark
                  ? "text-zinc-200 hover:bg-zinc-800"
                  : "text-zinc-800 hover:bg-orange-50"
              }`}
            >
              <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-orange-400" />
              <span className="leading-tight">{formatAddress(r)}</span>
            </li>
          ))}
        </ul>
      )}

      {error && errorMessage && (
        <p className="flex items-center gap-1 text-red-400 text-xs mt-1">
          <AlertCircle className="h-3 w-3" />
          {errorMessage}
        </p>
      )}
    </div>
  );
}
