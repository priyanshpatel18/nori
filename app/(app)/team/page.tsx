"use client";

import {
  Add01Icon,
  Alert02Icon,
  Calendar03Icon,
  CheckmarkCircle01Icon,
  Delete02Icon,
  PencilEdit02Icon,
  ReloadIcon,
  Search01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { SolanaLogo, UsdcLogo, UsdtLogo } from "@/components/logos";
import { DueBanner } from "@/components/team/due-banner";
import { DueRunDialog } from "@/components/team/due-run-dialog";
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
  getShieldToken,
  getShieldTokenByMint,
  isShieldTokenSupported,
  type ShieldTokenId,
} from "@/lib/cloak/tokens";
import { solanaConfig } from "@/lib/solana/config";
import {
  addMember,
  clearSchedule,
  deleteMember,
  setSchedule,
  updateMember,
} from "@/lib/team/storage";
import {
  WEEKDAY_LABELS,
  biweeklyIndex,
  describeSchedule,
  isDue,
  nextBiweeklyIndexForDow,
  ordinal,
} from "@/lib/team/schedule";
import { useDueMembers } from "@/lib/team/use-due-members";
import { useTeam } from "@/lib/team/use-team";
import {
  hasErrors,
  validateMemberDraft,
  type MemberDraftErrors,
} from "@/lib/team/validate-member";
import {
  hasScheduleErrors,
  validateScheduleDraft,
  type ScheduleDraftErrors,
} from "@/lib/team/validate-schedule";
import type {
  MemberSchedule,
  ScheduleCadence,
  TeamMember,
  TeamMemberDraft,
} from "@/lib/team/types";
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
  const due = useDueMembers();
  const [query, setQuery] = React.useState("");
  const [dialog, setDialog] = React.useState<DialogState>({ kind: "closed" });
  const [runOpen, setRunOpen] = React.useState(false);

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
        <DueBanner
          total={due.total}
          groups={due.groups}
          onRunNow={() => setRunOpen(true)}
        />

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
          <ul
            className={cn(
              "flex flex-col gap-2",
              // After 6 members the list scrolls internally so the page never
              // exceeds the viewport. Pre-roll: row is ~78px + 8px gap.
              members.length > 6 &&
                "scrollbar-cloak max-h-[520px] overflow-y-auto pr-1",
            )}
          >
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

      <DueRunDialog
        open={runOpen}
        groups={due.groups}
        onClose={() => setRunOpen(false)}
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
          {member.schedule && <ScheduleBadge schedule={member.schedule} />}
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
        {member.schedule?.lastPaidAt && (
          <PaidIndicator lastPaidAt={member.schedule.lastPaidAt} />
        )}
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

function ScheduleBadge({ schedule }: { schedule: MemberSchedule }) {
  const due = isDue(schedule);
  const label = describeSchedule(schedule);
  return (
    <span
      title={
        due
          ? `${label} · due now`
          : schedule.lastPaidAt
            ? `${label} · last paid ${formatRelativeDate(schedule.lastPaidAt)}`
            : `${label} · awaiting first run`
      }
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
        due
          ? "border-primary/40 bg-primary/15 text-primary"
          : "border-border bg-background/40 text-muted-foreground",
      )}
    >
      <HugeiconsIcon icon={Calendar03Icon} size={10} strokeWidth={2.2} />
      {due ? "Due now" : shortScheduleLabel(schedule)}
    </span>
  );
}

function shortScheduleLabel(s: MemberSchedule): string {
  if (s.cadence === "daily") return "Daily";
  if (s.cadence === "test") {
    const left = s.runsRemaining ?? 0;
    return left > 0 ? `Test · ${left} left` : "Test · done";
  }
  if (s.cadence === "weekly") {
    return `Weekly · ${WEEKDAY_LABELS[s.dayOfCycle]?.slice(0, 3) ?? ""}`;
  }
  if (s.cadence === "biweekly") {
    return `Biweekly · ${WEEKDAY_LABELS[s.dayOfCycle % 7]?.slice(0, 3) ?? ""}`;
  }
  return `Monthly · ${ordinal(s.dayOfCycle)}`;
}

function formatRelativeDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatRelativePast(ms: number, now: number = Date.now()): string {
  const delta = Math.max(0, now - ms);
  const sec = Math.floor(delta / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return formatRelativeDate(ms);
}

function PaidIndicator({ lastPaidAt }: { lastPaidAt: number }) {
  // Tick every 15s while the row is mounted so "12s ago" → "27s ago" updates
  // without re-rendering the whole team list each second.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const recent = now - lastPaidAt < 60_000;
  return (
    <p
      className={cn(
        "mt-1 flex items-center gap-1 text-[11.5px]",
        recent ? "text-primary" : "text-muted-foreground/80",
      )}
    >
      <HugeiconsIcon
        icon={CheckmarkCircle01Icon}
        size={10}
        strokeWidth={2.4}
      />
      Paid {formatRelativePast(lastPaidAt, now)}
    </p>
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

type ScheduleFormState = {
  on: boolean;
  cadence: ScheduleCadence;
  dayOfCycle: number;
  amount: string;
  tokenId: ShieldTokenId;
  intervalSec: number;
  runsRemaining: number;
};

const TEST_DEFAULTS = { intervalSec: 30, runsRemaining: 2 };

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
  const [schedule, setScheduleState] = React.useState<ScheduleFormState>(() =>
    initialSchedule(member, draft),
  );
  const [scheduleErrors, setScheduleErrors] =
    React.useState<ScheduleDraftErrors>({});
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

  const setScheduleField = <K extends keyof ScheduleFormState>(
    key: K,
    value: ScheduleFormState[K],
  ) => {
    setScheduleState((s) => {
      const next = { ...s, [key]: value };
      if (submitted && next.on) {
        const mint = mintForTokenId(next.tokenId);
        setScheduleErrors(
          validateScheduleDraft({
            cadence: next.cadence,
            dayOfCycle: next.dayOfCycle,
            amount: next.amount,
            mint,
            intervalSec: next.intervalSec,
            runsRemaining: next.runsRemaining,
          }),
        );
      }
      return next;
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);

    const memberErrs = validateMemberDraft(draft, {
      existing,
      editingId: member?.id,
    });
    setErrors(memberErrs);

    let scheduleErrs: ScheduleDraftErrors = {};
    if (schedule.on) {
      scheduleErrs = validateScheduleDraft({
        cadence: schedule.cadence,
        dayOfCycle: schedule.dayOfCycle,
        amount: schedule.amount,
        mint: mintForTokenId(schedule.tokenId),
        intervalSec: schedule.intervalSec,
        runsRemaining: schedule.runsRemaining,
      });
      setScheduleErrors(scheduleErrs);
    } else {
      setScheduleErrors({});
    }

    if (hasErrors(memberErrs) || hasScheduleErrors(scheduleErrs)) return;

    let memberId: string | undefined;
    if (mode === "add") {
      memberId = addMember(solanaConfig.cluster, draft).id;
    } else if (member) {
      memberId = member.id;
      updateMember(solanaConfig.cluster, member.id, draft);
    }

    if (memberId) {
      if (schedule.on) {
        setSchedule(solanaConfig.cluster, memberId, {
          cadence: schedule.cadence,
          dayOfCycle: schedule.dayOfCycle,
          amount: schedule.amount,
          mint: mintForTokenId(schedule.tokenId),
          ...(schedule.cadence === "test"
            ? {
                intervalSec: schedule.intervalSec,
                runsRemaining: schedule.runsRemaining,
              }
            : null),
        });
      } else if (member?.schedule) {
        clearSchedule(solanaConfig.cluster, memberId);
      }
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
          <AmountWithToken
            amount={draft.amount}
            tokenId={draft.token}
            invalid={Boolean(errors.amount)}
            onAmountChange={(v) => setField("amount", v)}
          />
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

      <ScheduleSection
        state={schedule}
        errors={scheduleErrors}
        defaultAmount={draft.amount}
        defaultToken={draft.token}
        onToggle={(on) =>
          setScheduleState((s) => ({
            ...s,
            on,
            // Pre-fill from member defaults the first time the toggle is on.
            ...(on && !s.amount
              ? { amount: draft.amount, tokenId: draft.token }
              : null),
          }))
        }
        onSetField={setScheduleField}
      />

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

function AmountWithToken({
  amount,
  tokenId,
  invalid,
  onAmountChange,
}: {
  amount: string;
  tokenId: ShieldTokenId;
  invalid?: boolean;
  onAmountChange: (v: string) => void;
}) {
  return (
    <label
      data-invalid={invalid ? "true" : undefined}
      className={cn(
        "flex h-11 w-full cursor-text items-center gap-2 rounded-xl border border-border bg-input/60 px-3.5",
        "shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--foreground)_4%,transparent)]",
        "transition-colors focus-within:border-ring focus-within:bg-input",
        "data-[invalid=true]:border-destructive data-[invalid=true]:focus-within:border-destructive",
      )}
    >
      <input
        value={amount}
        onChange={(e) => onAmountChange(e.target.value)}
        placeholder="0.00"
        inputMode="decimal"
        className="h-full w-full min-w-0 bg-transparent font-mono text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
      />
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
        <TokenIcon id={tokenId} className="size-3.5" />
        {tokenId}
      </span>
    </label>
  );
}

const CADENCES: { id: ScheduleCadence; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "biweekly", label: "Biweekly" },
  { id: "monthly", label: "Monthly" },
  { id: "test", label: "Test" },
];

function ScheduleSection({
  state,
  errors,
  onToggle,
  onSetField,
}: {
  state: ScheduleFormState;
  errors: ScheduleDraftErrors;
  defaultAmount: string;
  defaultToken: ShieldTokenId;
  onToggle: (on: boolean) => void;
  onSetField: <K extends keyof ScheduleFormState>(
    key: K,
    value: ScheduleFormState[K],
  ) => void;
}) {
  const { on, cadence, dayOfCycle, amount, tokenId } = state;

  const onCadenceChange = (next: ScheduleCadence) => {
    if (next === cadence) return;
    // Re-anchor dayOfCycle to "today" for the new cadence so users see the
    // schedule starting on a sensible default rather than a value out of range.
    onSetField("cadence", next);
    onSetField("dayOfCycle", defaultDayForCadence(next));
    if (next === "test") {
      // Reset test counters whenever we enter test mode so a re-arm starts
      // from the configured run count, not 0.
      onSetField("intervalSec", TEST_DEFAULTS.intervalSec);
      onSetField("runsRemaining", TEST_DEFAULTS.runsRemaining);
    }
  };

  const onDowChange = (dow: number) => {
    if (cadence === "weekly") onSetField("dayOfCycle", dow);
    else if (cadence === "biweekly")
      onSetField("dayOfCycle", nextBiweeklyIndexForDow(dow));
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-input/30 p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary"
          >
            <HugeiconsIcon icon={ReloadIcon} size={13} strokeWidth={1.8} />
          </span>
          <div className="flex flex-col">
            <p className="text-[13px] font-medium text-foreground">
              Recurring payment
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              {on
                ? describeSchedule({
                    cadence,
                    dayOfCycle,
                    amount,
                    mint: mintForTokenId(tokenId),
                  })
                : "Off — pay this person on demand."}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant={on ? "ghost" : "secondary"}
          size="sm"
          onClick={() => onToggle(!on)}
        >
          {on ? (
            "Remove"
          ) : (
            <>
              <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={2.2} />
              Add schedule
            </>
          )}
        </Button>
      </header>

      <AnimatePresence initial={false}>
        {on && (
          <motion.div
            key="body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-4 pt-2">
              <Field label="Cadence" error={errors.cadence}>
                <div className="flex h-10 items-center gap-1 rounded-xl border border-border bg-input/60 p-1">
                  {CADENCES.map((c) => {
                    const isActive = cadence === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onCadenceChange(c.id)}
                        className={cn(
                          "relative flex flex-1 items-center justify-center rounded-lg px-2 py-1 text-[12px] font-medium transition-colors",
                          isActive
                            ? "text-primary"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="team-cadence-active"
                            aria-hidden="true"
                            className="absolute inset-0 -z-0 rounded-lg border border-primary/40 bg-primary/15"
                            transition={{
                              type: "spring",
                              stiffness: 380,
                              damping: 30,
                            }}
                          />
                        )}
                        <span className="relative z-10">{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              </Field>

              {cadence === "monthly" && (
                <Field
                  label="Day of month"
                  error={errors.dayOfCycle}
                  hint={
                    <span className="font-mono text-[10.5px] text-muted-foreground">
                      Short months clamp to last day
                    </span>
                  }
                >
                  <MonthlyDayPicker
                    value={dayOfCycle}
                    onChange={(v) => onSetField("dayOfCycle", v)}
                  />
                </Field>
              )}

              {(cadence === "weekly" || cadence === "biweekly") && (
                <Field
                  label={cadence === "weekly" ? "Pay on" : "Every other"}
                  error={errors.dayOfCycle}
                >
                  <WeekdayPicker
                    value={dayOfCycle % 7}
                    onChange={onDowChange}
                  />
                </Field>
              )}

              {cadence === "daily" && (
                <p className="text-[12px] text-muted-foreground">
                  Pays once a day at midnight (local time).
                </p>
              )}

              {cadence === "test" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Every" error={errors.intervalSec}>
                    <SecondsInput
                      value={state.intervalSec}
                      onChange={(v) => onSetField("intervalSec", v)}
                      invalid={Boolean(errors.intervalSec)}
                    />
                  </Field>
                  <Field label="Total runs" error={errors.runsRemaining}>
                    <NumberInput
                      value={state.runsRemaining}
                      onChange={(v) => onSetField("runsRemaining", v)}
                      min={1}
                      max={100}
                      invalid={Boolean(errors.runsRemaining)}
                      suffix="runs"
                    />
                  </Field>
                  <p className="text-[11.5px] text-muted-foreground sm:col-span-2">
                    Test mode fires immediately on save, then every interval
                    until the run count is exhausted.
                  </p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                <Field label="Amount" error={errors.amount} required>
                  <AmountWithToken
                    amount={amount}
                    tokenId={tokenId}
                    invalid={Boolean(errors.amount)}
                    onAmountChange={(v) => onSetField("amount", v)}
                  />
                </Field>

                <Field label="Token" error={errors.mint}>
                  <TokenPicker
                    value={tokenId}
                    onChange={(t) => onSetField("tokenId", t)}
                  />
                </Field>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WeekdayPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {WEEKDAY_LABELS.map((label, i) => {
        const isActive = value === i;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onChange(i)}
            title={label}
            className={cn(
              "h-9 rounded-lg border text-[12px] font-medium transition-colors",
              isActive
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border bg-input/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {label.slice(0, 1)}
          </button>
        );
      })}
    </div>
  );
}

function MonthlyDayPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1 sm:grid-cols-10">
      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
        const isActive = value === d;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className={cn(
              "h-8 rounded-lg border font-mono text-[11.5px] transition-colors",
              isActive
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border bg-input/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {d}
          </button>
        );
      })}
    </div>
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
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors",
              isActive
                ? "text-foreground"
                : "text-muted-foreground/70 hover:text-foreground",
              !supported && "opacity-40",
            )}
          >
            <t.Logo
              className={cn(
                "size-3.5 transition-[filter,opacity] duration-200",
                !isActive && "opacity-50 grayscale",
              )}
            />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function SecondsInput({
  value,
  onChange,
  invalid,
}: {
  value: number;
  onChange: (v: number) => void;
  invalid?: boolean;
}) {
  return (
    <NumberInput
      value={value}
      onChange={onChange}
      min={5}
      max={3600}
      invalid={invalid}
      suffix="sec"
    />
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  invalid,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  invalid?: boolean;
  suffix?: string;
}) {
  return (
    <label
      data-invalid={invalid ? "true" : undefined}
      className={cn(
        "flex h-11 w-full cursor-text items-center gap-2 rounded-xl border border-border bg-input/60 px-3.5",
        "shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--foreground)_4%,transparent)]",
        "transition-colors focus-within:border-ring focus-within:bg-input",
        "data-[invalid=true]:border-destructive data-[invalid=true]:focus-within:border-destructive",
      )}
    >
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => {
          const next = Number(e.target.value);
          onChange(Number.isFinite(next) ? next : 0);
        }}
        className="h-full w-full min-w-0 bg-transparent font-mono text-[14px] text-foreground outline-none placeholder:text-muted-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0"
      />
      {suffix && (
        <span className="shrink-0 text-[12.5px] font-medium text-muted-foreground">
          {suffix}
        </span>
      )}
    </label>
  );
}

function Field({
  label,
  error,
  required,
  hint,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label required={required} hint={hint}>
        {label}
      </Label>
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

function mintForTokenId(id: ShieldTokenId): string {
  const t = getShieldToken(id);
  if (t) return t.mint.toBase58();
  // Token unsupported on this cluster — return a sentinel that the validator
  // will reject so the user sees the "unavailable" error explicitly.
  return "";
}

function defaultDayForCadence(cadence: ScheduleCadence): number {
  if (cadence === "daily" || cadence === "test") return 0;
  const now = new Date();
  if (cadence === "weekly") return now.getDay();
  if (cadence === "biweekly") return biweeklyIndex(now);
  return now.getDate();
}

function initialSchedule(
  member: TeamMember | undefined,
  draft: TeamMemberDraft,
): ScheduleFormState {
  if (member?.schedule) {
    const t = getShieldTokenByMint(member.schedule.mint);
    return {
      on: true,
      cadence: member.schedule.cadence,
      dayOfCycle: member.schedule.dayOfCycle,
      amount: member.schedule.amount,
      tokenId: t?.id ?? draft.token,
      intervalSec: member.schedule.intervalSec ?? TEST_DEFAULTS.intervalSec,
      runsRemaining:
        member.schedule.runsRemaining ?? TEST_DEFAULTS.runsRemaining,
    };
  }
  return {
    on: false,
    cadence: "monthly",
    dayOfCycle: defaultDayForCadence("monthly"),
    amount: "",
    tokenId: draft.token,
    intervalSec: TEST_DEFAULTS.intervalSec,
    runsRemaining: TEST_DEFAULTS.runsRemaining,
  };
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
