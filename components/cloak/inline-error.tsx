import { formatCloakError } from "@/lib/cloak/errors";
import { cn } from "@/lib/utils";

export function InlineError({
  err,
  className,
}: {
  err: unknown;
  className?: string;
}) {
  const ui = formatCloakError(err);
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-0.5 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-[12.5px] text-destructive",
        className,
      )}
    >
      <span className="font-medium">{ui.title}</span>
      <span className="text-destructive/80">{ui.message}</span>
      {ui.suggestion && (
        <span className="text-[11.5px] text-destructive/70">{ui.suggestion}</span>
      )}
    </div>
  );
}
