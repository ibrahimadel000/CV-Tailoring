import DOMPurify from 'dompurify';

export type ExtensionMessage = 
  | { type: 'PING' }
  | { type: 'JD_IMPORT'; token: string; payload: string };

export type AppMessage = 
  | { type: 'READY' }
  | { type: 'IMPORT_SUCCESS' }
  | { type: 'IMPORT_ERROR'; error: string };

export const EXPECTED_ORIGIN = 'chrome-extension://<EXTENSION_ID_PLACEHOLDER>'; // In a real app, this is configured per environment

/**
 * Validates and sanitizes an incoming JD payload from the extension.
 * Strips all HTML to prevent XSS. Limits length to 50KB.
 */
export function sanitizeExtensionPayload(rawHtml: string): string {
  if (rawHtml.length > 50000) {
    throw new Error('Payload too large. Maximum size is 50KB.');
  }

  // Strip all HTML tags, leaving only text
  const cleanText = DOMPurify.sanitize(rawHtml, { ALLOWED_TAGS: [] });
  
  if (!cleanText.trim()) {
    throw new Error('Payload is empty after sanitization.');
  }

  return cleanText.trim();
}

/**
 * Sends a message back to the extension
 */
export function sendToExtension(sourceWindow: MessageEventSource, message: AppMessage) {
  (sourceWindow as Window).postMessage(message, '*'); // Origin restricted on receipt, but we send back to whoever pinged us
}
