import { Children, useEffect, useRef } from 'react';
import { createFrameUpdates } from './editor-frame-updates';
import type { ReactNode } from 'react';

export function FrameCarousel({
  children,
  variant = 'kiosk',
}: {
  children: ReactNode;
  variant?: 'kiosk' | 'studio';
}) {
  const row = useRef<HTMLDivElement>(null);
  const cardSelector =
    variant === 'studio' ? '.studio-frame-card' : '.kiosk-template-card';
  const wheelTarget = useRef<number | null>(null);
  const resetWheel = useRef(() => {
    wheelTarget.current = null;
  });
  const count = Children.toArray(children).length;
  const behavior = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? ('instant' as const)
      : ('smooth' as const);

  useEffect(() => {
    const element = row.current;
    if (!element) return;
    let lastLeft = -1,
      lastRight = -1;
    function update() {
      const max = Math.max(0, element!.scrollWidth - element!.clientWidth);
      const fade = Math.min(76, element!.clientWidth * 0.14);
      const position = Math.max(0, Math.min(max, element!.scrollLeft));
      const left = Math.round(Math.min(fade, position) * 10) / 10;
      const right = Math.round(Math.min(fade, max - position) * 10) / 10;
      if (left !== lastLeft) {
        element!.style.setProperty('--frame-fade-left', left + 'px');
        lastLeft = left;
      }
      if (right !== lastRight) {
        element!.style.setProperty('--frame-fade-right', right + 'px');
        lastRight = right;
      }
    }
    const edgeUpdates = createFrameUpdates(
      () => update(),
      (callback) => requestAnimationFrame(callback),
      (id) => cancelAnimationFrame(id),
    );
    const wheelUpdates = createFrameUpdates<number>(
      (left) => element.scrollTo({ left, behavior: behavior() }),
      (callback) => requestAnimationFrame(callback),
      (id) => cancelAnimationFrame(id),
    );
    const dragUpdates = createFrameUpdates<number>(
      (left) => element.scrollTo({ left, behavior: 'instant' }),
      (callback) => requestAnimationFrame(callback),
      (id) => cancelAnimationFrame(id),
    );
    let drag: {
      id: number;
      type: string;
      x: number;
      y: number;
      left: number;
      moved: boolean;
    } | null = null;
    let suppressClickUntil = 0;
    function pointerDown(event: PointerEvent) {
      if (!event.isPrimary || event.button !== 0) return;
      reset();
      dragUpdates.clear();
      suppressClickUntil = 0;
      element!.scrollTo({ left: element!.scrollLeft, behavior: 'instant' });
      drag = {
        id: event.pointerId,
        type: event.pointerType,
        x: event.clientX,
        y: event.clientY,
        left: element!.scrollLeft,
        moved: false,
      };
    }
    function pointerMove(event: PointerEvent) {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x,
        dy = event.clientY - drag.y;
      if (drag.type === 'touch') {
        // Leave touch motion and inertia to the browser; only guard against a tap after a swipe.
        if (Math.hypot(dx, dy) > 8) {
          drag.moved = true;
          suppressClickUntil = performance.now() + 500;
        }
        return;
      }
      if (!drag.moved) {
        if (
          Math.abs(dx) < 7 ||
          Math.abs(dx) < Math.abs(dy) ||
          element!.scrollWidth <= element!.clientWidth + 1
        )
          return;
        drag.moved = true;
        element!.dataset.dragging = 'true';
        element!.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      suppressClickUntil = performance.now() + 500;
      dragUpdates.queue(drag.left - dx);
    }
    function pointerEnd(event?: PointerEvent) {
      if (!drag || (event && event.pointerId !== drag.id)) return;
      const active = drag;
      drag = null;
      if (
        active.moved ||
        (active.type === 'touch' && event?.type === 'pointercancel')
      )
        suppressClickUntil = performance.now() + 500;
      if (
        active.type !== 'touch' &&
        active.moved &&
        event?.type === 'pointerup'
      ) {
        dragUpdates.queue(active.left - (event.clientX - active.x));
        dragUpdates.flush();
      } else dragUpdates.clear();
      delete element!.dataset.dragging;
      if (element!.hasPointerCapture(active.id))
        element!.releasePointerCapture(active.id);
    }
    function click(event: MouseEvent) {
      if (event.detail > 0 && performance.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }
    function preventImageDrag(event: DragEvent) {
      event.preventDefault();
    }
    function blur() {
      pointerEnd();
      reset();
    }
    function onScroll() {
      edgeUpdates.queue(true);
    }
    function wheel(event: WheelEvent) {
      if (drag?.moved) return;
      if (event.ctrlKey || Math.abs(event.deltaX) > 0.5) {
        reset();
        return;
      }
      if (!event.deltaY) return;
      const max = element!.scrollWidth - element!.clientWidth;
      if (max <= 1) return;
      event.preventDefault();
      const delta =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? element!.clientWidth
            : 1);
      wheelTarget.current = Math.max(
        0,
        Math.min(max, (wheelTarget.current ?? element!.scrollLeft) + delta),
      );
      wheelUpdates.queue(wheelTarget.current);
    }
    function reset() {
      wheelTarget.current = null;
      wheelUpdates.clear();
    }
    resetWheel.current = reset;
    const resize = new ResizeObserver(() => {
      reset();
      update();
    });
    resize.observe(element);
    for (const card of element.children) resize.observe(card);
    element.addEventListener('scroll', onScroll, { passive: true });
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('pointerdown', pointerDown);
    element.addEventListener('pointermove', pointerMove, { passive: false });
    element.addEventListener('lostpointercapture', pointerEnd);
    element.addEventListener('click', click, true);
    element.addEventListener('dragstart', preventImageDrag);
    window.addEventListener('pointerup', pointerEnd);
    window.addEventListener('pointercancel', pointerEnd);
    window.addEventListener('blur', blur);
    update();
    return () => {
      resize.disconnect();
      edgeUpdates.clear();
      wheelUpdates.clear();
      dragUpdates.clear();
      drag = null;
      delete element.dataset.dragging;
      resetWheel.current = () => {
        wheelTarget.current = null;
      };
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('pointerdown', pointerDown);
      element.removeEventListener('pointermove', pointerMove);
      element.removeEventListener('lostpointercapture', pointerEnd);
      element.removeEventListener('click', click, true);
      element.removeEventListener('dragstart', preventImageDrag);
      window.removeEventListener('pointerup', pointerEnd);
      window.removeEventListener('pointercancel', pointerEnd);
      window.removeEventListener('blur', blur);
    };
  }, [count]);

  function scroll(direction: number) {
    const element = row.current;
    if (!element) return;
    resetWheel.current();
    const card = element.querySelector<HTMLElement>(cardSelector);
    const gap = parseFloat(getComputedStyle(element).columnGap) || 0;
    element.scrollBy({
      left: direction * (card ? card.offsetWidth + gap : element.clientWidth),
      behavior: behavior(),
    });
  }
  return (
    <div className="kiosk-frame-carousel">
      <div
        ref={row}
        className={
          variant === 'studio' ? 'studio-frame-track' : 'kiosk-template-grid'
        }
        role="region"
        aria-label="Photo frames. Scroll left or right to explore."
        tabIndex={0}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
            return;
          event.preventDefault();
          resetWheel.current();
          const cards = Array.from(
            row.current!.querySelectorAll<HTMLButtonElement>(
              cardSelector + ':not(:disabled)',
            ),
          );
          const focused = cards.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          if (!cards.length) return;
          if (
            focused < 0 &&
            (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
          ) {
            scroll(event.key === 'ArrowLeft' ? -1 : 1);
            return;
          }
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? cards.length - 1
                : Math.max(
                    0,
                    Math.min(
                      cards.length - 1,
                      focused + (event.key === 'ArrowRight' ? 1 : -1),
                    ),
                  );
          cards[next].focus({ preventScroll: true });
          cards[next].scrollIntoView({
            behavior: behavior(),
            block: 'nearest',
            inline: 'nearest',
          });
        }}
      >
        {children}
      </div>
    </div>
  );
}
