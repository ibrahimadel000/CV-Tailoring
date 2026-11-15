import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { StorageConflictError } from '@/store/profileStorage';
export type SaveStatus = 'loading' | 'saving' | 'saved' | 'error' | 'conflict';
let loadPromise: Promise<boolean> | null = null;
export function useBuilderPersistence() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [message, setMessage] = useState('');
  const dirty = useRef(false), conflict = useRef(false);
  const retry = useRef<() => void>(() => {});
  useEffect(() => {
    let live = true, loaded = false, revision = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    let queue = Promise.resolve();
    const schedule = (delay = 450) => {
      dirty.current = true;
      revision++;
      if (conflict.current) return;
      if (live) setStatus('saving');
      clearTimeout(timer);
      timer = setTimeout(() => {
        queue = queue.then(async () => {
          if (conflict.current) return;
          const currentRevision = revision;
          try {
            await useAppStore.getState().saveToStorage();
            if (currentRevision === revision) {
              dirty.current = false;
              if (live) { setStatus('saved'); setMessage(''); }
            }
          } catch (error) {
            if (error instanceof StorageConflictError) {
              conflict.current = true;
              if (live) { setStatus('conflict'); setMessage('The saved workspace changed in another tab or contains unsupported data that cannot be safely compared. This tab’s edits are not saved and remain here. Keep this tab open; open a separate tab to see the saved version and manually reconcile your edits. Download a JSON copy first if useful; it may contain sensitive comparisons and cannot automatically restore all metadata.'); }
            } else if (live) { setStatus('error'); setMessage('Could not save in this browser. Keep this tab open and retry saving before leaving.'); }
          }
        });
      }, delay);
    };
    retry.current = () => schedule(0);
    if (!loadPromise) loadPromise = useAppStore.getState().loadFromStorage();
    loadPromise.then(needsSave => {
      if (!live) return;
      loaded = true;
      setReady(true);
      unsubscribe = useAppStore.subscribe((state, prev) => {
        if (state.profiles !== prev.profiles || state.activeProfileId !== prev.activeProfileId || state.documentTheme !== prev.documentTheme) schedule();
      });
      if (needsSave) schedule(); else setStatus('saved');
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
      if (loaded && dirty.current && !conflict.current) void useAppStore.getState().saveToStorage().catch(() => {});
    };
  }, []);
  return { ready, status, message, retrySave: () => retry.current() };
}
