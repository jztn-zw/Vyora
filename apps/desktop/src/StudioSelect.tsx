import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import './studio-select.css';

interface SelectOption {
  value: string;
  label: string;
  description?: string;
}
interface SelectAction {
  label: string;
  icon: 'edit' | 'remove';
  onClick: () => void;
}

export function StudioSelect({
  label,
  value,
  options,
  disabled = false,
  onChange,
  getActions,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
  getActions?: (value: string) => SelectAction[];
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const toolsAnchor = useRef<HTMLButtonElement | null>(null);
  const search = useRef({ text: '', time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [toolsFor, setToolsFor] = useState<string | null>(null);
  const hasActions = !!getActions;
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[selectedIndex];
  useEffect(() => setToolsFor(null), [open, value]);
  useLayoutEffect(() => {
    if (!open || toolsFor === null || !toolsAnchor.current) return;
    const index = options.findIndex((option) => option.value === toolsFor);
    const popup = document.getElementById(id + '-tools-' + index);
    const anchor = toolsAnchor.current;
    if (!popup) return;
    popup.showPopover();
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(264, window.innerWidth - 24);
    popup.style.width = width + 'px';
    popup.style.left =
      Math.max(
        12,
        Math.min(rect.right - width, window.innerWidth - width - 12),
      ) + 'px';
    const height = popup.getBoundingClientRect().height;
    const below = window.innerHeight - rect.bottom - 12;
    popup.style.top =
      (below >= height
        ? rect.bottom + 8
        : Math.max(12, rect.top - height - 8)) + 'px';
    popup
      .querySelector<HTMLButtonElement>('button')
      ?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (
        !popup.contains(event.target as Node) &&
        !anchor.contains(event.target as Node)
      )
        setToolsFor(null);
    };
    const closeOnScroll = (event: Event) => {
      if (event.target !== popup) setToolsFor(null);
    };
    const closeOnResize = () => setToolsFor(null);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', closeOnResize);
    return () => {
      popup.hidePopover();
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [open, toolsFor, options.length, id]);

  function show(index = selectedIndex) {
    if (disabled || !options.length) return;
    search.current = { text: '', time: 0 };
    setActive(index);
    setOpen(true);
  }
  function choose(index: number) {
    if (!options[index] || disabled) return;
    setOpen(false);
    trigger.current?.focus();
    onChange(options[index].value);
  }
  function navigate(event: KeyboardEvent) {
    if (
      hasActions &&
      event.target instanceof Element &&
      event.target.closest('.studio-select-more, .studio-select-tools-toolbar')
    )
      return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) show();
      else
        setActive(
          (index) =>
            (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) %
            options.length,
        );
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const index = event.key === 'Home' ? 0 : options.length - 1;
      if (open) setActive(index);
      else show(index);
    } else if (open && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      choose(active);
    } else if (open && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (open && event.key === 'Tab') {
      if (!hasActions) {
        setOpen(false);
        trigger.current?.focus();
      }
    } else if (
      open &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const time = Date.now();
      search.current = {
        text:
          (time - search.current.time < 700 ? search.current.text : '') +
          event.key.toLowerCase(),
        time,
      };
      const index = options.findIndex((option) =>
        option.label.toLowerCase().startsWith(search.current.text),
      );
      if (index >= 0) setActive(index);
    }
  }
  useLayoutEffect(() => {
    if (!open || disabled || !menu.current || !trigger.current) return;
    const popup = menu.current;
    function position() {
      const rect = trigger.current!.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const height = Math.min(
        300,
        Math.max(below, above),
        options.length * 62 + 12,
      );
      const upwards = below < height && above > below;
      popup.style.width = rect.width + 'px';
      popup.style.maxHeight = Math.max(60, height) + 'px';
      popup.style.left =
        Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)) +
        'px';
      popup.style.top = upwards ? 'auto' : rect.bottom + 7 + 'px';
      popup.style.bottom = upwards
        ? window.innerHeight - rect.top + 7 + 'px'
        : 'auto';
    }
    position();
    popup.showPopover();
    list.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const reposition = (event: Event) => {
      if (event.target !== popup && event.target !== list.current) position();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', reposition, true);
    return () => {
      popup.hidePopover();
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, disabled, options.length, hasActions]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const popup = list.current;
    const option = popup?.children[active] as HTMLElement | undefined;
    if (!popup || !option) return;
    if (hasActions)
      option
        .querySelector<HTMLButtonElement>('[data-template-select]')
        ?.focus({ preventScroll: true });
    if (option.offsetTop < popup.scrollTop) popup.scrollTop = option.offsetTop;
    else if (
      option.offsetTop + option.offsetHeight >
      popup.scrollTop + popup.clientHeight
    )
      popup.scrollTop =
        option.offsetTop + option.offsetHeight - popup.clientHeight;
  }, [open, active, hasActions]);

  const copy = (option: SelectOption) => (
    <span className="studio-select-copy">
      <strong>{option.label}</strong>
      {option.description && <small>{option.description}</small>}
    </span>
  );
  const check = (
    <span className="studio-select-check" aria-hidden="true">
      ✓
    </span>
  );
  return (
    <div
      className="studio-select"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="studio-select-trigger"
        disabled={disabled || !options.length}
        aria-label={label + ': ' + (selected?.label || '')}
        aria-haspopup={hasActions ? 'dialog' : 'listbox'}
        aria-expanded={open && !disabled}
        aria-controls={id + '-options'}
        onKeyDown={navigate}
        onClick={() => (open ? setOpen(false) : show())}
      >
        {selected && copy(selected)}
        <svg
          className="studio-select-chevron"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m7 10 5 5 5-5" />
        </svg>
      </button>
      <div
        ref={menu}
        className="studio-select-menu"
        popover="manual"
        role={hasActions ? 'dialog' : undefined}
        aria-label={hasActions ? label + ' choices' : undefined}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            trigger.current?.focus();
          }
        }}
      >
        <div
          ref={list}
          id={id + '-options'}
          role={hasActions ? 'group' : 'listbox'}
          aria-label={label}
          aria-activedescendant={
            hasActions ? undefined : id + '-option-' + active
          }
          tabIndex={-1}
          onKeyDown={navigate}
        >
          {options.map((option, index) => {
            const actions = getActions?.(option.value) || [];
            return hasActions ? (
              <div key={option.value} className="studio-select-row">
                <button
                  type="button"
                  data-template-select="true"
                  className={
                    'studio-select-option ' +
                    (active === index ? 'is-active' : '')
                  }
                  aria-pressed={option.value === value}
                  onFocus={() => setActive(index)}
                  onClick={() => choose(index)}
                >
                  {copy(option)}
                  {option.value === value && check}
                </button>
                {!!actions.length && (
                  <button
                    type="button"
                    className="studio-select-more"
                    aria-label={'Tools for ' + option.label}
                    title="Template tools"
                    aria-expanded={toolsFor === option.value}
                    aria-controls={id + '-tools-' + index}
                    aria-haspopup="menu"
                    onClick={(event) => {
                      toolsAnchor.current = event.currentTarget;
                      setToolsFor((current) =>
                        current === option.value ? null : option.value,
                      );
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <circle cx="5" cy="12" r="1.8" />
                      <circle cx="12" cy="12" r="1.8" />
                      <circle cx="19" cy="12" r="1.8" />
                    </svg>
                  </button>
                )}
                <div
                  id={id + '-tools-' + index}
                  className="studio-select-tools-toolbar"
                  popover="manual"
                  role="menu"
                  aria-label={option.label + ' tools'}
                  onKeyDown={(event) => {
                    const buttons = Array.from(
                      event.currentTarget.querySelectorAll<HTMLButtonElement>(
                        'button',
                      ),
                    );
                    const current = buttons.indexOf(
                      document.activeElement as HTMLButtonElement,
                    );
                    if (
                      ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(
                        event.key,
                      )
                    ) {
                      event.preventDefault();
                      event.stopPropagation();
                      const next =
                        event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? buttons.length - 1
                            : (current +
                                (event.key === 'ArrowUp' ? -1 : 1) +
                                buttons.length) %
                              buttons.length;
                      buttons[next]?.focus();
                    } else if (event.key === 'Escape' || event.key === 'Tab') {
                      event.preventDefault();
                      event.stopPropagation();
                      setToolsFor(null);
                      toolsAnchor.current?.focus({ preventScroll: true });
                    }
                  }}
                >
                  <p>Template tools</p>
                  {actions.map((action) => (
                    <button
                      key={action.icon}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpen(false);
                        trigger.current?.focus();
                        action.onClick();
                      }}
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        {action.icon === 'edit' ? (
                          <path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z" />
                        ) : (
                          <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
                        )}
                      </svg>
                      <span>
                        <strong>{action.label}</strong>
                        <small>
                          {action.icon === 'edit'
                            ? 'Adjust photo areas and layout'
                            : 'Remove from frame choices'}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div
                key={option.value}
                id={id + '-option-' + index}
                role="option"
                aria-selected={option.value === value}
                className={
                  'studio-select-option ' +
                  (active === index ? 'is-active' : '')
                }
                onPointerMove={() => setActive(index)}
                onClick={() => choose(index)}
              >
                {copy(option)}
                {option.value === value && check}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
