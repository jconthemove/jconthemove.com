import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import { ALL_BUNDLE_SERVICES } from "@/components/ServiceBundleAddon";

export type BundleSchedulingMode = "date_freq" | "date_only" | "call_only";

export type BundleScheduleEntry = {
  date?: string;
  frequency?: string;
  callToSchedule?: boolean;
  notes?: string;
};

export const BUNDLE_SCHEDULING_MODE: Record<string, BundleSchedulingMode> = {
  trash_valet: "date_freq",
  window_cleaning: "date_freq",
  junk_removal: "date_only",
  cleaning: "date_only",
  snow_removal: "date_only",
  moving: "call_only",
  assembly: "call_only",
};

export const BUNDLE_FREQUENCY_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  trash_valet:     [{ value: "weekly", label: "Weekly" }, { value: "biweekly", label: "Biweekly" }],
  window_cleaning: [{ value: "one_time", label: "One time" }, { value: "biannual", label: "Twice a year" }, { value: "quarterly", label: "Quarterly" }],
};

export type BundleSchedulePayloadEntry = {
  service: string;
  requestedStartDate?: string;
  frequency?: string;
  callToSchedule?: boolean;
  notes?: string;
};

export function buildBundleSchedulesPayload(
  bundleAddons: string[],
  schedules: Record<string, BundleScheduleEntry>,
): BundleSchedulePayloadEntry[] {
  return bundleAddons
    .filter(id => BUNDLE_SCHEDULING_MODE[id])
    .map(id => {
      const entry = schedules[id] || {};
      const mode = BUNDLE_SCHEDULING_MODE[id];
      return {
        service: id,
        requestedStartDate: mode === "call_only" ? undefined : entry.date,
        frequency: mode === "date_freq" ? entry.frequency : undefined,
        callToSchedule: mode === "call_only" ? true : undefined,
        notes: entry.notes,
      };
    });
}

type Props = {
  bundleAddons: string[];
  schedules: Record<string, BundleScheduleEntry>;
  onChange: (next: Record<string, BundleScheduleEntry>) => void;
  testIdPrefix?: string;
};

export default function BundleServiceScheduler({ bundleAddons, schedules, onChange, testIdPrefix = "bundle" }: Props) {
  const schedulableAddons = bundleAddons.filter(id => BUNDLE_SCHEDULING_MODE[id]);
  if (schedulableAddons.length === 0) return null;

  return (
    <div className="rounded-2xl border border-teal-500/30 bg-teal-500/5 p-4 space-y-4" data-testid={`${testIdPrefix}-scheduler`}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-teal-300">Schedule your bundled services</p>
        <p className="text-xs text-slate-400 mt-1">A quick start date for each — we'll confirm details after you submit.</p>
      </div>
      {schedulableAddons.map(id => {
        const svc = ALL_BUNDLE_SERVICES.find(s => s.id === id);
        const mode = BUNDLE_SCHEDULING_MODE[id];
        const entry = schedules[id] || {};
        const setEntry = (patch: Partial<BundleScheduleEntry>) =>
          onChange({ ...schedules, [id]: { ...schedules[id], ...patch } });
        return (
          <div key={id} data-testid={`${testIdPrefix}-schedule-${id}`} className="rounded-xl bg-slate-800/60 border border-slate-700/60 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">{svc?.emoji}</span>
              <span className="text-sm font-semibold text-white">{svc?.label}</span>
            </div>
            {mode === "call_only" ? (
              <p className="text-xs text-slate-400 leading-snug">
                Quick chat needed for {svc?.label.toLowerCase()} — we'll call you within 24 hours to plan it.
              </p>
            ) : (
              <>
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">Preferred start date</label>
                  <DatePicker
                    value={entry.date}
                    onChange={(v) => setEntry({ date: v || undefined })}
                    placeholder="Pick a date"
                  />
                </div>
                {mode === "date_freq" && (
                  <div>
                    <label className="text-[11px] text-slate-400 mb-1 block">Frequency</label>
                    <div className="flex flex-wrap gap-1.5">
                      {(BUNDLE_FREQUENCY_OPTIONS[id] || []).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          data-testid={`${testIdPrefix}-freq-${id}-${opt.value}`}
                          onClick={() => setEntry({ frequency: opt.value })}
                          className={cn(
                            "text-[11px] px-2.5 py-1 rounded-full border transition-all",
                            entry.frequency === opt.value
                              ? "border-teal-400 bg-teal-500/20 text-teal-200"
                              : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600",
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
