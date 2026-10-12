import { defineConfig } from 'vitest/config';

/**
 * One runner for every workspace package.
 *
 * Six `.test.ts` files lived in this repo for months with nothing able to
 * execute them: no runner was installed and no script referenced them. They
 * were written as standalone scripts that called `process.exit`, which is
 * what you write when you intend to run a file by hand and then never do.
 *
 * `environment: 'jsdom'` because some of these touch browser APIs the POS
 * depends on — localStorage for the offline order queue above all — and
 * asserting on them in node would either need hand-written shims per test or
 * silently skip the behaviour that matters.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['{packages,pos,frontend,self-order}/**/*.test.{ts,tsx}'],
    // The two Vue apps sit outside the yarn workspace by design (see
    // docs/design/README.md) and carry no tests of their own.
    exclude: ['**/node_modules/**', 'mosaic/**', 'urypos/**'],
  },
});
