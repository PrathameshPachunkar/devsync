import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * False during SSR and hydration, true afterwards. Use it to gate UI that
 * depends on browser-only state (e.g. the resolved theme) without
 * hydration mismatches and without setState-in-effect.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
