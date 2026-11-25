import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
export type SaveStatus = 'loading' | 'saving' | 'saved' | 'error';

let loadPromise: Promise<void> | null = null;

export function useBuilderPersistence() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [message, setMessage] = useState('');
  const dirty = useRef(false);
  const saveNowRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let live = true;
    let loaded = false;
    let revision = 0;
    let lastEnqueuedRevision = -1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    let queue = Promise.resolve();

    const enqueueWrite = () => {
      const targetRevision = revision;
      lastEnqueuedRevision = targetRevision;
      queue = queue.then(async () => {
        try {
          await useAppStore.getState().saveToStorage();
          if (targetRevision === revision) {
            dirty.current = false;
            if (live) { setStatus('saved'); setMessage(''); }
          }
        } catch {
          if (live) {
            setStatus('error');
            setMessage('Could not save in this browser. Keep this tab open and retry saving before leaving.');
          }
        }
      });
    };

    const scheduleSave = () => {
      dirty.current = true;
      revision++;
      if (live) setStatus('saving');
      clearTimeout(timer);
      timer = setTimeout(enqueueWrite, 450);
    };

    const flushSave = () => {
      if (!loaded) return;
      clearTimeout(timer);
      if (dirty.current && lastEnqueuedRevision !== revision) {
        if (live) setStatus('saving');
        enqueueWrite();
      }
    };

    saveNowRef.current = () => {
      if (!loaded) return;
      dirty.current = true;
      revision++;
      if (live) setStatus('saving');
      clearTimeout(timer);
      enqueueWrite();
    };

    if (!loadPromise) {
      loadPromise = useAppStore.getState().loadFromStorage().catch(err => {
        loadPromise = null;
        throw err;
      });
    }

    loadPromise.then(() => {
      if (!live) return;
      loaded = true;
      setReady(true);
      scheduleSave();
      unsubscribe = useAppStore.subscribe((state, prev) => {
        if (
          state.profiles !== prev.profiles ||
          state.activeProfileId !== prev.activeProfileId ||
          state.documentTheme !== prev.documentTheme
        ) {
          scheduleSave();
        }
      });
    }).catch(() => {
      if (live) {
        setStatus('error');
        setMessage('Saved resumes could not be loaded. Refresh to retry; existing data has not been overwritten.');
      }
    });

    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        flushSave();
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushSave();
    };
    const onPageHide = () => {
      flushSave();
    };

    window.addEventListener('beforeunload', warnUnsaved);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      live = false;
      saveNowRef.current = null;
      clearTimeout(timer);
      unsubscribe?.();
      window.removeEventListener('beforeunload', warnUnsaved);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      if (loaded && dirty.current) void useAppStore.getState().saveToStorage().catch(() => {});
    };
  }, []);

  const retrySave = useCallback(() => {
    saveNowRef.current?.();
  }, []);

  return { ready, status, message, retrySave };
}
