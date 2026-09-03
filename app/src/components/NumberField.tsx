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
 * A numeric input that shows exactly what you typed while you are typing, then falls back to the
 * value the model accepted once you leave. A plain controlled number input fights the user ("02"
 * sticks, clearing snaps to 0); keeping the draft only while focused also means a value the model
 * clamps — gold beyond what your purses and bag can hold — is shown honestly rather than as typed.
 */
export function NumberField({ value, onCommit, min, max, integer = true, className }: Props) {
  // null means "no draft": show the committed value.
  const [draft, setDraft] = useState<string | null>(null);

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
      value={draft ?? String(value)}
      onChange={(event) => {
        setDraft(event.target.value);
        const parsed = parse(event.target.value);
        if (parsed !== null && parsed !== value) onCommit(parsed);
      }}
      onBlur={() => {
        const parsed = parse(draft ?? "");
        if (parsed !== null && parsed !== value) onCommit(parsed);
        setDraft(null);
      }}
    />
  );
}
