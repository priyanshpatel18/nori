"use client";

import {
  ArrowRight01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { FancyButton } from "@/components/ui/fancy-button";
import { solanaConfig } from "@/lib/solana/config";
import {
  advanceTour,
  endTour,
  getCurrentStep,
  getStepCounter,
  useTour,
} from "@/lib/cloak/tour";
import { cn } from "@/lib/utils";

const SPOTLIGHT_PAD = 10;
const SPOTLIGHT_RADIUS = 14;

type Rect = { top: number; left: number; width: number; height: number };

export function TourCoach() {
  const wallet = useWallet();
  const pubkey = wallet.publicKey?.toBase58() ?? null;
  const tour = useTour(pubkey);
  const pathname = usePathname();
  const router = useRouter();

  const step = getCurrentStep(tour);
  const counter = getStepCounter(tour);
  const onTargetRoute = !!step && pathname === step.route;
  const stepId = step?.id;
  const stepTarget = step?.target;
  const stepSatisfied = step?.satisfied;

  // Auto-advance when a step's `satisfied` predicate is true at mount or
  // after a route change. Carries the demo-toggle step over the page reload
  // that demo mode triggers: by the time this remounts post-reload, the
  // active cluster is already devnet and the engine moves to the next step
  // without the user clicking again.
  React.useEffect(() => {
    if (!pubkey || !stepSatisfied) return;
    if (stepSatisfied({ cluster: solanaConfig.cluster })) {
      advanceTour(pubkey);
    }
  }, [pubkey, stepId, stepSatisfied, pathname]);

  // Track the target element's viewport rect. Re-runs on step change, route
  // change, scroll, and resize so the spotlight keeps following the target.
  // We don't clear the rect on early return; the JSX gates `Spotlight`
  // on `onTargetRoute` instead, so a stale rect never reaches the DOM.
  const [rect, setRect] = React.useState<Rect | null>(null);
  React.useEffect(() => {
    if (!stepTarget || !onTargetRoute) return;

    let cancelled = false;
    let target: HTMLElement | null = null;
    let observer: ResizeObserver | null = null;
    let raf = 0;

    function read() {
      if (!target || cancelled) return;
      const r = target.getBoundingClientRect();
      // Round to whole px so motion doesn't try to animate sub-pixel jitters
      // when the target is stationary.
      setRect({
        top: Math.round(r.top),
        left: Math.round(r.left),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
    }

    function schedule() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        read();
      });
    }

    // Wait one frame for the route's content to mount before locating the
    // target; this matters for tour steps that fire immediately after a
    // navigation.
    raf = requestAnimationFrame(() => {
      raf = 0;
      const found = document.querySelector(`[data-tour="${stepTarget}"]`);
      if (!(found instanceof HTMLElement) || cancelled) return;
      target = found;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      read();
      observer = new ResizeObserver(schedule);
      observer.observe(target);
    });

    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
    };
  }, [stepId, stepTarget, onTargetRoute, pathname]);

  function handleAdvance() {
    if (pubkey) advanceTour(pubkey);
  }
  function handleSkip() {
    if (pubkey) endTour(pubkey);
  }
  function handleNavigate() {
    if (step) router.push(step.route);
  }

  if (!pubkey || !step || !counter) return null;

  return (
    <div
      // Root sits above the page chrome but below modals so the welcome
      // dialog (when ever it co-exists momentarily during state flips) can
      // still dominate.
      className="pointer-events-none fixed inset-0 z-40"
      role="dialog"
      aria-live="polite"
      aria-label={`Tour step ${counter.current} of ${counter.total}`}
    >
      <Spotlight rect={onTargetRoute ? rect : null} />

      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "pointer-events-auto absolute bottom-5 left-1/2 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2",
            "rounded-2xl border border-border bg-card/95 p-4 shadow-2xl shadow-black/60",
            "ring-1 ring-foreground/5 backdrop-blur-md",
          )}
        >
          <header className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.18em] text-primary">
                <span aria-hidden="true" className="size-1 rounded-full bg-primary" />
                {tour.path === "devnet" ? "Devnet tour" : "Quick tour"}
              </span>
              <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
                {String(counter.current).padStart(2, "0")} /{" "}
                {String(counter.total).padStart(2, "0")}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={handleSkip}
              aria-label="Skip tour"
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          </header>

          <h3 className="mt-3 font-heading text-[16px] tracking-tight text-foreground">
            {step.title}
          </h3>
          <p className="mt-1.5 text-[12.5px] leading-5 text-muted-foreground">
            {step.body}
          </p>

          <footer className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleSkip}
              className="text-[11.5px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Skip tour
            </button>
            {onTargetRoute ? (
              <FancyButton
                type="button"
                variant="primary"
                size="sm"
                onClick={handleAdvance}
              >
                {step.actionLabel ?? "Continue"}
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                  className="ml-1"
                />
              </FancyButton>
            ) : (
              <FancyButton
                type="button"
                variant="primary"
                size="sm"
                onClick={handleNavigate}
              >
                Take me there
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                  className="ml-1"
                />
              </FancyButton>
            )}
          </footer>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * Renders four dim panels around the target rect so everything except the
 * target is darkened and unclickable. When `rect` is null we cover the whole
 * viewport with one panel, used when the user is on the wrong route or the
 * target hasn't mounted yet.
 *
 * The panels are pointer-events-auto so clicks outside the target get
 * swallowed by the backdrop, keeping the user focused on the action they're
 * being asked to take. The target itself stays fully interactive because no
 * panel covers it.
 */
function Spotlight({ rect }: { rect: Rect | null }) {
  if (!rect) {
    return (
      <motion.div
        key="full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        className="pointer-events-auto absolute inset-0 bg-black/70 backdrop-blur-[2px]"
      />
    );
  }

  const top = rect.top - SPOTLIGHT_PAD;
  const left = rect.left - SPOTLIGHT_PAD;
  const width = rect.width + SPOTLIGHT_PAD * 2;
  const height = rect.height + SPOTLIGHT_PAD * 2;
  const tween = { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const };
  const panel =
    "pointer-events-auto absolute bg-black/70 backdrop-blur-[2px]";

  return (
    <>
      <motion.div
        className={panel}
        animate={{ top: 0, left: 0, right: 0, height: Math.max(0, top) }}
        transition={tween}
      />
      <motion.div
        className={panel}
        animate={{
          top: top + height,
          left: 0,
          right: 0,
          bottom: 0,
        }}
        transition={tween}
      />
      <motion.div
        className={panel}
        animate={{
          top,
          left: 0,
          width: Math.max(0, left),
          height,
        }}
        transition={tween}
      />
      <motion.div
        className={panel}
        animate={{
          top,
          left: left + width,
          right: 0,
          height,
        }}
        transition={tween}
      />

      {/* Brand-yellow halo around the cutout. Decorative only; sits above
          the panels so its outer glow blends into the dim. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute"
        animate={{ top, left, width, height }}
        transition={tween}
        style={{
          borderRadius: SPOTLIGHT_RADIUS,
          boxShadow:
            "0 0 0 1px color-mix(in oklch, var(--primary) 75%, transparent), 0 0 0 6px color-mix(in oklch, var(--primary) 22%, transparent), 0 0 32px 2px color-mix(in oklch, var(--primary) 18%, transparent)",
        }}
      />
    </>
  );
}
