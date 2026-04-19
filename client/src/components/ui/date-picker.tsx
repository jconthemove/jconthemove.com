import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { format, isValid, parseISO, startOfToday } from "date-fns";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  disablePast?: boolean;
  testId?: string;
};

function parseDateValue(value?: string | null) {
  if (!value) return undefined;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : undefined;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  buttonClassName,
  disabled = false,
  disablePast = true,
  testId,
}: DatePickerProps) {
  const selectedDate = parseDateValue(value);
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          data-testid={testId}
          className={cn(
            "w-full justify-between border-slate-700 bg-slate-900 text-left font-normal text-white hover:bg-slate-800 hover:text-white",
            !selectedDate && "text-slate-400",
            buttonClassName,
          )}
        >
          <span>{selectedDate ? format(selectedDate, "MM/dd/yyyy") : placeholder}</span>
          <CalendarIcon className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("w-auto border-slate-700 bg-slate-950 p-0", className)}>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : "");
            if (date) setOpen(false);
          }}
          disabled={disablePast ? { before: startOfToday() } : undefined}
          initialFocus
          className="text-white"
          classNames={{
            caption_label: "text-sm font-medium text-white",
            head_cell: "rounded-md w-9 font-normal text-[0.8rem] text-slate-400",
            day: "h-9 w-9 p-0 font-normal text-white aria-selected:opacity-100 hover:bg-slate-800",
            day_today: "bg-slate-800 text-white",
            day_outside: "text-slate-500 aria-selected:bg-slate-800 aria-selected:text-slate-400",
            day_disabled: "text-slate-600 opacity-50",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
