import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
export type SaveStatus = 'loading' | 'saving' | 'saved' | 'error' | 'conflict';

const TAB_SYNC_CHANNEL = 'cv-tailor-tab-sync-v1';
const TAB_SYNC_STORAGE_KEY = 'cv-tailor-tab-sync-v1';

let loadPromise: Promise<boolean> | null = null;

function createTabId(): string {
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useBuilderPersistence() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [message, setMessage] = useState('');
  const [tabConflict, setTabConflict] = useState(false);
  const dirty = useRef(false);
  const conflictRef = useRef(false);
  const saveNowRef = useRef<(() => void) | null>(null);
  const reloadRef = useRef<(() => Promise<void>) | null>(null);
  const keepHereRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let live = true;
    let loaded = false;
    let reloading = false;
    let revision = 0;
    let lastEnqueuedRevision = -1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    let queue = Promise.resolve();
    const tabId = createTabId();

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(TAB_SYNC_CHANNEL);
      } catch {
        channel = null;
      }
    }

    const notifyOtherTabs = () => {
      const payload = { type: 'saved', tabId, ts: Date.now() };
      try {
        channel?.postMessage(payload);
      } catch {
        // Channel closed or unavailable
      }
      try {
        window.localStorage.setItem(TAB_SYNC_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Storage unavailable in private contexts
      }
    };

    const flagConflict = () => {
      if (!loaded || conflictRef.current) return;
      conflictRef.current = true;
      clearTimeout(timer);
      if (live) {
        setTabConflict(true);
        setStatus('conflict');
        setMessage('This workspace was updated in another browser tab. Autosave is paused here so newer changes aren’t overwritten.');
      }
    };

    const onChannelMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; tabId?: string } | null;
      if (data?.type === 'saved' && data.tabId && data.tabId !== tabId) {
        flagConflict();
      }
    };
    channel?.addEventListener('message', onChannelMessage);

    const onStorageEvent = (event: StorageEvent) => {
      if (event.key !== TAB_SYNC_STORAGE_KEY || !event.newValue) return;
      try {
        const data = JSON.parse(event.newValue) as { type?: string; tabId?: string };
        if (data?.type === 'saved' && data.tabId && data.tabId !== tabId) {
          flagConflict();
        }
      } catch {
        // Ignore malformed storage payload
      }
    };
    window.addEventListener('storage', onStorageEvent);

    const enqueueWrite = (broadcast = true) => {
      if (conflictRef.current || reloading) return;
      const targetRevision = revision;
      lastEnqueuedRevision = targetRevision;
      queue = queue.then(async () => {
        if (conflictRef.current || reloading) return;
        try {
          await useAppStore.getState().saveToStorage();
          if (broadcast) notifyOtherTabs();
          if (targetRevision === revision && !conflictRef.current) {
            dirty.current = false;
            if (live) { setStatus('saved'); setMessage(''); }
          }
        } catch {
          if (live && !conflictRef.current) {
            setStatus('error');
            setMessage('Could not save in this browser. Keep this tab open and retry saving before leaving.');
          }
        }
      });
    };

    const scheduleSave = (broadcast = true) => {
      if (conflictRef.current || reloading) return;
      dirty.current = true;
      revision++;
      if (live) setStatus('saving');
      clearTimeout(timer);
      timer = setTimeout(() => enqueueWrite(broadcast), 450);
    };

    const flushSave = () => {
      if (!loaded || conflictRef.current || reloading) return;
      clearTimeout(timer);
      if (dirty.current && lastEnqueuedRevision !== revision) {
        if (live) setStatus('saving');
        enqueueWrite(true);
      }
    };

    saveNowRef.current = () => {
      if (!loaded || conflictRef.current || reloading) return;
      dirty.current = true;
      revision++;
      if (live) setStatus('saving');
      clearTimeout(timer);
      enqueueWrite(true);
    };

    reloadRef.current = async () => {
      clearTimeout(timer);
      await queue.catch(() => {});
      reloading = true;
      // Clear conflict BEFORE reading storage so a concurrent save from another tab mid-reload re-arms it.
      conflictRef.current = false;
      try {
        await useAppStore.getState().loadFromStorage();
        dirty.current = false;
        if (live && !conflictRef.current) {
          setTabConflict(false);
          setStatus('saved');
          setMessage('');
        }
      } catch {
        if (live) {
          setStatus('error');
          setMessage('Could not reload the latest resumes from this browser.');
        }
      } finally {
        reloading = false;
      }
    };

    keepHereRef.current = () => {
      conflictRef.current = false;
      if (live) {
        setTabConflict(false);
        setMessage('');
      }
      saveNowRef.current?.();
    };

    if (!loadPromise) {
      loadPromise = useAppStore.getState().loadFromStorage().catch(err => {
        loadPromise = null;
        throw err;
      });
    }

    loadPromise.then((needsPersist) => {
      if (!live) return;
      loaded = true;
      setReady(true);
      if (needsPersist) {
        // Persist newly created default profile or migrated legacy theme without falsely flagging idle tabs.
        scheduleSave(false);
      } else {
        setStatus('saved');
        setMessage('');
      }
      unsubscribe = useAppStore.subscribe((state, prev) => {
        if (reloading) return;
        if (
          state.profiles !== prev.profiles ||
          state.activeProfileId !== prev.activeProfileId ||
          state.documentTheme !== prev.documentTheme
        ) {
          scheduleSave(true);
        }
      });
    }).catch(() => {
      if (live) {
        setStatus('error');
        setMessage('Saved resumes could not be loaded. Refresh to retry; existing data has not been overwritten.');
      }
    });

    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (dirty.current && !conflictRef.current) {
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
      reloadRef.current = null;
      keepHereRef.current = null;
      clearTimeout(timer);
      unsubscribe?.();
      channel?.removeEventListener('message', onChannelMessage);
      channel?.close();
      window.removeEventListener('storage', onStorageEvent);
      window.removeEventListener('beforeunload', warnUnsaved);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      if (loaded && dirty.current && !conflictRef.current && !reloading) {
        void useAppStore.getState().saveToStorage().catch(() => {});
      }
    };
  }, []);

  const retrySave = useCallback(() => {
    saveNowRef.current?.();
  }, []);

  const reloadLatest = useCallback(() => {
    void reloadRef.current?.();
  }, []);

  const keepEditingHere = useCallback(() => {
    keepHereRef.current?.();
  }, []);

  return { ready, status, message, tabConflict, retrySave, reloadLatest, keepEditingHere };
}
