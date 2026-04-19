import { Check, Pencil } from "lucide-react";

interface AddressSummaryPillProps {
  city: string;
  state: string;
  zip: string;
  onEdit: () => void;
  className?: string;
}

export default function AddressSummaryPill({
  city,
  state,
  zip,
  onEdit,
  className,
}: AddressSummaryPillProps) {
  const parts = [city, state, zip].filter((p) => p && p.trim().length > 0);
  if (parts.length === 0) return null;
  const summary = `${[city, state].filter(Boolean).join(", ")}${
    zip ? ` ${zip}` : ""
  }`.trim();

  return (
    <div
      className={
        "mt-2 inline-flex items-center gap-2 rounded-full bg-teal-500/10 border border-teal-500/30 pl-3 pr-1 py-1 text-xs " +
        (className || "")
      }
      data-testid="address-summary-pill"
    >
      <Check className="h-3.5 w-3.5 text-teal-400 shrink-0" />
      <span className="text-teal-100 truncate max-w-[220px]">{summary}</span>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1 rounded-full bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 px-2 py-0.5 transition-colors"
        data-testid="button-edit-address-pill"
      >
        <Pencil className="h-3 w-3" />
        Edit
      </button>
    </div>
  );
}
