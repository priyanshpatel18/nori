import type { ShieldTokenId } from "@/lib/cloak/tokens";

export type ScheduleCadence =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "test";

export type MemberSchedule = {
  cadence: ScheduleCadence;
  // daily/test: 0 (unused). weekly: 0–6 (0 = Sunday). biweekly: 0–13 (day in
  // 14-day cycle anchored to Unix epoch's first Sunday, 1970-01-04). monthly:
  // 1–31 (day of month; values past the month's last day clamp to the last).
  dayOfCycle: number;
  // Per-payment amount as a decimal string, validated against the mint's
  // decimals at form time.
  amount: string;
  // SPL mint, base58. Native SOL uses NATIVE_SOL_MINT.
  mint: string;
  // Set after a successful run; lets the dashboard tell when a cycle is due.
  lastPaidAt?: number;
  // Test cadence only: fires every intervalSec, decrementing runsRemaining
  // each time markMemberPaid runs. When runsRemaining hits 0 the schedule
  // stops firing but stays around so users can see "Test complete".
  intervalSec?: number;
  runsRemaining?: number;
};

export type TeamMember = {
  id: string;
  name: string;
  wallet: string;
  token: ShieldTokenId;
  // Decimal string (e.g. "1500.00"), validated against the token's decimals.
  amount: string;
  note?: string;
  schedule?: MemberSchedule;
  createdAt: number;
  updatedAt: number;
};

export type TeamMemberDraft = {
  name: string;
  wallet: string;
  token: ShieldTokenId;
  amount: string;
  note?: string;
};
