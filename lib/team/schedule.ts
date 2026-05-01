import type { MemberSchedule, ScheduleCadence } from "./types";

const MS_PER_DAY = 86_400_000;

// Sunday, 1970-01-04 at local midnight. Used as the parity anchor for
// biweekly schedules so dayOfCycle 0 = Sunday of week A, 7 = Sunday of week B.
const BIWEEKLY_ANCHOR = new Date(1970, 0, 4);

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function dayOfCycleMax(cadence: ScheduleCadence): number {
  switch (cadence) {
    case "daily":
    case "test":
      return 0;
    case "weekly":
      return 6;
    case "biweekly":
      return 13;
    case "monthly":
      return 31;
  }
}

export function dayOfCycleMin(cadence: ScheduleCadence): number {
  return cadence === "monthly" ? 1 : 0;
}

export function isValidDayOfCycle(
  cadence: ScheduleCadence,
  day: number,
): boolean {
  return (
    Number.isInteger(day) &&
    day >= dayOfCycleMin(cadence) &&
    day <= dayOfCycleMax(cadence)
  );
}

export const TEST_INTERVAL_MIN_SEC = 5;
export const TEST_INTERVAL_MAX_SEC = 3_600;
export const TEST_RUNS_MIN = 1;
export const TEST_RUNS_MAX = 100;

function localMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a: Date, b: Date): number {
  // Math.round absorbs the ±1h drift across DST boundaries.
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function lastDayOfMonth(year: number, month: number): number {
  // month is 0-indexed; day 0 of (month+1) === last day of month.
  return new Date(year, month + 1, 0).getDate();
}

export function biweeklyIndex(date: Date): number {
  const days = daysBetween(BIWEEKLY_ANCHOR, localMidnight(date));
  // Use modulo that's always non-negative.
  return ((days % 14) + 14) % 14;
}

/**
 * Given a day-of-week (0=Sunday..6=Saturday), return the biweekly dayOfCycle
 * (0-13) that anchors the schedule on the next occurrence of that weekday.
 * If today matches, returns today's biweekly index so the cycle starts now.
 */
export function nextBiweeklyIndexForDow(
  dayOfWeek: number,
  now: Date = new Date(),
): number {
  const today = localMidnight(now);
  const ahead = (dayOfWeek - today.getDay() + 7) % 7;
  return biweeklyIndex(addDays(today, ahead));
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(d.getDate() + n);
  return next;
}

function monthlyAnchorIn(
  year: number,
  month: number,
  dayOfCycle: number,
): Date {
  const last = lastDayOfMonth(year, month);
  return new Date(year, month, Math.min(dayOfCycle, last));
}

function testNextFireMs(schedule: MemberSchedule): number {
  const interval = (schedule.intervalSec ?? 60) * 1000;
  // Schedules saved with cadence === "test" seed lastPaidAt = createdAt - interval
  // so the first fire is immediate. Fall back to "now" if missing for any reason.
  const last = schedule.lastPaidAt ?? Date.now() - interval;
  return last + interval;
}

/**
 * Timestamp of the most recent moment this schedule should have fired on or
 * before `now`. For weekly / biweekly / monthly this is the cycle's anchor at
 * local midnight. For daily it's today's local midnight. For test it's the
 * next-fire moment if it has already passed (else 0).
 */
export function lastAnchorMs(schedule: MemberSchedule, now: Date): number {
  if (schedule.cadence === "daily") {
    return localMidnight(now).getTime();
  }

  if (schedule.cadence === "test") {
    const fire = testNextFireMs(schedule);
    return fire <= now.getTime() ? fire : 0;
  }

  const today = localMidnight(now);

  if (schedule.cadence === "weekly") {
    const target = schedule.dayOfCycle;
    const back = (today.getDay() - target + 7) % 7;
    return addDays(today, -back).getTime();
  }

  if (schedule.cadence === "biweekly") {
    const idx = biweeklyIndex(today);
    const back = (idx - schedule.dayOfCycle + 14) % 14;
    return addDays(today, -back).getTime();
  }

  // monthly
  const candidate = monthlyAnchorIn(
    today.getFullYear(),
    today.getMonth(),
    schedule.dayOfCycle,
  );
  if (candidate.getTime() <= today.getTime()) return candidate.getTime();
  return monthlyAnchorIn(
    today.getFullYear(),
    today.getMonth() - 1,
    schedule.dayOfCycle,
  ).getTime();
}

/**
 * Timestamp of the next payment moment strictly after the most recent anchor.
 */
export function nextAnchorMs(schedule: MemberSchedule, now: Date): number {
  if (schedule.cadence === "daily") {
    return addDays(localMidnight(now), 1).getTime();
  }
  if (schedule.cadence === "test") {
    return testNextFireMs(schedule);
  }

  const last = new Date(lastAnchorMs(schedule, now));

  if (schedule.cadence === "weekly") return addDays(last, 7).getTime();
  if (schedule.cadence === "biweekly") return addDays(last, 14).getTime();

  // monthly: next month's same day, clamped.
  return monthlyAnchorIn(
    last.getFullYear(),
    last.getMonth() + 1,
    schedule.dayOfCycle,
  ).getTime();
}

/** Cycle is due if the current anchor has hit and we haven't paid for it. */
export function isDue(schedule: MemberSchedule, now: Date = new Date()): boolean {
  if (schedule.cadence === "test") {
    if ((schedule.runsRemaining ?? 0) <= 0) return false;
    return testNextFireMs(schedule) <= now.getTime();
  }
  const anchor = lastAnchorMs(schedule, now);
  return (schedule.lastPaidAt ?? 0) < anchor;
}

export function describeSchedule(schedule: MemberSchedule): string {
  if (schedule.cadence === "daily") return "Every day";
  if (schedule.cadence === "test") {
    const interval = schedule.intervalSec ?? 60;
    const left = schedule.runsRemaining ?? 0;
    if (left <= 0) return `Test · complete`;
    return `Test · every ${interval}s · ${left} run${left === 1 ? "" : "s"} left`;
  }
  if (schedule.cadence === "weekly") {
    return `Every ${WEEKDAY_LABELS[schedule.dayOfCycle] ?? "week"}`;
  }
  if (schedule.cadence === "biweekly") {
    const dow = schedule.dayOfCycle % 7;
    return `Every other ${WEEKDAY_LABELS[dow] ?? "week"}`;
  }
  return `Monthly on the ${ordinal(schedule.dayOfCycle)}`;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
