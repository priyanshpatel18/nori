"use client";

import {
  Add01Icon,
  Alert02Icon,
  Delete02Icon,
  PencilEdit02Icon,
  Search01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { SolanaLogo, UsdcLogo, UsdtLogo } from "@/components/logos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FancyButton } from "@/components/ui/fancy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isShieldTokenSupported,
  type ShieldTokenId,
} from "@/lib/cloak/tokens";
import { solanaConfig } from "@/lib/solana/config";
import {
  addMember,
  deleteMember,
  updateMember,
} from "@/lib/team/storage";
import { useTeam } from "@/lib/team/use-team";
import {
  hasErrors,
  validateMemberDraft,
  type MemberDraftErrors,
} from "@/lib/team/validate-member";
import type { TeamMember, TeamMemberDraft } from "@/lib/team/types";
import { cn } from "@/lib/utils";

const TOKEN_OPTIONS: {
  id: ShieldTokenId;
  label: string;
  Logo: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "USDC", label: "USDC", Logo: UsdcLogo },
  { id: "USDT", label: "USDT", Logo: UsdtLogo },
  { id: "SOL", label: "SOL", Logo: SolanaLogo },
];

function TokenIcon({
  id,
  className,
}: {
  id: ShieldTokenId;
  className?: string;
}) {
  switch (id) {
    case "SOL":
      return <SolanaLogo className={className} />;
    case "USDT":
      return <UsdtLogo className={className} />;
    case "USDC":
    default:
      return <UsdcLogo className={className} />;
  }
}

type DialogState =
  | { kind: "closed" }
  | { kind: "add" }
  | { kind: "edit"; member: TeamMember }
  | { kind: "delete"; member: TeamMember };

export default function TeamPage() {
  const { members, ready } = useTeam();
  const [query, setQuery] = React.useState("");
  const [dialog, setDialog] = React.useState<DialogState>({ kind: "closed" });

  const filtered = React.useMemo(() => {
    if (!query) return members;
    const q = query.toLowerCase();
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.wallet.toLowerCase().includes(q) ||
        m.note?.toLowerCase().includes(q),
    );
  }, [members, query]);

  const closeDialog = () => setDialog({ kind: "closed" });

  const isFormOpen = dialog.kind === "add" || dialog.kind === "edit";
  const isDeleteOpen = dialog.kind === "delete";

  return (
    <>
      <PageHeader
        eyebrow="Saved recipients"
        title="Team"
        description="Save people you pay often. Attach a schedule and Nori will surface what's due each cycle."
        actions={
          members.length > 0 ? (
            <FancyButton
              type="button"
              variant="primary"
              size="md"
              onClick={() => setDialog({ kind: "add" })}
            >
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2.2} />
              Add member
            </FancyButton>
          ) : undefined
        }
      />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-8">
        {ready && members.length > 0 && (
          <div className="sm:max-w-sm sm:self-end">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, wallet, or note"
              leadingIcon={
                <HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={1.8} />
              }
            />
          </div>
        )}

        {ready && members.length === 0 && (
          <EmptyState onAdd={() => setDialog({ kind: "add" })} />
        )}

        {ready && members.length > 0 && (
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {filtered.map((m, i) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  index={i}
                  onEdit={() => setDialog({ kind: "edit", member: m })}
                  onDelete={() => setDialog({ kind: "delete", member: m })}
                />
              ))}
            </AnimatePresence>

            {filtered.length === 0 && (
              <li className="grid place-items-center gap-1.5 rounded-xl border border-dashed border-border bg-card/30 px-6 py-10 text-center">
                <p className="text-[13.5px] text-foreground">No matches</p>
                <p className="text-[12px] text-muted-foreground">
                  Try a different filter or clear your search.
                </p>
              </li>
            )}
          </ul>
        )}
      </div>

      <MemberDialog
        open={isFormOpen}
        mode={dialog.kind === "edit" ? "edit" : "add"}
        member={dialog.kind === "edit" ? dialog.member : undefined}
        existing={members}
        onClose={closeDialog}
      />

      <DeleteDialog
        open={isDeleteOpen}
        member={dialog.kind === "delete" ? dialog.member : undefined}
        onClose={closeDialog}
      />
    </>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="grid place-items-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 px-8 py-14 text-center"
    >
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"
      >
        <HugeiconsIcon icon={UserGroupIcon} size={20} strokeWidth={1.6} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-medium text-foreground">
          Save your team
        </p>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          Add people you pay regularly. Each member gets a default amount and
          token, so payroll is one click instead of a CSV.
        </p>
      </div>
      <FancyButton
        type="button"
        variant="primary"
        size="md"
        onClick={onAdd}
        className="mt-1"
      >
        <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2.2} />
        Add first member
      </FancyButton>
    </motion.div>
  );
}

function MemberRow({
  member,
  index,
  onEdit,
  onDelete,
}: {
  member: TeamMember;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const supported = isShieldTokenSupported(member.token);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{
        duration: 0.28,
        delay: Math.min(index, 8) * 0.02,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card/60 p-3 transition-colors hover:bg-card/80 sm:gap-4 sm:p-4"
    >
      <Avatar name={member.name} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-[14px] font-medium text-foreground">
            {member.name}
          </p>
          {!supported && (
            <span
              title={`${member.token} is not available on ${solanaConfig.cluster}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10.5px] font-medium text-destructive"
            >
              <HugeiconsIcon icon={Alert02Icon} size={10} strokeWidth={2.2} />
              {member.token} unavailable
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate font-mono text-[12px] text-muted-foreground">
          {shortAddr(member.wallet)}
        </p>
        {member.note && (
          <p className="mt-1 truncate text-[12px] text-muted-foreground/80">
            {member.note}
          </p>
        )}
      </div>

      <div className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background/40 px-2.5 py-1.5 text-[12.5px] text-foreground sm:inline-flex">
        <TokenIcon id={member.token} className="size-3.5" />
        <span className="font-mono">{member.amount}</span>
        <span className="text-muted-foreground">{member.token}</span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          aria-label={`Edit ${member.name}`}
        >
          <HugeiconsIcon
            icon={PencilEdit02Icon}
            size={14}
            strokeWidth={1.8}
          />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label={`Delete ${member.name}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.8} />
        </Button>
      </div>
    </motion.li>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = React.useMemo(() => initialsOf(name), [name]);
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-[12px] font-medium text-primary"
    >
      {initials}
    </span>
  );
}

function MemberDialog({
  open,
  mode,
  member,
  existing,
  onClose,
}: {
  open: boolean;
  mode: "add" | "edit";
  member?: TeamMember;
  existing: TeamMember[];
  onClose: () => void;
}) {
  const formKey = `${mode}:${member?.id ?? "new"}`;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? "Add member" : "Edit member"}
          </DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Save a recipient with a default token and amount. You can attach a schedule next."
              : "Update the saved recipient. Existing payments aren't affected."}
          </DialogDescription>
        </DialogHeader>

        {open && (
          <MemberForm
            key={formKey}
            mode={mode}
            member={member}
            existing={existing}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MemberForm({
  mode,
  member,
  existing,
  onClose,
}: {
  mode: "add" | "edit";
  member?: TeamMember;
  existing: TeamMember[];
  onClose: () => void;
}) {
  const [draft, setDraft] = React.useState<TeamMemberDraft>(() =>
    initialDraft(member),
  );
  const [errors, setErrors] = React.useState<MemberDraftErrors>({});
  const [submitted, setSubmitted] = React.useState(false);

  const setField = <K extends keyof TeamMemberDraft>(
    key: K,
    value: TeamMemberDraft[K],
  ) => {
    setDraft((d) => {
      const nextDraft = { ...d, [key]: value };
      if (submitted) {
        setErrors(
          validateMemberDraft(nextDraft, {
            existing,
            editingId: member?.id,
          }),
        );
      }
      return nextDraft;
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const nextErrors = validateMemberDraft(draft, {
      existing,
      editingId: member?.id,
    });
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    if (mode === "add") {
      addMember(solanaConfig.cluster, draft);
    } else if (member) {
      updateMember(solanaConfig.cluster, member.id, draft);
    }
    onClose();
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      <Field label="Name" error={errors.name} required>
        <Input
          value={draft.name}
          onChange={(e) => setField("name", e.target.value)}
          placeholder="Ada Lovelace"
          invalid={Boolean(errors.name)}
          autoFocus
          maxLength={64}
        />
      </Field>

      <Field label="Wallet" error={errors.wallet} required>
        <Input
          value={draft.wallet}
          onChange={(e) => setField("wallet", e.target.value)}
          placeholder="Solana address"
          invalid={Boolean(errors.wallet)}
          spellCheck={false}
          autoComplete="off"
          className="font-mono text-[13px]"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <Field label="Default amount" error={errors.amount} required>
          <label
            data-invalid={errors.amount ? "true" : undefined}
            className={cn(
              "flex h-11 w-full cursor-text items-center gap-2 rounded-xl border border-border bg-input/60 px-3.5",
              "shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--foreground)_4%,transparent)]",
              "transition-colors focus-within:border-ring focus-within:bg-input",
              "data-[invalid=true]:border-destructive data-[invalid=true]:focus-within:border-destructive",
            )}
          >
            <input
              value={draft.amount}
              onChange={(e) => setField("amount", e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="h-full w-full min-w-0 bg-transparent font-mono text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
              <TokenIcon id={draft.token} className="size-3.5" />
              {draft.token}
            </span>
          </label>
        </Field>

        <Field label="Token" error={errors.token}>
          <TokenPicker
            value={draft.token}
            onChange={(t) => setField("token", t)}
          />
        </Field>
      </div>

      <Field label="Note" error={undefined}>
        <Input
          value={draft.note ?? ""}
          onChange={(e) => setField("note", e.target.value)}
          placeholder="Optional. e.g. Engineering, contractor invoice."
          maxLength={140}
        />
      </Field>

      <DialogFooter className="mt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <FancyButton type="submit" variant="primary" size="md">
          {mode === "add" ? "Save member" : "Save changes"}
        </FancyButton>
      </DialogFooter>
    </form>
  );
}

function TokenPicker({
  value,
  onChange,
}: {
  value: ShieldTokenId;
  onChange: (id: ShieldTokenId) => void;
}) {
  return (
    <div className="flex h-11 items-center gap-1 rounded-xl border border-border bg-input/60 p-1">
      {TOKEN_OPTIONS.map((t) => {
        const isActive = value === t.id;
        const supported = isShieldTokenSupported(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            disabled={!supported}
            title={
              supported
                ? t.label
                : `${t.label} not available on ${solanaConfig.cluster}`
            }
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
              !supported && "opacity-40",
            )}
          >
            {isActive && (
              <motion.span
                layoutId="team-token-active"
                aria-hidden="true"
                className="absolute inset-0 -z-0 rounded-lg bg-secondary"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <t.Logo className="size-3.5" />
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label required={required}>{label}</Label>
      {children}
      {error && (
        <p className="flex items-center gap-1.5 text-[11.5px] text-destructive">
          <HugeiconsIcon icon={Alert02Icon} size={11} strokeWidth={2.2} />
          {error}
        </p>
      )}
    </div>
  );
}

function DeleteDialog({
  open,
  member,
  onClose,
}: {
  open: boolean;
  member?: TeamMember;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove member</DialogTitle>
          <DialogDescription>
            {member ? (
              <>
                <span className="font-medium text-foreground">
                  {member.name}
                </span>{" "}
                will be removed from your team. Past payments stay in your
                history.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (member) deleteMember(solanaConfig.cluster, member.id);
              onClose();
            }}
          >
            <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.8} />
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function defaultToken(): ShieldTokenId {
  if (isShieldTokenSupported("USDC")) return "USDC";
  if (isShieldTokenSupported("USDT")) return "USDT";
  return "SOL";
}

function initialDraft(member?: TeamMember): TeamMemberDraft {
  if (member) {
    return {
      name: member.name,
      wallet: member.wallet,
      token: member.token,
      amount: member.amount,
      note: member.note ?? "",
    };
  }
  return {
    name: "",
    wallet: "",
    token: defaultToken(),
    amount: "",
    note: "",
  };
}

function shortAddr(s: string): string {
  if (!s) return "";
  if (s.length <= 14) return s;
  return `${s.slice(0, 6)}…${s.slice(-6)}`;
}

function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
