export interface WeeklyCrewRule {
  dayOfWeek: number;
  dayKey: string;
  dayLabel: string;
  shortLabel: string;
  assignedWorkerName: string | null;
  isOpenMakeupDay: boolean;
  note: string;
}

export const WEEKLY_CREW_RULES: WeeklyCrewRule[] = [
  {
    dayOfWeek: 0,
    dayKey: "sunday",
    dayLabel: "Sunday",
    shortLabel: "Sun",
    assignedWorkerName: null,
    isOpenMakeupDay: true,
    note: "Open / makeup day",
  },
  {
    dayOfWeek: 1,
    dayKey: "monday",
    dayLabel: "Monday",
    shortLabel: "Mon",
    assignedWorkerName: "Matt",
    isOpenMakeupDay: false,
    note: "Matt's primary shift day",
  },
  {
    dayOfWeek: 2,
    dayKey: "tuesday",
    dayLabel: "Tuesday",
    shortLabel: "Tue",
    assignedWorkerName: "Tim",
    isOpenMakeupDay: false,
    note: "Tim's primary shift day",
  },
  {
    dayOfWeek: 3,
    dayKey: "wednesday",
    dayLabel: "Wednesday",
    shortLabel: "Wed",
    assignedWorkerName: "Bill",
    isOpenMakeupDay: false,
    note: "Bill's primary shift day",
  },
  {
    dayOfWeek: 4,
    dayKey: "thursday",
    dayLabel: "Thursday",
    shortLabel: "Thu",
    assignedWorkerName: "Troy",
    isOpenMakeupDay: false,
    note: "Troy's primary shift day",
  },
  {
    dayOfWeek: 5,
    dayKey: "friday",
    dayLabel: "Friday",
    shortLabel: "Fri",
    assignedWorkerName: null,
    isOpenMakeupDay: true,
    note: "Open / makeup day",
  },
  {
    dayOfWeek: 6,
    dayKey: "saturday",
    dayLabel: "Saturday",
    shortLabel: "Sat",
    assignedWorkerName: null,
    isOpenMakeupDay: true,
    note: "Open / makeup day",
  },
];

export function getWeeklyCrewRule(dayOfWeek: number): WeeklyCrewRule {
  return WEEKLY_CREW_RULES.find((rule) => rule.dayOfWeek === dayOfWeek) ?? WEEKLY_CREW_RULES[0];
}

export function getWeeklyCrewRuleForDate(value: Date | string): WeeklyCrewRule {
  const date = typeof value === "string" ? new Date(`${value}T12:00:00`) : value;
  return getWeeklyCrewRule(date.getDay());
}

export function normalizeCrewName(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();
}
