import type { SolanaCluster } from "@/lib/solana/config";

import type { TeamMember, TeamMemberDraft } from "./types";

const STORAGE_PREFIX = "nori:team:v1";
const STORAGE_EVENT = "nori:team-updated";

function key(cluster: SolanaCluster): string {
  return `${STORAGE_PREFIX}:${cluster}`;
}

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

export function loadTeam(cluster: SolanaCluster): TeamMember[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(key(cluster));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTeamMember);
  } catch {
    return [];
  }
}

function persist(cluster: SolanaCluster, members: TeamMember[]): TeamMember[] {
  if (!isBrowser()) return members;
  try {
    window.localStorage.setItem(key(cluster), JSON.stringify(members));
    window.dispatchEvent(
      new CustomEvent(STORAGE_EVENT, { detail: { cluster } }),
    );
  } catch {
    // ignore quota / serialization errors
  }
  return members;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function addMember(
  cluster: SolanaCluster,
  draft: TeamMemberDraft,
): TeamMember {
  const now = Date.now();
  const member: TeamMember = {
    id: newId(),
    name: draft.name.trim(),
    wallet: draft.wallet.trim(),
    token: draft.token,
    amount: draft.amount.trim(),
    note: draft.note?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  const next = [member, ...loadTeam(cluster)];
  persist(cluster, next);
  return member;
}

export function updateMember(
  cluster: SolanaCluster,
  id: string,
  patch: Partial<TeamMemberDraft>,
): TeamMember | null {
  const current = loadTeam(cluster);
  const idx = current.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  const existing = current[idx];
  const updated: TeamMember = {
    ...existing,
    name: patch.name !== undefined ? patch.name.trim() : existing.name,
    wallet: patch.wallet !== undefined ? patch.wallet.trim() : existing.wallet,
    token: patch.token ?? existing.token,
    amount: patch.amount !== undefined ? patch.amount.trim() : existing.amount,
    note:
      patch.note !== undefined
        ? patch.note.trim() || undefined
        : existing.note,
    updatedAt: Date.now(),
  };
  const next = [...current];
  next[idx] = updated;
  persist(cluster, next);
  return updated;
}

export function deleteMember(cluster: SolanaCluster, id: string): void {
  const current = loadTeam(cluster);
  const next = current.filter((m) => m.id !== id);
  if (next.length === current.length) return;
  persist(cluster, next);
}

export function teamStorageEvent(): string {
  return STORAGE_EVENT;
}

function isTeamMember(value: unknown): value is TeamMember {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    typeof r.wallet === "string" &&
    typeof r.token === "string" &&
    typeof r.amount === "string" &&
    typeof r.createdAt === "number" &&
    typeof r.updatedAt === "number"
  );
}
