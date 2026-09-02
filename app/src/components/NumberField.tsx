import { useState } from "react";

interface Props {
  value: number | "";
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  /** Round to whole numbers (default true). */
  integer?: boolean;
  className?: string;
}

/**
 * A numeric input that keeps whatever you typed while you type. A plain controlled number input
 * fights the user: "02" sticks, and clearing the field snaps back to 0.
 */
export function NumberField({ value, onCommit, min, max, integer = true, className }: Props) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState(value);
  // Follow outside changes (undo, reset, gold moved into a purse) unless the user is mid-edit.
  if (value !== seen) {
    setSeen(value);
    if (!focused) setDraft(String(value));
  }

  function parse(text: string): number | null {
    const trimmed = text.trim().replace(",", ".");
    if (trimmed === "" || trimmed === "-") return null;
    const number = Number(trimmed);
    if (!Number.isFinite(number)) return null;
    let clamped = integer ? Math.trunc(number) : number;
    if (min !== undefined) clamped = Math.max(min, clamped);
    if (max !== undefined) clamped = Math.min(max, clamped);
    return clamped;
  }

  return (
    <input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      className={className}
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(event) => {
        setDraft(event.target.value);
        const parsed = parse(event.target.value);
        if (parsed !== null) onCommit(parsed);
      }}
      onBlur={() => {
        setFocused(false);
        const parsed = parse(draft);
        setDraft(String(parsed ?? value));
        if (parsed !== null && parsed !== value) onCommit(parsed);
      }}
    />
  );
}
