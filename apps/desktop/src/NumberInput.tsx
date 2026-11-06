import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { InputHTMLAttributes } from 'react';

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  stepLabel: string;
  onStep?: (direction: number) => void;
  wrapperClassName?: string;
};

/** Shared native number input with theme-aware arrows; keeps native validation and keyboard input. */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    { stepLabel, onStep, wrapperClassName = '', ...props },
    forwardedRef,
  ) {
    const input = useRef<HTMLInputElement>(null);
    useImperativeHandle(forwardedRef, () => input.current!);
    const numeric =
      props.value === '' || props.value == null ? NaN : Number(props.value);
    const minimum = props.min == null ? -Infinity : Number(props.min);
    const maximum = props.max == null ? Infinity : Number(props.max);
    function step(direction: number, pointer: boolean) {
      const element = input.current;
      if (!element || element.matches(':disabled') || element.readOnly) return;
      if (pointer) element.focus({ preventScroll: true });
      if (onStep) {
        onStep(direction);
        return;
      }
      const previous = element.value;
      if (direction > 0) element.stepUp();
      else element.stepDown();
      // Native stepUp/stepDown preserve decimal precision and min/max. Notify React
      // just like a keyboard or typed edit so controlled parent state stays in sync.
      if (element.value !== previous)
        element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return (
      <span className={`number-input ${wrapperClassName}`}>
        <input
          {...props}
          ref={input}
          type="number"
          aria-label={props['aria-label'] || stepLabel}
        />
        <span className="number-input-arrows">
          {[1, -1].map((direction) => (
            <button
              key={direction}
              type="button"
              className="outline-button number-step-button"
              disabled={
                props.disabled ||
                props.readOnly ||
                (Number.isFinite(numeric) &&
                  (direction > 0 ? numeric >= maximum : numeric <= minimum))
              }
              aria-label={`${direction > 0 ? 'Increase' : 'Decrease'} ${stepLabel}`}
              title={`${direction > 0 ? 'Increase' : 'Decrease'} ${stepLabel}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => step(direction, event.detail > 0)}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={direction > 0 ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
              </svg>
            </button>
          ))}
        </span>
      </span>
    );
  },
);
