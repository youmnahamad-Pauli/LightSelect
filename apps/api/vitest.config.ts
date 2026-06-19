import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    // Provide dummy env vars so db/client.ts loads without crashing.
    // Tests that use generateExportZip and the pure resolver helpers
    // never actually execute DB queries.
    env: {
      DATABASE_URL: 'postgres://localhost:5432/test-dummy',
      JWT_SECRET: 'test-secret-dummy',
    },
    coverage: {
      reporter: ['text', 'json'],
      include: ['src/services/export-*.ts'],
    },
  },
});
