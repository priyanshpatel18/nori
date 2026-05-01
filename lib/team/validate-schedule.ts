import { getShieldTokenByMint } from "@/lib/cloak/tokens";

import {
  TEST_INTERVAL_MAX_SEC,
  TEST_INTERVAL_MIN_SEC,
  TEST_RUNS_MAX,
  TEST_RUNS_MIN,
  dayOfCycleMax,
  dayOfCycleMin,
} from "./schedule";
import type { MemberSchedule, ScheduleCadence } from "./types";

export type ScheduleDraft = {
  cadence: ScheduleCadence;
  dayOfCycle: number;
  amount: string;
  mint: string;
  intervalSec?: number;
  runsRemaining?: number;
};

export type ScheduleDraftErrors = Partial<{
  cadence: string;
  dayOfCycle: string;
  amount: string;
  mint: string;
  intervalSec: string;
  runsRemaining: string;
}>;

const MIN_AMOUNT = 0.01;
const CADENCES: ScheduleCadence[] = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "test",
];

export function validateScheduleDraft(
  draft: ScheduleDraft,
): ScheduleDraftErrors {
  const errors: ScheduleDraftErrors = {};

  if (!CADENCES.includes(draft.cadence)) {
    errors.cadence = "Pick a cadence";
  }

  // Daily and test cadences ignore dayOfCycle, so skip that check.
  const skipDayCheck = draft.cadence === "daily" || draft.cadence === "test";
  if (
    !skipDayCheck &&
    (!Number.isInteger(draft.dayOfCycle) ||
      draft.dayOfCycle < dayOfCycleMin(draft.cadence) ||
      draft.dayOfCycle > dayOfCycleMax(draft.cadence))
  ) {
    errors.dayOfCycle = "Pick a day in the cycle";
  }

  if (draft.cadence === "test") {
    if (
      !Number.isInteger(draft.intervalSec) ||
      (draft.intervalSec ?? 0) < TEST_INTERVAL_MIN_SEC ||
      (draft.intervalSec ?? 0) > TEST_INTERVAL_MAX_SEC
    ) {
      errors.intervalSec = `Interval must be ${TEST_INTERVAL_MIN_SEC}–${TEST_INTERVAL_MAX_SEC}s`;
    }
    if (
      !Number.isInteger(draft.runsRemaining) ||
      (draft.runsRemaining ?? 0) < TEST_RUNS_MIN ||
      (draft.runsRemaining ?? 0) > TEST_RUNS_MAX
    ) {
      errors.runsRemaining = `Runs must be ${TEST_RUNS_MIN}–${TEST_RUNS_MAX}`;
    }
  }

  const token = getShieldTokenByMint(draft.mint);
  if (!token) {
    errors.mint = "Token is not available on this network";
  }

  const amount = draft.amount.trim();
  if (!amount) {
    errors.amount = "Amount is required";
  } else if (!/^\d*\.?\d*$/.test(amount) || amount === ".") {
    errors.amount = "Amount must be a number";
  } else {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      errors.amount = "Amount must be greater than zero";
    } else if (numeric < MIN_AMOUNT) {
      errors.amount = `Below minimum (${MIN_AMOUNT})`;
    } else if (token) {
      const dot = amount.indexOf(".");
      const decimals = dot === -1 ? 0 : amount.length - dot - 1;
      if (decimals > token.decimals) {
        errors.amount = `Up to ${token.decimals} decimal places`;
      }
    }
  }

  return errors;
}

export function hasScheduleErrors(errors: ScheduleDraftErrors): boolean {
  return Object.values(errors).some((v) => Boolean(v));
}

export function toMemberSchedule(draft: ScheduleDraft): Omit<
  MemberSchedule,
  "lastPaidAt"
> {
  return {
    cadence: draft.cadence,
    dayOfCycle: draft.dayOfCycle,
    amount: draft.amount.trim(),
    mint: draft.mint,
    ...(draft.cadence === "test"
      ? {
          intervalSec: draft.intervalSec,
          runsRemaining: draft.runsRemaining,
        }
      : null),
  };
}
