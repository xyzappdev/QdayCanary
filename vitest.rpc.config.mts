import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

// Hits Solana mainnet. Run on demand: npm run test:rpc
// Reads .env / .env.local like Next does, so SOLANA_RPC_URL from there is used.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      // server-only throws outside a React Server Components build.
      'server-only': fileURLToPath(new URL('./tests/empty.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.rpc.test.ts'],
    environment: 'node',
    testTimeout: 180_000,
    env: loadEnv('', process.cwd(), ''),
  },
});
