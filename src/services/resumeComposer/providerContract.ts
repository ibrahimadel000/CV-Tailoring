/** Pure provider-schema projection: no fetch/key/repair/fallback. */
import { boundCompositionContract, referencePolicy } from './references';
import type { CompositionPacket } from './core';
// Google responseSchema uses a subset of JSON Schema. Local compiler keeps all limits.
type Node = { type?: string; enum?: string[]; properties?: Record<string, Node>; items?: Node; required?: string[]; minItems?: number; maxItems?: number };
export function googleCompositionSchema(packet: CompositionPacket) {
  const expected = boundCompositionContract(packet.source);
  if (packet.revision !== 'document-compose-v3-document-focus' || JSON.stringify(packet.outputContract) !== JSON.stringify(expected) || JSON.stringify(packet.referencePolicy) !== JSON.stringify(referencePolicy(packet.source))) throw Error('Composition contract mismatch. No request should be sent.');
  return projectGoogleSchema(expected);
}
// Shared schema projection only; each version validates its own packet first.
export function projectGoogleSchema(expected: Node) {
  const convert = (node: Node): Node => ({
    ...(node.type ? { type: node.type.toUpperCase() } : {}),
    // Google rejects empty string enum members (confirmed HTTP 400). Do not
    // substitute a sentinel or require invented text. Keep the full enum in the
    // prompt/application contract and enforce the empty slot locally instead.
    ...(node.enum && !node.enum.includes('') ? { enum: [...node.enum] } : {}),
    ...(node.required ? { required: [...node.required] } : {}),
    ...(node.properties ? { properties: Object.fromEntries(Object.entries(node.properties).map(([k, v]) => [k, convert(v)])) } : {}),
    ...(node.items ? { items: convert(node.items) } : {}),
    // Positive array-count bounds inflate the provider decoding grammar, especially
    // nested bullet/sourceIds arrays. Keep counts in the application contract and
    // compiler, not the provider grammar. Zero is retained for locked/empty lists.
    ...(node.maxItems === 0 ? { maxItems: 0 } : {}),
  });
  return convert(expected);
}
