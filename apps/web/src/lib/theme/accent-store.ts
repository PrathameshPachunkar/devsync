import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  normalizeHue,
  parseAccentSetting,
  type AccentPresetId,
  type AccentSetting,
} from "./accents";

interface AccentState {
  accent: AccentSetting;
  setPreset: (id: AccentPresetId) => void;
  setCustomHue: (hue: number) => void;
  reset: () => void;
}

/**
 * Global (per-user) accent. Persisted to localStorage under the same key the
 * pre-paint script reads. `skipHydration` keeps server and first client render
 * identical. <AccentSync /> rehydrates after mount.
 */
export const useAccentStore = create<AccentState>()(
  persist(
    (set) => ({
      accent: DEFAULT_ACCENT,
      setPreset: (id) => set({ accent: { kind: "preset", id } }),
      setCustomHue: (hue) => set({ accent: { kind: "custom", hue: normalizeHue(hue) } }),
      reset: () => set({ accent: DEFAULT_ACCENT }),
    }),
    {
      name: ACCENT_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => window.localStorage),
      skipHydration: true,
      partialize: (state) => ({ accent: state.accent }),
      // Never trust storage: invalid data falls back to the current state.
      merge: (persisted, current) => {
        const accent = parseAccentSetting((persisted as { accent?: unknown } | undefined)?.accent);
        return accent ? { ...current, accent } : current;
      },
    },
  ),
);

const subscribeHydration = (onChange: () => void) =>
  useAccentStore.persist.onFinishHydration(onChange);
const getHydrated = () => useAccentStore.persist.hasHydrated();
const getServerHydrated = () => false;

/** True once the persisted accent has been loaded on the client. */
export function useAccentHydrated(): boolean {
  return useSyncExternalStore(subscribeHydration, getHydrated, getServerHydrated);
}
