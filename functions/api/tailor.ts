// Cloudflare Pages Function for POST /api/tailor.
// Set GEMINI_API_KEY (and optional TAILOR_ACCESS_TOKEN) as Cloudflare Pages secrets.
import { handleTailorRequest } from '../../server/tailorHandler.mjs';

interface Env {
  GEMINI_API_KEY?: string;
  TAILOR_ACCESS_TOKEN?: string;
}

export const onRequest = async (context: { request: Request; env: Env }) =>
  handleTailorRequest(context.request, {
    apiKey: context.env.GEMINI_API_KEY || '',
    accessToken: context.env.TAILOR_ACCESS_TOKEN || '',
  });
