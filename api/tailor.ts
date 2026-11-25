// Vercel Serverless / Edge Function for POST /api/tailor.
// Set GEMINI_API_KEY (and optional TAILOR_ACCESS_TOKEN) in Vercel Environment Variables.
import { handleTailorRequest } from '../server/tailorHandler.mjs';

export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
  return handleTailorRequest(request, {
    apiKey: process.env.GEMINI_API_KEY || '',
    accessToken: process.env.TAILOR_ACCESS_TOKEN || '',
  });
}
