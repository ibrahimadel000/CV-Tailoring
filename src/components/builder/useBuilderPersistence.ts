import { useEffect, useRef, useState } from 'react';
import { profileStorage, useAppStore } from '@/store/useAppStore';
import { StorageConflictError, StorageGraphError } from '@/store/profileStorage';
export type SaveStatus = 'loading' | 'blocked' | 'saving' | 'saved' | 'error' | 'conflict';
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
            // A versionchange may have invalidated the connection while this
            // transaction was still finishing. Never clear that warning.
            if (conflict.current) return;
            if (currentRevision === revision) {
              dirty.current = false;
              if (live) { setStatus('saved'); setMessage(''); }
            }
          } catch (error) {
            if (conflict.current) return;
            if (error instanceof StorageConflictError) {
              conflict.current = true;
              if (live) { setStatus('conflict'); setMessage('The saved workspace changed in another updated tab. This tab’s edits are not saved and remain here. Keep it open; open a separate tab to see the saved version and manually reconcile your edits. A JSON copy is available only for supported data and may contain sensitive text.'); }
            } else if (live) { setStatus('error'); setMessage(error instanceof StorageGraphError ? 'Could not save without changing unsupported or shared data relationships. The saved workspace is unchanged. Keep this tab open and copy edits manually; this prototype cannot safely save this change.' : 'Could not save in this browser. The saved workspace is unchanged. Keep this tab open and retry saving before leaving.'); }
          }
        });
      }, delay);
    };
    const unsubscribeNotice = profileStorage.subscribe(notice => {
      if (!live) return;
      if (notice === 'blocked') {
        setStatus('blocked');
        setMessage('An older app tab or another connection is blocking the storage upgrade. Save or copy its unsaved edits, then close it. This page will continue when the connection closes; do not discard work.');
      } else {
        conflict.current = true;
        if (loaded) dirty.current = true;
        setStatus('conflict');
        setMessage('The storage connection was closed for a database change. This tab cannot save and will not reload automatically. Keep it open and manually copy any unsaved work before leaving.');
      }
    });
    retry.current = () => schedule(0);
    if (!loadPromise) loadPromise = useAppStore.getState().loadFromStorage();
    loadPromise.then(needsSave => {
      if (!live) return;
      loaded = true;
      setReady(true);
      unsubscribe = useAppStore.subscribe((state, prev) => {
        if (state.profiles !== prev.profiles || state.activeProfileId !== prev.activeProfileId || state.documentTheme !== prev.documentTheme) schedule();
      });
      if (conflict.current) { dirty.current = true; return; }
      setMessage('');
      if (needsSave) schedule(); else setStatus('saved');
    }).catch(() => {
      if (live) { setStatus('error'); setMessage('Saved resumes could not be loaded or migrated safely. Existing data has not been overwritten. Close blocking tabs only after saving or copying their work, then reload to retry. Unsupported saved data requires manual investigation.'); }
    });
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (dirty.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warnUnsaved);
    return () => {
      live = false;
      clearTimeout(timer);
      unsubscribe?.();
      unsubscribeNotice();
      window.removeEventListener('beforeunload', warnUnsaved);
      if (loaded && dirty.current && !conflict.current) void useAppStore.getState().saveToStorage().catch(() => {});
    };
  }, []);
  return { ready, status, message, retrySave: () => retry.current() };
}
