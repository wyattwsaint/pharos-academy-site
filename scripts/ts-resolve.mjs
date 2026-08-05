/**
 * Let a plain `node` script import the app's TypeScript modules.
 *
 * Node 22 strips types on its own, but it does not do TypeScript's
 * `./foo.js` → `./foo.ts` resolution, and the app's modules import each other
 * with the `.js` specifiers `astro check` requires. This hook closes exactly
 * that gap: a relative specifier that does not resolve is retried once with a
 * `.ts` extension, and nothing else is touched.
 *
 * Loaded with `node --import ./scripts/ts-resolve.mjs …`. The alternative was a
 * TypeScript runner as a devDependency, for one script and thirty lines.
 */
import { registerHooks } from 'node:module';

const RELATIVE = /^\.{1,2}\//;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!RELATIVE.test(specifier) || !specifier.endsWith('.js')) {
      return nextResolve(specifier, context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
      return nextResolve(`${specifier.slice(0, -'.js'.length)}.ts`, context);
    }
  },
});
