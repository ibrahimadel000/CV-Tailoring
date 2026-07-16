import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { sanitizeExtensionPayload, sendToExtension, type ExtensionMessage } from '@/services/extensionBridge';

/**
 * Hook to manage the postMessage handshake with the browser extension.
 * Automatically mounts a listener, responds to PINGs, and handles JD_IMPORT payloads.
 */
export function useExtensionBridge() {
  const { setExtensionConnected, setJobDescription, setError } = useAppStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // 1. Check if we were launched with an import intent in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    const token = urlParams.get('token');

    if (action !== 'import' || !token) {
      return; // Standard manual session, ignore extension logic
    }

    setExtensionConnected(true, token);

    // 2. Setup the postMessage listener
    const handleMessage = (event: MessageEvent) => {
      // In a real app, validate event.origin here against EXPECTED_ORIGIN
      
      const data = event.data as ExtensionMessage;
      
      if (!data || typeof data !== 'object') return;

      if (data.type === 'PING') {
        // Extension is polling to see if we've mounted
        setIsReady(true);
        if (event.source) {
          sendToExtension(event.source, { type: 'READY' });
        }
        return;
      }

      if (data.type === 'JD_IMPORT') {
        try {
          // Token correlation check
          if (data.token !== token) {
            throw new Error('Invalid security token.');
          }

          // Sanitize payload
          const safeJD = sanitizeExtensionPayload(data.payload);
          
          // Success
          setJobDescription(safeJD);
          if (event.source) {
            sendToExtension(event.source, { type: 'IMPORT_SUCCESS' });
          }
          
        } catch (err: any) {
          console.error('JD Import failed:', err);
          setError(err.message || 'Failed to import job description.');
          if (event.source) {
            sendToExtension(event.source, { type: 'IMPORT_ERROR', error: err.message });
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [setExtensionConnected, setJobDescription, setError]);

  return { isReady };
}
