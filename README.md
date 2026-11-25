# CV Tailor Studio

A React and TypeScript application for building structured CVs, tailoring them truthfully against target job descriptions with Gemini, reviewing edits with an interactive word-level diff, and exporting A4 PDFs.

## Features

- **CV Builder:** Structured editor for personal details, summary, work experience, education, certifications, and skills with local browser persistence (`zustand` + `idb-keyval`).
- **Truthful AI CV Tailor:** Evidence-first tailoring pipeline powered by Gemini (`gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.8-flash`) with Plan-Then-Write prompting, hard hallucination guards, and selective skill pruning while keeping the original CV untouched.
- **Interactive Word-Level Diff:** Inline word-level diff review (`diff`) with 1-click summary revert, per-bullet revert, and omitted-skill restore chips.
- **A4 PDF Export:** Client-side A4 PDF generation using `@react-pdf/renderer` with clean pagination and disabled mid-word hyphenation.
- **Server-Side API Proxy:** Platform-agnostic `/api/tailor` proxy that keeps `GEMINI_API_KEY` off the browser and enforces model allowlisting, payload caps, rate limiting, abort forwarding, and optional Bearer auth.

## Architecture

| Layer | Technology | Role |
| --- | --- | --- |
| Frontend | React 18, TypeScript 5.7, Vite 6, Tailwind CSS 4 | SPA UI, editor, and interactive diff review |
| State & Storage | Zustand, `idb-keyval` | Client state management and IndexedDB persistence |
| Validation & Diffing | Zod, `zod-to-json-schema`, `diff` | Schema validation and word-level diffs |
| PDF Pipeline | `@react-pdf/renderer`, `pdfjs-dist` | A4 PDF rendering/export and PDF parsing |
| Backend Proxy | `server/tailorHandler.mjs` (Web Standard Fetch) | Shared `POST /api/tailor` handler for Node, Cloudflare Pages, and Vercel |

## Local Setup

1. **Install dependencies** (Node.js 18+ required; Node 24 for full offline test helpers):

   ```bash
   npm install
   ```

2. **Configure environment variables:**

   ```bash
   cp .env.example .env
   ```

   Set your server-side key and proxy path in `.env`:

   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   VITE_TAILOR_API_URL=/api/tailor
   # Optional: protect /api/tailor with a bearer token
   # TAILOR_ACCESS_TOKEN=
   ```

3. **Run the proxy server and Vite dev server** in two terminals:

   ```bash
   npm run server
   npm run dev
   ```

   Vite proxies `/api` requests to `http://localhost:8787` (check `http://localhost:8787/api/health`).

## Production Deployment

Set `VITE_TAILOR_API_URL=/api/tailor` at build time and configure `GEMINI_API_KEY` (plus optional `TAILOR_ACCESS_TOKEN`) as server-side secrets.

- **Cloudflare Pages:** Build command `npm run build`, output directory `dist`. Automatically serves `functions/api/tailor.ts` at `POST /api/tailor`.
- **Vercel:** Build command `npm run build`, output directory `dist`. Automatically serves `api/tailor.ts` (Edge Runtime) at `POST /api/tailor`.
- **Standalone Node:** Build and serve both `dist/` and `/api/tailor` from one process:

  ```bash
  npm run build
  GEMINI_API_KEY=your_key PORT=8787 npm run server
  ```

## Testing & Verification

```bash
npm run build
node --test tests/*.test.cjs
npm run test:browser:offline
```
