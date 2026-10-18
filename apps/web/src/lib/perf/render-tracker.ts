/**
 * Opt-in render counter for memoization regression tests.
 *
 * Disabled by default: one global lookup per tracked render. A test (or the
 * browser console) enables it by assigning a Map:
 *   globalThis.__DEVSYNC_RENDER_COUNTS__ = new Map()
 */
declare global {
  var __DEVSYNC_RENDER_COUNTS__: Map<string, number> | undefined;
}

export function trackRender(name: string): void {
  const counts = globalThis.__DEVSYNC_RENDER_COUNTS__;
  if (counts) counts.set(name, (counts.get(name) ?? 0) + 1);
}
