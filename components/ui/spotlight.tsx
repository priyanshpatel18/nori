"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type SpotlightProps<T extends React.ElementType> = {
  as?: T;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function Spotlight<T extends React.ElementType = "div">({
  as,
  className,
  children,
  ...props
}: SpotlightProps<T>) {
  const Comp = (as ?? "div") as React.ElementType;
  const ref = React.useRef<HTMLElement | null>(null);

  const onMove = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--y", `${e.clientY - rect.top}px`);
  }, []);

  return (
    <Comp
      ref={ref as unknown as React.Ref<HTMLElement>}
      onMouseMove={onMove}
      className={cn("group/spotlight relative overflow-hidden", className)}
      {...props}
    >
      {/* mouse spotlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/spotlight:opacity-100"
        style={{
          background:
            "radial-gradient(420px circle at var(--x,50%) var(--y,50%), color-mix(in oklch, var(--primary) 12%, transparent), transparent 45%)",
        }}
      />
      {/* hairline edge */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 top-0 h-px"
        style={{
          background:
            "linear-gradient(to right, transparent, color-mix(in oklch, var(--foreground) 20%, transparent), transparent)",
        }}
      />
      <div className="relative">{children}</div>
    </Comp>
  );
}

