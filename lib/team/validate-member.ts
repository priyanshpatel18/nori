import { isAddress } from "@solana/kit";

import { getShieldToken, type ShieldTokenId } from "@/lib/cloak/tokens";

import type { TeamMemberDraft } from "./types";

export type MemberDraftErrors = Partial<{
  name: string;
  wallet: string;
  amount: string;
  token: string;
}>;

const MIN_AMOUNT = 0.01;

export function validateMemberDraft(
  draft: TeamMemberDraft,
  options?: { existing?: { id: string; wallet: string }[]; editingId?: string },
): MemberDraftErrors {
  const errors: MemberDraftErrors = {};

  const name = draft.name.trim();
  if (!name) errors.name = "Name is required";
  else if (name.length > 64) errors.name = "Up to 64 characters";

  const wallet = draft.wallet.trim();
  if (!wallet) {
    errors.wallet = "Wallet is required";
  } else if (wallet.length < 32 || wallet.length > 44 || !isAddress(wallet)) {
    errors.wallet = "Not a valid Solana address";
  } else if (options?.existing) {
    const dup = options.existing.find(
      (m) => m.wallet === wallet && m.id !== options.editingId,
    );
    if (dup) errors.wallet = "Already in your team";
  }

  const token = draft.token as ShieldTokenId;
  const shieldToken = getShieldToken(token);
  if (!shieldToken) {
    errors.token = `${token} is not available on this network`;
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
    } else if (shieldToken) {
      const dot = amount.indexOf(".");
      const decimals = dot === -1 ? 0 : amount.length - dot - 1;
      if (decimals > shieldToken.decimals) {
        errors.amount = `Up to ${shieldToken.decimals} decimal places`;
      }
    }
  }

  return errors;
}

export function hasErrors(errors: MemberDraftErrors): boolean {
  return Object.values(errors).some((v) => Boolean(v));
}
