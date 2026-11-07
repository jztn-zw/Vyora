import { useId } from 'react';
import { NumberInput } from './NumberInput';

export function EditorNumberField({
  label,
  value,
  min,
  max,
  step,
  disabled = false,
  describedBy,
  onChange,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  describedBy?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const inactive = disabled || value === null;
  function change(next: number) {
    if (!inactive && Number.isFinite(next))
      onChange(Math.max(min, Math.min(max, next)));
  }
  function increment(direction: number) {
    if (value !== null) change(Number((value + direction * step).toFixed(6)));
  }
  return (
    <div className="template-number-field">
      <label htmlFor={id}>{label}</label>
      <div
        className="editor-number-control"
        onKeyDown={(event) => {
          if (
            (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            event.stopPropagation();
            increment(event.key === 'ArrowUp' ? 1 : -1);
          }
        }}
      >
        <NumberInput
          id={id}
          stepLabel={label}
          min={min}
          max={max}
          step={step}
          value={value ?? ''}
          disabled={inactive}
          onChange={(event) => change(event.target.valueAsNumber)}
          onStep={increment}
          aria-describedby={describedBy}
        />
      </div>
    </div>
  );
}
