import { useEffect, useId, useRef, useState, type RefObject, type PointerEvent as ReactPointerEvent } from 'react';
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

// Pointer Events support mouse, pen and touch without an extra dependency.
// Only the handle captures a gesture; text fields and ordinary scrolling stay native.
export function useSectionDrag(profile: CVProfile | undefined, scope: RefObject<HTMLElement>) {
  const helpId = useId();
  const [drag, setDrag] = useState<{ id: SectionId; before: SectionId | null; y: number; x: number } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const pending = useRef<{ id: SectionId; pointer: number; startX: number; startY: number; x: number; y: number; active: boolean; valid: boolean; before: SectionId | null; element: HTMLButtonElement } | null>(null);
  const frame = useRef(0);
  const announceMove = (id: SectionId) => {
    const p = useAppStore.getState().profiles.find(p => p.profileId === profile?.profileId);
    if (!p) return;
    const items = orderedSections(p); const index = items.findIndex(s => s.id === id);
    setAnnouncement(`${items[index]?.title} moved to position ${index + 1} of ${items.length}.`);
  };
  const reset = () => {
    const p = pending.current;
    pending.current = null; cancelAnimationFrame(frame.current); setDrag(null);
    if (p?.element.hasPointerCapture(p.pointer)) p.element.releasePointerCapture(p.pointer);
  };
  const locate = () => {
    const p = pending.current; const root = scope.current;
    if (!p || !root || !p.active) return;
    const bounds = root.getBoundingClientRect();
    p.valid = p.x >= bounds.left - 24 && p.x <= bounds.right + 24 && p.y >= bounds.top - 36 && p.y <= bounds.bottom + 36;
    const rows = [...root.querySelectorAll<HTMLElement>('[data-sort-id]')].filter(el => el.dataset.sortId !== p.id && el.dataset.sortId !== 'personal');
    const target = rows.find(el => { const r = el.getBoundingClientRect(); return p.y < r.top + r.height / 2; });
    p.before = (target?.dataset.sortId as SectionId) || null;
    setDrag({ id: p.id, before: p.before, y: p.y, x: p.x });
  };
  const tick = () => {
    const p = pending.current;
    if (!p?.active) return;
    const scroll = scope.current?.closest<HTMLElement>('.editor-scroll, .section-rail');
    if (scroll && p.valid) {
      const r = scroll.getBoundingClientRect();
      const speed = p.y < r.top + 56 ? -9 : p.y > r.bottom - 56 ? 9 : 0;
      if (speed) scroll.scrollTop += speed;
    }
    locate(); frame.current = requestAnimationFrame(tick);
  };
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => { if (e.key === 'Escape' && pending.current) { reset(); setAnnouncement('Move cancelled. Section order unchanged.'); } };
    window.addEventListener('keydown', cancel);
    return () => { window.removeEventListener('keydown', cancel); cancelAnimationFrame(frame.current); pending.current = null; };
  }, [profile?.profileId]);
  const handleProps = (id: SectionId, title: string) => ({
    type: 'button' as const, className: 'section-drag-handle',
    'aria-label': `Move ${title}`, 'aria-describedby': helpId,
    title: 'Drag to reorder · Arrow keys to move',
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 || !e.isPrimary || id === 'personal') return;
      e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId);
      pending.current = { id, pointer: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, valid: true, before: null, element: e.currentTarget };
    },
    onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => {
      const p = pending.current; if (!p || p.pointer !== e.pointerId) return;
      p.x = e.clientX; p.y = e.clientY;
      if (!p.active && Math.hypot(p.x - p.startX, p.y - p.startY) > 5) { p.active = true; setAnnouncement(`Moving ${title}. Drop between sections. Escape cancels.`); locate(); frame.current = requestAnimationFrame(tick); }
      else if (p.active) locate();
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      const p = pending.current; if (!p || p.pointer !== e.pointerId) return;
      if (p.active && p.valid) { moveSection(profile!.profileId, id, p.before); announceMove(id); }
      reset();
    },
    onPointerCancel: () => reset(), onLostPointerCapture: () => { if (pending.current) reset(); },
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const p = useAppStore.getState().profiles.find(p => p.profileId === profile?.profileId);
      if (!p) return;
      const ids = orderedSections(p).map(s => s.id); const index = ids.indexOf(id);
      const destination = e.key === 'Home' ? 1 : e.key === 'End' ? ids.length - 1 : index + (e.key === 'ArrowUp' ? -1 : 1);
      if (destination < 1 || destination >= ids.length || destination === index) return;
      const remaining = ids.filter(x => x !== id);
      moveSection(profile!.profileId, id, remaining[destination] || null); announceMove(id);
    },
  });
  return { drag, announcement, helpId, handleProps, rowClass: (id: SectionId) => `${drag?.id === id ? 'is-dragging' : ''} ${drag && drag.before === id ? 'drop-before' : ''}`, endClass: drag && drag.before === null ? 'drop-at-end' : '' };
}
