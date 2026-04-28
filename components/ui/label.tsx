import * as React from "react";

import { cn } from "@/lib/utils";

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  hint?: React.ReactNode;
  required?: boolean;
};

export function Label({
  className,
  children,
  hint,
  required,
  ...props
}: LabelProps) {
  return (
    <label
      className={cn(
        "flex items-center gap-1.5 text-[13px] font-medium leading-none text-foreground",
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {required ? (
        <span aria-hidden="true" className="text-primary">
          *
        </span>
      ) : null}
      {hint ? (
        <span className="ml-auto text-[11px] font-normal tracking-wide text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
