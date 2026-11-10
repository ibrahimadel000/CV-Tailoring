// Test-only development server. Never load .env files or reuse a real API key.
(async () => {
  for (const name of Object.keys(process.env)) {
    if (/^(VITE_|GEMINI_|GOOGLE_)/.test(name)) delete process.env[name];
  }
  process.env.VITE_GEMINI_API_KEY = 'synthetic-offline-sc1-key';
  const { createServer } = await import('vite');
  const server = await createServer({
    envDir: false,
    envFile: false,
    mode: 'offline-acceptance',
    server: { host: '127.0.0.1', port: 4187, strictPort: true, hmr: false },
  });
  const stop = async () => { await server.close(); process.exit(0); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  await server.listen();
})().catch(error => { console.error(error); process.exit(1); });
