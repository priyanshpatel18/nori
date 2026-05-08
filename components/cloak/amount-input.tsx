"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";

type InputProps = React.ComponentProps<typeof Input>;

export type AmountInputProps = Omit<InputProps, "onChange" | "value" | "type"> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Max fractional digits accepted. Extra decimals are silently dropped. */
  decimals?: number;
};

/**
 * Numeric-only amount input. Accepts digits and at most one decimal point;
 * everything else is dropped on input. Pass `decimals` to clamp the
 * fractional part to a token's precision.
 */
export const AmountInput = React.forwardRef<HTMLInputElement, AmountInputProps>(
  function AmountInput(
    { value, onValueChange, decimals, inputMode, onPaste, ...rest },
    ref,
  ) {
    const sanitize = React.useCallback(
      (raw: string): string => {
        // Strip everything that isn't a digit or a dot, collapse multiple dots.
        let s = raw.replace(/[^\d.]/g, "");
        const firstDot = s.indexOf(".");
        if (firstDot !== -1) {
          s =
            s.slice(0, firstDot + 1) +
            s.slice(firstDot + 1).replace(/\./g, "");
        }
        if (decimals !== undefined && firstDot !== -1) {
          const whole = s.slice(0, firstDot);
          const frac = s.slice(firstDot + 1, firstDot + 1 + decimals);
          s = decimals === 0 ? whole : `${whole}.${frac}`;
        }
        return s;
      },
      [decimals],
    );

    return (
      <Input
        ref={ref}
        {...rest}
        type="text"
        inputMode={inputMode ?? "decimal"}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          const next = sanitize(e.target.value);
          if (next !== value) onValueChange(next);
        }}
        onPaste={(e) => {
          // Sanitize on paste too, browsers fire onChange anyway, but doing
          // it here prevents the unsanitized value from flashing.
          const text = e.clipboardData.getData("text");
          const sanitized = sanitize(text);
          if (sanitized !== text) {
            e.preventDefault();
            onValueChange(sanitized);
          }
          onPaste?.(e);
        }}
      />
    );
  },
);
