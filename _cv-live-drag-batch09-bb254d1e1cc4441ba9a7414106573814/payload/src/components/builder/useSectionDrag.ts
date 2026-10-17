import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { CVProfile } from '@/types/schema';
import { orderedSections, type SectionId } from './resumeModel';

export function moveSection(profileId: string, id: SectionId, before: SectionId | null) {
  if (id === 'personal' || before === 'personal' || id === before) return;
  useAppStore.setState(state => ({ profiles: state.profiles.map(profile => {
    if (profile?.profileId !== profileId) return profile;
    const original = orderedSections(profile).map(s => s.id);
    if (!original.includes(id) || (before !== null && !original.includes(before))) return profile;
    const order = original.filter(x => x !== id);
    order.splice(before === null ? order.length : order.indexOf(before), 0, id);
    return order.every((x, i) => x === original[i]) ? profile : { ...profile, sectionOrder: order };
  }) }));
}

type DragView = { id: SectionId; order: SectionId[]; height: number; width: number; left: number; top: number; settling: boolean };
type Gesture = {
  id: SectionId; pointer: number; startX: number; startY: number; x: number; y: number;
  active: boolean; valid: boolean; before: SectionId | null; settling: boolean;
  element: HTMLButtonElement; card: HTMLElement; scroll: HTMLElement;
  rect: DOMRect; rows: { id: SectionId; height: number }[]; order: SectionId[];
};

// Move the live card, not a cloned screenshot/form or a small label. A same-size
// slot remains in the list; keyed React children retain their editor state.
export function useSectionDrag(profile: CVProfile | undefined, scope: RefObject<HTMLElement>) {
  const helpId = useId();
  const [drag, setDrag] = useState<DragView | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const pending = useRef<Gesture | null>(null);
  const frame = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const positions = useRef(new Map<string, number>());
  const animations = useRef<Animation[]>([]);
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const announceMove = (id: SectionId) => {
    const p = useAppStore.getState().profiles.find(p => p.profileId === profile?.profileId);
    if (!p) return;
    const items = orderedSections(p); const index = items.findIndex(s => s.id === id);
    setAnnouncement(`${items[index]?.title} moved to position ${index + 1} of ${items.length}.`);
  };
  const reset = (render = true) => {
    const p = pending.current;
    pending.current = null; cancelAnimationFrame(frame.current); clearTimeout(timer.current);
    animations.current.forEach(a => a.cancel()); animations.current = [];
    p?.scroll.classList.remove('is-section-sorting');
    document.body.classList.remove('has-section-drag');
    if (p) {
      p.card.style.transform = ''; p.card.style.clipPath = ''; p.card.style.transition = '';
      p.card.removeAttribute('data-drop-invalid');
      if (p.element.hasPointerCapture(p.pointer)) p.element.releasePointerCapture(p.pointer);
    }
    if (render) setDrag(null);
  };
  const paint = (p: Gesture, left: number, top: number) => {
    const bounds = p.scroll.getBoundingClientRect();
    p.card.style.transform = `translate3d(${left - p.rect.left}px, ${top - p.rect.top}px, 0)`;
    // Keep a tall, expanded live card inside the editing viewport, not over the
    // header/preview toolbar. Its content is never collapsed or copied.
    p.card.style.clipPath = `inset(${Math.max(0, bounds.top - top)}px ${Math.max(0, left + p.rect.width - bounds.right)}px ${Math.max(0, top + p.rect.height - bounds.bottom)}px ${Math.max(0, bounds.left - left)}px)`;
  };
  const locate = () => {
    const p = pending.current; const root = scope.current;
    if (!p?.active || p.settling || !root) return;
    const bounds = p.scroll.getBoundingClientRect();
    p.valid = p.x >= bounds.left - 24 && p.x <= bounds.right + 24 && p.y >= bounds.top - 28 && p.y <= bounds.bottom + 28;
    p.card.toggleAttribute('data-drop-invalid', !p.valid);
    paint(p, Math.max(bounds.left + 4, Math.min(bounds.right - p.rect.width - 4, p.rect.left + p.x - p.startX)), p.rect.top + p.y - p.startY);
    if (!p.valid) return;
    // Collision geometry omits the placeholder. Otherwise a tall open card
    // would make its own insertion point oscillate after the list rearranges.
    let top = root.querySelector<HTMLElement>('.section-accordion-list')!.getBoundingClientRect().top;
    let before: SectionId | null = null;
    for (const row of p.rows) {
      if (row.id === p.id) continue;
      if (row.id !== 'personal' && p.y < top + row.height / 2) { before = row.id; break; }
      top += row.height;
    }
    if (before === p.before) return;
    p.before = before;
    const ids = p.rows.map(r => r.id).filter(id => id !== p.id);
    ids.splice(before === null ? ids.length : ids.indexOf(before), 0, p.id);
    p.order = ids;
    setDrag(d => d ? { ...d, order: ids } : d);
  };
  const tick = () => {
    const p = pending.current;
    if (!p?.active || p.settling) return;
    const r = p.scroll.getBoundingClientRect();
    const validX = p.x >= r.left - 24 && p.x <= r.right + 24;
    if (validX && p.y >= r.top - 28 && p.y <= r.bottom + 28) {
      const edge = 64;
      const speed = p.y < r.top + edge ? -Math.min(14, (r.top + edge - p.y) / 5) : p.y > r.bottom - edge ? Math.min(14, (p.y - r.bottom + edge) / 5) : 0;
      if (speed) p.scroll.scrollTop += speed;
    }
    locate(); frame.current = requestAnimationFrame(tick);
  };
  const orderKey = drag?.order.join('|') || '';
  useLayoutEffect(() => {
    const slots = scope.current?.querySelectorAll<HTMLElement>('[data-section-card]');
    if (!slots) return;
    const next = new Map<string, number>();
    animations.current.forEach(a => a.cancel()); animations.current = [];
    slots.forEach(slot => {
      const id = slot.dataset.sectionCard!; const top = slot.getBoundingClientRect().top;
      const previous = positions.current.get(id); next.set(id, top);
      const card = slot.firstElementChild as HTMLElement;
      if (previous !== undefined && id !== drag?.id && Math.abs(previous - top) > 1 && !reduced()) {
        animations.current.push(card.animate([{ transform: `translateY(${previous - top}px)` }, { transform: 'translateY(0)' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }));
      }
    });
    positions.current = next;
    const p = pending.current;
    if (p?.active && !p.settling) {
      // Moving an ancestor can release pointer capture on some browsers.
      if (!p.element.hasPointerCapture(p.pointer)) { try { p.element.setPointerCapture(p.pointer); } catch { /* pointer ended */ } }
      locate();
    }
  }, [orderKey, profile?.sectionOrder]);
  useEffect(() => {
    const cancel = () => { if (pending.current) { reset(); setAnnouncement('Move cancelled. Section order unchanged.'); } };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    const visibility = () => { if (document.hidden) cancel(); };
    window.addEventListener('keydown', key); window.addEventListener('blur', cancel); window.addEventListener('resize', cancel); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('blur', cancel); window.removeEventListener('resize', cancel); document.removeEventListener('visibilitychange', visibility); reset(false); };
  }, [profile?.profileId]);
  const handleProps = (id: SectionId, title: string) => ({
    type: 'button' as const, className: 'section-drag-handle',
    'aria-label': `Move ${title}`, 'aria-describedby': helpId,
    title: 'Drag to reorder · Arrow keys to move',
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 || !e.isPrimary || id === 'personal' || pending.current) return;
      const card = e.currentTarget.closest<HTMLElement>('.section-accordion');
      const scroll = scope.current?.closest<HTMLElement>('.editor-scroll');
      if (!card || !scroll) return;
      e.preventDefault(); e.currentTarget.focus({ preventScroll: true }); e.currentTarget.setPointerCapture(e.pointerId);
      const rows = [...scope.current!.querySelectorAll<HTMLElement>('[data-section-card]')].map(el => ({ id: el.dataset.sectionCard as SectionId, height: el.getBoundingClientRect().height }));
      const order = rows.map(r => r.id);
      pending.current = { id, pointer: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, valid: true, before: order[order.indexOf(id) + 1] || null, element: e.currentTarget, card, scroll, rect: card.getBoundingClientRect(), rows, order, settling: false };
    },
    onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => {
      const p = pending.current; if (!p || p.pointer !== e.pointerId || p.settling) return;
      p.x = e.clientX; p.y = e.clientY;
      if (!p.active && Math.hypot(p.x - p.startX, p.y - p.startY) > 6) {
        p.active = true; p.scroll.classList.add('is-section-sorting'); document.body.classList.add('has-section-drag');
        positions.current = new Map([...scope.current!.querySelectorAll<HTMLElement>('[data-section-card]')].map(el => [el.dataset.sectionCard!, el.getBoundingClientRect().top]));
        setDrag({ id, order: p.order, height: p.rect.height, width: p.rect.width, left: p.rect.left, top: p.rect.top, settling: false });
        setAnnouncement(`Moving ${title}. Drop at the highlighted space. Escape cancels.`);
        frame.current = requestAnimationFrame(tick);
      }
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      const p = pending.current; if (!p || p.pointer !== e.pointerId || p.settling) return;
      p.x = e.clientX; p.y = e.clientY; locate();
      if (!p.active) { reset(); return; }
      if (!p.valid) { reset(); setAnnouncement('Move cancelled. Section order unchanged.'); return; }
      cancelAnimationFrame(frame.current); p.settling = true;
      let top = scope.current!.querySelector<HTMLElement>('.section-accordion-list')!.getBoundingClientRect().top;
      for (const key of p.order) { if (key === id) break; top += p.rows.find(row => row.id === key)!.height; }
      p.card.style.transition = reduced() ? 'none' : 'transform 180ms cubic-bezier(.2,.8,.2,1)';
      paint(p, p.rect.left, top); setDrag(d => d ? { ...d, settling: true } : d);
      const finish = () => {
        if (pending.current !== p) return;
        const slot = scope.current?.querySelector<HTMLElement>(`[data-section-card="${id}"]`);
        // Preserve where the card was dropped (especially after edge scrolling).
        const relativeTop = slot ? slot.getBoundingClientRect().top - p.scroll.getBoundingClientRect().top : 0;
        moveSection(profile!.profileId, id, p.before); reset(); announceMove(id);
        requestAnimationFrame(() => {
          const target = scope.current?.querySelector<HTMLElement>(`[data-section-card="${id}"]`);
          if (target && relativeTop >= 0 && relativeTop < p.scroll.clientHeight) p.scroll.scrollTop += target.getBoundingClientRect().top - p.scroll.getBoundingClientRect().top - relativeTop;
          p.element.focus({ preventScroll: true });
        });
      };
      timer.current = setTimeout(finish, reduced() ? 0 : 180);
    },
    onPointerCancel: () => { reset(); setAnnouncement('Move cancelled. Section order unchanged.'); },
    onLostPointerCapture: () => {
      const p = pending.current;
      // Allow React's keyed DOM move to reacquire capture in the layout effect.
      requestAnimationFrame(() => {
        if (p && pending.current === p && !p.settling && !p.element.hasPointerCapture(p.pointer)) {
          reset(); setAnnouncement('Move cancelled. Section order unchanged.');
        }
      });
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (pending.current || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const p = useAppStore.getState().profiles.find(p => p.profileId === profile?.profileId);
      if (!p) return;
      const ids = orderedSections(p).map(s => s.id); const index = ids.indexOf(id);
      const destination = e.key === 'Home' ? 1 : e.key === 'End' ? ids.length - 1 : index + (e.key === 'ArrowUp' ? -1 : 1);
      if (destination < 1 || destination >= ids.length || destination === index) return;
      const remaining = ids.filter(x => x !== id);
      moveSection(profile!.profileId, id, remaining[destination] || null); announceMove(id);
      requestAnimationFrame(() => { scope.current?.querySelector<HTMLElement>(`[data-section-card="${id}"] .section-drag-handle`)?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); });
    },
  });
  return {
    drag, announcement, helpId, handleProps,
    slotStyle: (id: SectionId): CSSProperties | undefined => drag?.id === id ? { height: drag.height } : undefined,
    cardStyle: (id: SectionId): CSSProperties | undefined => drag?.id === id ? { position: 'fixed', top: drag.top, left: drag.left, width: drag.width } : undefined,
  };
}
