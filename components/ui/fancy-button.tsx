import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const fancyButton = cva(
  cn(
    "group/fb relative inline-flex shrink-0 items-center justify-center gap-1.5",
    "whitespace-nowrap rounded-xl text-sm font-medium tracking-tight",
    "transition-[transform,box-shadow,background] duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "active:translate-y-px",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ),
  {
    variants: {
      variant: {
        primary: cn(
          "bg-primary text-primary-foreground",
          "border border-primary/40",
          "shadow-[0_1px_0_0_color-mix(in_oklch,var(--foreground)_55%,transparent)_inset,0_8px_24px_-8px_color-mix(in_oklch,var(--primary)_55%,transparent)]",
          "hover:bg-primary/90",
          "hover:shadow-[0_1px_0_0_color-mix(in_oklch,var(--foreground)_70%,transparent)_inset,0_10px_28px_-8px_color-mix(in_oklch,var(--primary)_70%,transparent)]",
        ),
        neutral: cn(
          "text-foreground",
          "bg-secondary/60 hover:bg-secondary",
          "border border-border",
        ),
        ghost: cn(
          "text-muted-foreground hover:text-foreground",
          "bg-transparent hover:bg-secondary/60",
        ),
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4",
        lg: "h-11 px-5",
        xl: "h-12 px-6 text-[15px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type FancyButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof fancyButton> & {
    asChild?: boolean;
  };

export const FancyButton = React.forwardRef<
  HTMLButtonElement,
  FancyButtonProps
>(function FancyButton({ className, variant, size, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(fancyButton({ variant, size }), className)}
      {...props}
    >
      {variant === "primary" ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-2 top-px h-px bg-foreground/55 blur-[0.4px]"
        />
      ) : null}
      {children}
    </button>
  );
});

export { fancyButton as fancyButtonVariants };
