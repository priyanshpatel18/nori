"use client";

import * as React from "react";

import { solanaConfig } from "@/lib/solana/config";

import { loadTeam, teamStorageEvent } from "./storage";
import type { TeamMember } from "./types";

const EMPTY: TeamMember[] = [];

export function useTeam(): { members: TeamMember[]; ready: boolean } {
  const subscribe = React.useCallback((notify: () => void) => {
    if (typeof window === "undefined") return () => {};
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<{ cluster: string }>).detail;
      if (!detail || detail.cluster === solanaConfig.cluster) notify();
    };
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key.startsWith("nori:team:v1:")) notify();
    };
    const ev = teamStorageEvent();
    window.addEventListener(ev, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ev, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const cacheRef = React.useRef<{
    serialized: string;
    value: TeamMember[];
  }>({ serialized: "[]", value: EMPTY });

  const getSnapshot = React.useCallback(() => {
    if (typeof window === "undefined") return EMPTY;
    const fresh = loadTeam(solanaConfig.cluster);
    const serialized = JSON.stringify(fresh);
    if (cacheRef.current.serialized === serialized) {
      return cacheRef.current.value;
    }
    cacheRef.current = { serialized, value: fresh };
    return fresh;
  }, []);

  const members = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY,
  );

  const ready = typeof window !== "undefined";
  return { members, ready };
}
