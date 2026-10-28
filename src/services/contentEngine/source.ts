/** Public shared source guard. Shape/schema remains owned by engine.ts.
 * Composer callers should preserve their own error mapping and reserved identity
 * metadata validation, then call this guard rather than duplicate graph checks.
 */
export { parseSourceGraph } from './engine';
