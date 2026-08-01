import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
