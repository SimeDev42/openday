import { existsSync } from 'node:fs';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!credentials) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

if (!existsSync(credentials)) {
  console.error(`Service account file not found at ${credentials}`);
  process.exit(1);
}

const server = createApp().listen(port, () => {
  console.log(`openday listening on http://localhost:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
