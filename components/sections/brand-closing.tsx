import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import { fancyButtonVariants } from "@/components/ui/fancy-button";
import { cn } from "@/lib/utils";

export function BrandClosing() {
  return (
    <section
      aria-label="Get started"
      className="relative border-t border-border bg-background"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-8 px-6 py-24 md:flex-row md:items-end md:justify-between md:px-8 md:py-32">
        <h2 className="max-w-[18ch] text-[clamp(2rem,4.4vw,3.4rem)] font-semibold leading-[1.04] tracking-[-0.022em] text-foreground">
          Run private payroll.
        </h2>
        <Link
          href="/payroll"
          className={cn(fancyButtonVariants({ variant: "primary", size: "xl" }))}
        >
          Launch app
          <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2.4} />
        </Link>
      </div>
    </section>
  );
}
