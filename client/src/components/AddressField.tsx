import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { PlacesAutocomplete, type PlaceResult } from "@/components/places-autocomplete";
import AddressSummaryPill from "@/components/AddressSummaryPill";

/**
 * Task #164 — single source of truth for the booking-flow address field.
 *
 * Wraps `PlacesAutocomplete` with the green "Ironwood, MI 49938 / Edit"
 * confirmation pill and an optional manual City / State / ZIP fallback.
 * Used by `/book`, `/book/lawn-care`, and `/trash-valet/book` so all
 * three flows resolve typed / pasted / autofilled addresses identically.
 */

interface AddressFieldProps {
  /** Free-form street address. */
  value: string;
  onChange: (v: string) => void;

  /** Resolved city / state / ZIP. Owned by the parent so it can submit
   *  them to the backend; this component only mirrors them in the pill
   *  and pushes updates via the change callbacks. */
  city: string;
  state: string;
  zip: string;
  onCityChange: (v: string) => void;
  onStateChange: (v: string) => void;
  onZipChange: (v: string) => void;

  /** Fired when EITHER a Places suggestion is clicked OR the geocode-on-blur
   *  fallback resolves the typed/pasted/autofilled address. The wrapper
   *  already calls the city/state/zip setters before invoking this — it's
   *  here for consumers that need to trigger side effects (e.g. lot-size
   *  detection on the lawn-care flow). */
  onResolved?: (place: PlaceResult) => void;

  placeholder?: string;
  /** When false, the manual City / State / ZIP fields are never rendered
   *  even on unresolved addresses. The pill still shows when resolved.
   *  Used by `/book` which only needs the single-line address. */
  showManualFields?: boolean;
  inputClassName?: string;
  /** Theme tokens for the manual-fields fallback. Keeps the wrapper visually
   *  consistent with the host page (slate for lawn-care/admin, zinc for
   *  trash-valet & multi-service). */
  theme?: "slate" | "zinc";
  /** Optional helper line under the input. */
  hint?: React.ReactNode;
  /** Inline error from the parent form (e.g. react-hook-form). */
  error?: string;
  /** Disable Google Places and use fast typed-address parsing only. */
  disableGoogle?: boolean;
  "data-testid"?: string;
}

export default function AddressField({
  value,
  onChange,
  city,
  state,
  zip,
  onCityChange,
  onStateChange,
  onZipChange,
  onResolved,
  placeholder = "123 Main St, Ironwood, MI",
  showManualFields = true,
  inputClassName,
  theme = "slate",
  hint,
  error,
  disableGoogle = false,
  "data-testid": dataTestId,
}: AddressFieldProps) {
  // True after a Places suggestion or a geocode-on-blur successfully resolved
  // the current `value`. Drives the green pill vs. the manual-fields fallback.
  const [resolved, setResolved] = useState<boolean>(false);
  // True when the customer has clicked "Edit" on the pill or has begun
  // typing a new address — keeps the manual fields visible until the next
  // successful resolve.
  const [manualOpen, setManualOpen] = useState<boolean>(false);
  // Snapshot of the address string at the moment we resolved it. If the
  // input value drifts away from this, we treat the address as no-longer-
  // resolved and re-open the manual fields.
  const resolvedValueRef = useRef<string>("");

  useEffect(() => {
    // Drift detection isn't gated by `resolved` because the onChange handler
    // sets `resolved=false` synchronously, which would otherwise prevent the
    // stale-data cleanup from ever running. We trigger any time the input
    // diverges from the address we last successfully resolved.
    if (resolvedValueRef.current && value !== resolvedValueRef.current) {
      // Clear the now-stale city/state/zip so the customer can't accidentally
      // submit "555 Oak St" with the previously-resolved "Ironwood, MI 49938"
      // still attached to it. The geocode-on-blur will re-fill them as soon
      // as the new address resolves; until then the manual fields are open.
      if (resolved) setResolved(false);
      onCityChange("");
      onStateChange("");
      onZipChange("");
      // Forget the snapshot so we don't re-fire the clear on every keystroke.
      resolvedValueRef.current = "";
      if (showManualFields && value.trim().length > 0) setManualOpen(true);
    }
  }, [value, resolved, showManualFields, onCityChange, onStateChange, onZipChange]);

  function handlePlace(place: PlaceResult) {
    if (place.city) onCityChange(place.city);
    if (place.state) onStateChange(place.state);
    if (place.zip) onZipChange(place.zip);
    resolvedValueRef.current = place.fullAddress;
    setResolved(true);
    setManualOpen(false);
    onResolved?.(place);
  }

  function parseTypedAddress(raw: string): PlaceResult | null {
    const trimmed = raw.trim().replace(/\s+/g, " ");
    if (trimmed.length < 6) return null;
    const zipMatch = trimmed.match(/\b(\d{5})(?:-\d{4})?\b/);
    const stateZipMatch = trimmed.match(/\b([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/i);
    const cityStateZipMatch = trimmed.match(/,\s*([^,]+?)\s*,?\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?\s*$/i);
    if (cityStateZipMatch) {
      return {
        fullAddress: trimmed,
        city: cityStateZipMatch[1].trim(),
        state: cityStateZipMatch[2].toUpperCase(),
        zip: cityStateZipMatch[3],
      };
    }
    if (stateZipMatch) {
      const beforeState = trimmed.slice(0, stateZipMatch.index).replace(/,\s*$/, "");
      const city = beforeState.split(",").map((part) => part.trim()).filter(Boolean).pop() || "";
      return {
        fullAddress: trimmed,
        city,
        state: stateZipMatch[1].toUpperCase(),
        zip: stateZipMatch[2],
      };
    }
    if (zipMatch) {
      return {
        fullAddress: trimmed,
        city,
        state,
        zip: zipMatch[1],
      };
    }
    return null;
  }

  function tryLocalResolve(raw: string) {
    const parsed = parseTypedAddress(raw);
    if (!parsed || (!parsed.city && !parsed.state && !parsed.zip)) return false;
    if (parsed.city) onCityChange(parsed.city);
    if (parsed.state) onStateChange(parsed.state);
    if (parsed.zip) onZipChange(parsed.zip);
    if (parsed.city && parsed.state && parsed.zip) {
      resolvedValueRef.current = parsed.fullAddress;
      setResolved(true);
      setManualOpen(false);
      onResolved?.(parsed);
      return true;
    }
    if (showManualFields) setManualOpen(true);
    return false;
  }

  const inputs = theme === "zinc"
    ? "w-full rounded-md border border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/60 transition-all"
    : "w-full rounded-md border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500/60 transition-all";

  // Show the "needs more info" callout when the customer typed an address
  // we couldn't resolve and the manual fields are open.
  const showUnresolvedHint =
    showManualFields &&
    manualOpen &&
    !resolved &&
    value.trim().length >= 6 &&
    (!city || !state || !zip);

  return (
    <div data-testid={dataTestId}>
      <PlacesAutocomplete
        value={value}
        onChange={(v) => {
          onChange(v);
          if (disableGoogle) tryLocalResolve(v);
          if (resolved && v !== resolvedValueRef.current) {
            setResolved(false);
            if (showManualFields) setManualOpen(true);
          }
        }}
        onPlaceSelect={handlePlace}
        // Fired after every blur / autofill resolve attempt. When the
        // attempt fails (typo, out-of-area, partial street) we reveal the
        // manual City / State / ZIP inputs so the customer can finish the
        // address by hand — required for the green pill UX to be honest.
        onResolveAttempt={(success) => {
          const locallyResolved = !success && disableGoogle ? tryLocalResolve(value) : false;
          if (!success && !locallyResolved && showManualFields && value.trim().length > 0) {
            setManualOpen(true);
          }
        }}
        placeholder={placeholder}
        inputClassName={inputClassName || inputs}
        disableGoogle={disableGoogle}
        resolveOnBlur={!disableGoogle}
      />

      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}

      {resolved && !manualOpen && (city || state || zip) && (
        <AddressSummaryPill
          city={city}
          state={state}
          zip={zip}
          onEdit={() => setManualOpen(true)}
        />
      )}

      {hint && !resolved && (
        <p className={`text-[10px] mt-1 ${theme === "zinc" ? "text-zinc-600" : "text-slate-500"}`}>
          {hint}
        </p>
      )}

      {showUnresolvedHint && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-300">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            We couldn't auto-fill the city / ZIP for this address — please confirm them below.
          </span>
        </div>
      )}

      {showManualFields && manualOpen && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <input
            type="text"
            value={city}
            onChange={(e) => onCityChange(e.target.value)}
            placeholder="City"
            className={"col-span-2 " + (theme === "zinc"
              ? "rounded-md border border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 px-3 py-2 text-sm"
              : "rounded-md border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 px-3 py-2 text-sm")}
            data-testid="input-address-city"
          />
          <input
            type="text"
            value={zip}
            onChange={(e) => onZipChange(e.target.value)}
            placeholder="ZIP"
            maxLength={5}
            className={theme === "zinc"
              ? "rounded-md border border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 px-3 py-2 text-sm"
              : "rounded-md border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 px-3 py-2 text-sm"}
            data-testid="input-address-zip"
          />
          <input
            type="text"
            value={state}
            onChange={(e) => onStateChange(e.target.value)}
            placeholder="State"
            className={"col-span-3 " + (theme === "zinc"
              ? "rounded-md border border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 px-3 py-2 text-sm"
              : "rounded-md border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 px-3 py-2 text-sm")}
            data-testid="input-address-state"
          />
        </div>
      )}
    </div>
  );
}
