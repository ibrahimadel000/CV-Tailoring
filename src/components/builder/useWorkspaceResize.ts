import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

const MIN = 280;
const DESKTOP = 1180;
const maxWidth = (width: number) => Math.max(MIN, Math.min(520, width - 328 - 440));
const clamp = (value: number, width: number) => Math.max(MIN, Math.min(maxWidth(width), value));

export function useWorkspaceResize(enabled: boolean) {
  const workspace = useRef<HTMLElement>(null);
  const separator = useRef<HTMLDivElement>(null);
  const measured = useRef(1440);
  const initialized = useRef(false);
  const [width, setWidth] = useState(340);
  const [maximum, setMaximum] = useState(maxWidth(1440));
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ id: number; startX: number; startWidth: number } | null>(null);
  const release = (restore = false) => {
    const current = drag.current;
    drag.current = null;
    if (current && restore) setWidth(clamp(current.startWidth, measured.current));
    if (current && separator.current?.hasPointerCapture(current.id)) separator.current.releasePointerCapture(current.id);
    setResizing(false);
  };
  useLayoutEffect(() => {
    const element = workspace.current;
    if (!element || !enabled) return;
    const observer = new ResizeObserver(() => {
      const next = element.clientWidth;
      if (!next) return;
      measured.current = next;
      setMaximum(maxWidth(next));
      if (drag.current) release(true);
      if (next >= DESKTOP) {
        if (!initialized.current) {
          initialized.current = true;
          setWidth(clamp(Math.min(380, next * 0.25), next));
        } else setWidth(value => clamp(value, next));
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled]);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary || measured.current < DESKTOP || drag.current) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, startX: event.clientX, startWidth: width };
    setResizing(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === event.pointerId) setWidth(clamp(drag.current.startWidth + event.clientX - drag.current.startX, measured.current));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && drag.current) { event.preventDefault(); release(true); return; }
    const step = event.shiftKey ? 40 : 16;
    const next = event.key === 'ArrowLeft' ? width - step : event.key === 'ArrowRight' ? width + step : event.key === 'Home' ? MIN : event.key === 'End' ? maxWidth(measured.current) : null;
    if (next !== null) { event.preventDefault(); setWidth(clamp(next, measured.current)); }
  };
  return {
    workspace,
    style: { '--editor-width': `${Math.round(width)}px` } as CSSProperties,
    resizing,
    separatorProps: {
      ref: separator,
      role: 'separator' as const,
      tabIndex: 0,
      'aria-label': 'Resize resume editor',
      'aria-orientation': 'vertical' as const,
      'aria-controls': 'resume-editor-pane',
      'aria-valuemin': MIN,
      'aria-valuemax': maximum,
      'aria-valuenow': Math.round(width),
      'aria-valuetext': `${Math.round(width)} pixels`,
      onPointerDown,
      onPointerMove,
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => { if (drag.current?.id === event.pointerId) release(); },
      onPointerCancel: () => release(true),
      onLostPointerCapture: () => { if (drag.current) release(true); },
      onKeyDown,
    },
  };
}