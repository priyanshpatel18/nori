import * as React from "react";

import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  invalid?: boolean;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    { className, leadingIcon, trailingIcon, invalid, type = "text", ...props },
    ref,
  ) {
    return (
      <div
        data-slot="input-root"
        data-invalid={invalid ? "true" : undefined}
        className={cn(
          "group/input relative flex h-11 w-full items-center gap-2 rounded-xl",
          "border border-border bg-input/60 px-3.5",
          "shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--foreground)_4%,transparent)]",
          "transition-colors",
          "focus-within:border-ring focus-within:bg-input",
          "data-[invalid=true]:border-destructive data-[invalid=true]:focus-within:border-destructive",
          className,
        )}
      >
        {leadingIcon ? (
          <span className="grid size-4 shrink-0 place-items-center text-muted-foreground group-focus-within/input:text-foreground">
            {leadingIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          type={type}
          className={cn(
            "h-full w-full min-w-0 bg-transparent text-[14px] text-foreground outline-none",
            "placeholder:text-muted-foreground",
            "[&::-webkit-search-cancel-button]:hidden",
          )}
          {...props}
        />
        {trailingIcon ? (
          <span className="grid size-4 shrink-0 place-items-center text-muted-foreground">
            {trailingIcon}
          </span>
        ) : null}
      </div>
    );
  },
);
