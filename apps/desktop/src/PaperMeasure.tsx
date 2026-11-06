import { NumberInput } from './NumberInput';
import { useEffect, useRef, useState } from 'react';

export function PaperMeasure({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const format = (n: number) =>
    Number.isFinite(n) && n >= 0 ? String(Number((n / 25400).toFixed(4))) : '';
  const [text, setText] = useState(() => format(value));
  useEffect(() => {
    if (document.activeElement !== input.current) setText(format(value));
  }, [value]);
  return (
    <label className="paper-measure">
      <span>
        {label} <small>(in)</small>
      </span>
      <NumberInput
        stepLabel={label}
        ref={input}
        min="0"
        step="0.01"
        value={text}
        disabled={disabled}
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          onChange(raw.trim() ? Math.round(Number(raw) * 25400) : Number.NaN);
        }}
      />
    </label>
  );
}
