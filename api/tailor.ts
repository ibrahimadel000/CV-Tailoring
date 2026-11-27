// Vercel Node Serverless Function for POST /api/tailor.
// Set GEMINI_API_KEY (and optional TAILOR_ACCESS_TOKEN / TAILOR_ALLOWED_ORIGIN) in Vercel Environment Variables.
import { handleTailorRequest } from '../server/tailorHandler.mjs';

export const maxDuration = 60;

async function handle(request: Request) {
  const clientIp =
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ||
    'unknown';
  return handleTailorRequest(request, {
    apiKey: process.env.GEMINI_API_KEY || '',
    accessToken: process.env.TAILOR_ACCESS_TOKEN || '',
    allowedOrigin: process.env.TAILOR_ALLOWED_ORIGIN || '',
    clientIp,
  });
}

export async function POST(request: Request) {
  return handle(request);
}

export async function OPTIONS(request: Request) {
  return handle(request);
}
