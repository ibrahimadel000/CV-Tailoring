import { z } from 'zod';

/**
 * Step 1: Strip markdown code fences and conversational wrapper text
 */
function extractJSON(raw: string): string {
  // Remove ```json ... ``` wrapping
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  
  // Find the first { or [ and last } or ]
  const firstBrace = raw.search(/[{[]/);
  const lastBrace = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }
  
  return raw; // Let JSON.parse fail with a clear error
}

/**
 * Step 2: Parse with Zod schema validation
 * Throws if JSON is invalid or schema doesn't match.
 */
export function parseAIResponse<T>(raw: string, schema: z.ZodType<T>): T {
  const cleaned = extractJSON(raw);
  const parsed = JSON.parse(cleaned);
  return schema.parse(parsed);
}
