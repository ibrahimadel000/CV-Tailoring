import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
export type SaveStatus = 'loading' | 'saving' | 'saved' | 'error';
let loadPromise: Promise<void> | null = null;
export function useBuilderPersistence() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const dirty = useRef(false);
  useEffect(() => {
    let live = true;
    let loaded = false;
    let revision = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    let queue = Promise.resolve();
    const save = () => {
      dirty.current = true;
      revision++;
      if (live) setStatus('saving');
      clearTimeout(timer);
      timer = setTimeout(() => {
        queue = queue.then(async () => {
          const currentRevision = revision;
          try {
            await useAppStore.getState().saveToStorage();
            if (currentRevision === revision) {
              dirty.current = false;
              if (live) { setStatus('saved'); setMessage(''); }
            }
          } catch {
            if (live) { setStatus('error'); setMessage('Could not save in this browser. Keep this tab open and retry saving before leaving.'); }
          }
        });
      }, 450);
    };
    if (!loadPromise) loadPromise = useAppStore.getState().loadFromStorage();
    loadPromise.then(() => {
      if (!live) return;
      loaded = true;
      setReady(true);
      save();
      unsubscribe = useAppStore.subscribe((state, prev) => {
        if (state.profiles !== prev.profiles || state.activeProfileId !== prev.activeProfileId || state.documentTheme !== prev.documentTheme) save();
      });
    }).catch(() => {
      if (live) { setStatus('error'); setMessage('Saved resumes could not be loaded. Refresh to retry; existing data has not been overwritten.'); }
    });
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (dirty.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warnUnsaved);
    return () => {
      live = false;
      clearTimeout(timer);
      unsubscribe?.();
      window.removeEventListener('beforeunload', warnUnsaved);
      if (loaded && dirty.current) void useAppStore.getState().saveToStorage().catch(() => {});
    };
  }, [retry]);
  // Retry saving the current in-memory data, not reloading older data over edits.
  return { ready, status, message, retrySave: () => setRetry(x => x + 1) };
}
