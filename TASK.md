# Current Task — Release Verification & Deployment

All planned engineering phases (Phases 1, 2, 3.1, 3.2, and 3.3) are implemented on `fix/cv-tailor-phase1-phase2`.

## Remaining Release Steps

1. Run `npm install` (to sync `package-lock.json` after removing 5 unused packages), `npm run build`, and `node --test tests/*.test.cjs`.
2. Push `fix/cv-tailor-phase1-phase2` to GitHub and open/merge PR into `main`.
3. Deploy to Cloudflare Pages, Vercel, or standalone Node with `GEMINI_API_KEY` and `VITE_TAILOR_API_URL=/api/tailor`, then smoke-test `POST /api/tailor` and PDF export.
