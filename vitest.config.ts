import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  resolve: {
    // Mirrors the `@/*` path alias in tsconfig, so components can be imported
    // into tests without rewriting their own imports.
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  // tsconfig sets `jsx: "preserve"` because Next's compiler wants the JSX
  // untouched. Vitest has no such compiler in front of it, so this plugin owns
  // the JSX transform for tests, leaving the production build unaffected.
  plugins: [react()],
  test: {
    // Node by default; component tests opt into jsdom with a
    // `@vitest-environment jsdom` docblock, so the rest of the suite stays fast.
    environment: 'node',
  },
});
