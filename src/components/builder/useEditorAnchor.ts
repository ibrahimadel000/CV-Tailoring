import { useLayoutEffect, useRef } from 'react';

// Scroll only the editor, not the document or PDF. Keep the clicked heading in
// view when another expanded form above it disappears in the same commit.
export function useEditorAnchor() {
  const pending = useRef<{ node: HTMLElement; offset: number; focus: boolean } | null>(null);
  useLayoutEffect(() => {
    const request = pending.current; pending.current = null;
    if (!request?.node.isConnected) return;
    const container = request.node.closest<HTMLElement>('.editor-scroll');
    if (!container) return;
    container.scrollTop += request.node.getBoundingClientRect().top - container.getBoundingClientRect().top - request.offset;
    if (request.focus) request.node.focus({ preventScroll: true });
  });
  return (node: HTMLElement | null, focus = false) => {
    const container = node?.closest<HTMLElement>('.editor-scroll');
    if (!node || !container) return;
    const top = node.getBoundingClientRect().top - container.getBoundingClientRect().top;
    pending.current = { node, focus, offset: Math.max(12, Math.min(top, Math.max(12, container.clientHeight - 100))) };
  };
}
