"use client";

import * as React from "react";

import { getShieldTokenByMint, type ShieldToken } from "@/lib/cloak/tokens";

import { isDue } from "./schedule";
import type { TeamMember } from "./types";
import { useTeam } from "./use-team";

/** Group of due members that share the same SPL mint. */
export type DueGroup = {
  mint: string;
  token: ShieldToken;
  members: TeamMember[];
};

const TICK_MS = 5_000;

export function useDueMembers(): {
  members: TeamMember[];
  groups: DueGroup[];
  total: number;
  ready: boolean;
} {
  const { members, ready } = useTeam();
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const due = React.useMemo(() => {
    void tick; // re-evaluate when the ticker fires
    const now = new Date();
    return members.filter((m) => m.schedule && isDue(m.schedule, now));
  }, [members, tick]);

  const groups = React.useMemo(() => {
    const byMint = new Map<string, TeamMember[]>();
    for (const m of due) {
      if (!m.schedule) continue;
      const arr = byMint.get(m.schedule.mint) ?? [];
      arr.push(m);
      byMint.set(m.schedule.mint, arr);
    }
    const result: DueGroup[] = [];
    for (const [mint, members] of byMint) {
      const token = getShieldTokenByMint(mint);
      // Skip groups whose token isn't available on this cluster — the user
      // can't pay them anyway. They stay visible on the team list with the
      // "unavailable" pill.
      if (!token) continue;
      result.push({ mint, token, members });
    }
    return result;
  }, [due]);

  const total = due.length;

  return { members: due, groups, total, ready };
}
