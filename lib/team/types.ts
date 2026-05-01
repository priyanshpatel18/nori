import type { ShieldTokenId } from "@/lib/cloak/tokens";

export type ScheduleCadence = "weekly" | "biweekly" | "monthly";

export type MemberSchedule = {
  cadence: ScheduleCadence;
  // First payment date (epoch ms, midnight local).
  startDate: number;
  // Set after a successful run; lets the dashboard compute the next due date.
  lastPaidAt?: number;
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
