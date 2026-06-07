"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Input } from "./input";

interface MoneyInputProps extends Omit<ComponentProps<"input">, "value" | "onChange" | "type"> {
  /** Current value in cents (integer). Pass `undefined` for empty. */
  valueCents: number | null | undefined;
  /** Called with new value in cents on every keystroke. `undefined` when the field is cleared. */
  onValueChange: (cents: number | undefined) => void;
}

/**
 * A text input for monetary amounts stored as integer cents.
 *
 * Shows the raw typed string while the user is editing and only
 * formats to "1.234,56" on blur — preventing the cursor-jump that
 * occurs when a controlled `type="number"` value is re-formatted on
 * every keystroke.
 */
export function MoneyInput({
  valueCents,
  onValueChange,
  onBlur,
  onFocus,
  ...props
}: MoneyInputProps) {
  const isFocusedRef = useRef(false);
  const [display, setDisplay] = useState(() => centsToDisplay(valueCents));

  // Sync external value changes (e.g. form.reset / setValue) while not focused.
  useEffect(() => {
    if (!isFocusedRef.current) {
      setDisplay(centsToDisplay(valueCents));
    }
  }, [valueCents]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={display}
      onFocus={(e) => {
        isFocusedRef.current = true;
        onFocus?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDisplay(raw);
        const n = parseFloat(raw.replace(",", "."));
        onValueChange(isNaN(n) ? undefined : Math.round(n * 100));
      }}
      onBlur={(e) => {
        isFocusedRef.current = false;
        const n = parseFloat(display.replace(",", "."));
        setDisplay(isNaN(n) ? "" : n.toFixed(2).replace(".", ","));
        onBlur?.(e);
      }}
      {...props}
    />
  );
}

function centsToDisplay(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}
